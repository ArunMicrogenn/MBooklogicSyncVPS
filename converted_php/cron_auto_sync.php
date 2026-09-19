<?php
/**
 * BookLogic Automated Synchronization Worker (CLI / Cron / Daemon)
 * Usage:
 *   1. Linux Crontab (Run every minute):
 *      * * * * * php /var/www/html/converted_php/cron_auto_sync.php >> /var/log/booklogic_sync.log 2>&1
 *   2. CLI Background Daemon:
 *      php /var/www/html/converted_php/cron_auto_sync.php --daemon --interval=60
 */

ini_set('display_errors', 1);
ini_set('max_execution_time', 0);
date_default_timezone_set('UTC');

require_once __DIR__ . '/db.php';

$api_url = getenv('BOOKLOGIC_API_URL') ?: (defined('BOOKLOGIC_API_URL') ? BOOKLOGIC_API_URL : 'https://xrs.booklogic.net/ws/external-pms/microgenn');

// Parse CLI options
$options = getopt("", ["daemon", "interval::", "hotel::"]);
$is_daemon = isset($options['daemon']);
$interval = isset($options['interval']) ? max(10, (int)$options['interval']) : 60;
$target_hotel = $options['hotel'] ?? null;

function logCli($message, $type = 'INFO') {
    $ts = date('Y-m-d H:i:s');
    echo "[$ts][$type] $message\n";
}

function runAutoSyncCycle($pdo, $api_url, $target_hotel = null) {
    logCli("========== STARTING AUTOMATED SYNC CYCLE ==========");
    $startTime = microtime(true);
    $stats = [
        'bookings_inserted' => 0,
        'marksend_acked' => 0,
        'availability_pushed' => 0,
        'rates_pushed' => 0
    ];

    try {
        // Query Active Hotels
        $hotelQuery = "SELECT * FROM \"Mas_Hotel\" WHERE COALESCE(\"Inactive\", 0) = 0";
        if ($target_hotel) {
            $hotelQuery .= " AND \"HotelCode\" = " . $pdo->quote($target_hotel);
        }
        $hotels = $pdo->query($hotelQuery)->fetchAll(PDO::FETCH_ASSOC);

        if (empty($hotels)) {
            logCli("No active hotels found in Mas_Hotel table.", "WARN");
            return $stats;
        }

        // =========================================================================
        // PHASE 1: FETCH NEW BOOKINGS FROM BOOKLOGIC API (<syncBookingRQ>)
        // =========================================================================
        logCli("--- [PHASE 1] Fetching Bookings from BookLogic API ---");
        foreach ($hotels as $hotel) {
            $hotelCode = $hotel['HotelCode'];
            $username  = $hotel['Username'];
            $password  = $hotel['Password'];

            logCli("Querying BookLogic API for Hotel: {$hotelCode}...");

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<syncBookingRQ>\r\n<RequestorID>\r\n<UserName>{$username}</UserName>\r\n<Password>{$password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$hotelCode}</hotelCode>\r\n</syncBookingRQ>",
                CURLOPT_HTTPHEADER => ["content-type: text/xml"],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logCli("cURL error fetching bookings for {$hotelCode}: $err", "ERROR");
                continue;
            }

            $xml = @simplexml_load_string($response, 'SimpleXMLElement', LIBXML_NOCDATA);
            if (!$xml) {
                logCli("Invalid XML payload received for Hotel: {$hotelCode}", "WARN");
                continue;
            }

            $data = json_decode(json_encode($xml), true);
            $bookings = [];
            if (!empty($data['Hotel']['Booking'])) {
                $rawB = $data['Hotel']['Booking'];
                $bookings = isset($rawB['Booking_Id']) ? [$rawB] : $rawB;
            }

            logCli("Found " . count($bookings) . " booking(s) for Hotel {$hotelCode}");

            foreach ($bookings as $b) {
                $bookingId = $b['Booking_Id'] ?? null;
                $syncType  = $b['syncType'] ?? 'N';
                if (!$bookingId) continue;

                // Check duplicate
                $chk = $pdo->prepare("SELECT \"Res_id\" FROM \"Reservations\" WHERE \"Booking_Id\" = :bid AND \"syncType\" = :st LIMIT 1");
                $chk->execute([':bid' => $bookingId, ':st' => $syncType]);
                if ($chk->fetch()) {
                    continue; // Already processed
                }

                $pdo->beginTransaction();
                try {
                    $insRes = $pdo->prepare("
                        INSERT INTO \"Reservations\" (
                            \"Hotel_Code\", \"Booking_Id\", \"syncType\", \"PnrID\", \"ExternalReference\",
                            \"deposit\", \"Service\", \"TravelagentName\", \"UpdateDate\", \"Currency\",
                            \"Status\", \"Adult\", \"Remarks\", \"Insertdate\", \"MarkSend\"
                        ) VALUES (
                            :hc, :bid, :st, :pnr, :ext,
                            :dep, :srv, :ta, :ud, :curr,
                            :stat, :adult, :rem, NOW(), 0
                        ) RETURNING \"Res_id\"
                    ");
                    $insRes->execute([
                        ':hc' => $hotelCode,
                        ':bid' => $bookingId,
                        ':st' => $syncType,
                        ':pnr' => $b['PnrID'] ?? 'PNR' . rand(1000, 9999),
                        ':ext' => $b['ExternalReference'] ?? '',
                        ':dep' => (float)($b['deposit'] ?? 0),
                        ':srv' => $b['Service'] ?? '',
                        ':ta' => $b['TravelagentName'] ?? 'BookLogic OTA',
                        ':ud' => $b['UpdateDate'] ?? date('Y-m-d H:i:s'),
                        ':curr' => $b['Currency'] ?? 'USD',
                        ':stat' => $b['Status'] ?? 'Confirmed',
                        ':adult' => (int)($b['Adult'] ?? 2),
                        ':rem' => $b['Remarks'] ?? 'Auto-sync ingested'
                    ]);
                    $newResId = $insRes->fetchColumn();

                    // Insert Customer
                    if (!empty($b['Customer'])) {
                        $cust = $b['Customer'];
                        $insCust = $pdo->prepare("
                            INSERT INTO \"Reservation_Customer\" (\"Res_id\", \"FirstName\", \"LastName\", \"Email\", \"Tel\", \"Country\")
                            VALUES (:rid, :fn, :ln, :em, :tel, :cnt)
                        ");
                        $insCust->execute([
                            ':rid' => $newResId,
                            ':fn' => $cust['FirstName'] ?? 'Valued',
                            ':ln' => $cust['LastName'] ?? 'Guest',
                            ':em' => $cust['Email'] ?? 'guest@example.com',
                            ':tel' => $cust['Tel'] ?? '',
                            ':cnt' => $cust['Country'] ?? 'US'
                        ]);
                    }

                    // Insert Details
                    if (!empty($b['RoomDetails'])) {
                        $rd = isset($b['RoomDetails']['Total']) ? [$b['RoomDetails']] : $b['RoomDetails'];
                        foreach ($rd as $room) {
                            $insDet = $pdo->prepare("
                                INSERT INTO \"Reservations_details\" (
                                    \"Res_id\", \"NoofRooms\", \"RoomType\", \"Checkindate\", \"Checkoutdate\", \"Total\", \"rate_name\"
                                ) VALUES (
                                    :rid, :nr, :rt, :cin, :cout, :tot, :rn
                                )
                            ");
                            $insDet->execute([
                                ':rid' => $newResId,
                                ':nr' => (int)($room['NoofRooms'] ?? 1),
                                ':rt' => $room['RoomType'] ?? 'Deluxe',
                                ':cin' => $room['Checkindate'] ?? date('Y-m-d'),
                                ':cout' => $room['Checkoutdate'] ?? date('Y-m-d', strtotime('+3 days')),
                                ':tot' => (float)($room['Total'] ?? 150.00),
                                ':rn' => $room['rate_name'] ?? 'Standard Rate'
                            ]);
                        }
                    }

                    $pdo->commit();
                    $stats['bookings_inserted']++;
                    logCli("Successfully ingested Booking ID: {$bookingId} (Postgres Res_id: {$newResId})", "SUCCESS");
                } catch (Exception $e) {
                    $pdo->rollBack();
                    logCli("Failed to save booking {$bookingId}: " . $e->getMessage(), "ERROR");
                }
            }
        }

        // =========================================================================
        // PHASE 2: MARKSEND ACKNOWLEDGMENT (<markSendRQ>)
        // =========================================================================
        logCli("--- [PHASE 2] Processing MarkSend Acknowledgments ---");
        $pendingResStmt = $pdo->query("
            SELECT r.\"Res_id\", r.\"Booking_Id\", r.\"Hotel_Code\", r.\"PnrID\", h.\"Username\", h.\"Password\"
            FROM \"Reservations\" r
            JOIN \"Mas_Hotel\" h ON r.\"Hotel_Code\" = h.\"HotelCode\"
            WHERE COALESCE(r.\"MarkSend\", 0) = 0
            LIMIT 25
        ");
        $pendingAcks = $pendingResStmt->fetchAll(PDO::FETCH_ASSOC);

        logCli("Found " . count($pendingAcks) . " pending MarkSend acknowledgment(s)");

        foreach ($pendingAcks as $p) {
            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>{$p['Username']}</UserName>\r\n<Password>{$p['Password']}</Password>\r\n</RequestorID>\r\n<hotelCode>{$p['Hotel_Code']}</hotelCode>\r\n<PnrID>{$p['PnrID']}</PnrID>\r\n<SrvNum>{$p['Res_id']}</SrvNum>\r\n</markSendRQ>",
                CURLOPT_HTTPHEADER => ["content-type: text/xml"],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logCli("MarkSend cURL error for Booking {$p['Booking_Id']}: $err", "ERROR");
                continue;
            }

            $pdo->beginTransaction();
            $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :rid")->execute([':rid' => $p['Res_id']]);
            $pdo->prepare("
                INSERT INTO \"MarkSend_Response\" (\"Hotel_Code\", \"Booking_id\", \"Service\", \"PnrID\", \"Message\", \"Type\")
                VALUES (:hc, :bid, :srv, :pnr, 'Auto-Sync Acknowledged', 'B')
            ")->execute([
                ':hc' => $p['Hotel_Code'],
                ':bid' => $p['Booking_Id'],
                ':srv' => (string)$p['Res_id'],
                ':pnr' => $p['PnrID']
            ]);
            $pdo->commit();
            $stats['marksend_acked']++;
            logCli("MarkSend acknowledged for Booking ID: {$p['Booking_Id']}", "SUCCESS");
        }

        // =========================================================================
        // PHASE 3: PUSH ROOM AVAILABILITY (<availabilityUpdateRQ>)
        // =========================================================================
        logCli("--- [PHASE 3] Pushing Pending Room Availability ---");
        $availStmt = $pdo->query("
            SELECT a.*, h.\"Username\", h.\"Password\"
            FROM trans_roomavailability_chart_datewise a
            JOIN \"Mas_Hotel\" h ON a.hotelcode = h.\"HotelCode\"
            WHERE COALESCE(a.uploadflg, 0) = 0
            LIMIT 50
        ");
        $pendingAvail = $availStmt->fetchAll(PDO::FETCH_ASSOC);

        logCli("Found " . count($pendingAvail) . " pending availability update(s)");

        foreach ($pendingAvail as $a) {
            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<availabilityUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$a['Username']}</UserName>\r\n<Password>{$a['Password']}</Password>\r\n</RequestorID>\r\n<availInfo>\r\n<hotelCode>{$a['hotelcode']}</hotelCode>\r\n<allotmentCode>{$a['allotcode']}</allotmentCode>\r\n<fromd>{$a['fromdate']}</fromd>\r\n<tod>{$a['todate']}</tod>\r\n<allotment>{$a['Availablerooms']}</allotment>\r\n<stopSales>{$a['stopsales']}</stopSales>\r\n</availInfo>\r\n</availabilityUpdateRQ>",
                CURLOPT_HTTPHEADER => ["content-type: text/xml"],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logCli("Availability cURL error for Allotment {$a['allotcode']}: $err", "ERROR");
                continue;
            }

            // Update uploadflg = 1
            $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1 WHERE avaidd = :id")->execute([':id' => $a['avaidd']]);
            $stats['availability_pushed']++;
            logCli("Availability pushed for Allotment {$a['allotcode']} ({$a['fromdate']} -> {$a['todate']})", "SUCCESS");
        }

        // =========================================================================
        // PHASE 4: PUSH ROOM RATES (<RateUpdateRQ>)
        // =========================================================================
        logCli("--- [PHASE 4] Pushing Pending Room Rates ---");
        $ratesStmt = $pdo->query("
            SELECT r.*, h.\"Username\", h.\"Password\"
            FROM \"Trans_roomrateupdates_datewise\" r
            JOIN \"Mas_Hotel\" h ON r.\"HotelCode\" = h.\"HotelCode\"
            WHERE COALESCE(r.\"uploadflg\", 0) = 0
            LIMIT 50
        ");
        $pendingRates = $ratesStmt->fetchAll(PDO::FETCH_ASSOC);

        logCli("Found " . count($pendingRates) . " pending rate tier update(s)");

        foreach ($pendingRates as $r) {
            $comb = "<combination><adult>1</adult><price>" . (float)($r['adultprice1'] ?? 100) . "</price></combination>" .
                    "<combination><adult>2</adult><price>" . (float)($r['adultprice2'] ?? 120) . "</price></combination>" .
                    "<combination><adult>3</adult><price>" . (float)($r['adultprice3'] ?? 150) . "</price></combination>" .
                    "<combination><adult>4</adult><price>" . (float)($r['adultprice4'] ?? 180) . "</price></combination>";

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<RateUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$r['Username']}</UserName>\r\n<Password>{$r['Password']}</Password>\r\n</RequestorID>\r\n<rateInfo>\r\n<hotelCode>{$r['HotelCode']}</hotelCode>\r\n<rateId>{$r['rateid']}</rateId>\r\n<fromd>{$r['fromdate']}</fromd>\r\n<tod>{$r['todate']}</tod>\r\n<freeCancel>0</freeCancel>\r\n<clpolicy>1</clpolicy>\r\n<paypolicy>1</paypolicy>\r\n<closeout>0</closeout>\r\n<partialUpdate>2</partialUpdate>\r\n<combinations>{$comb}</combinations>\r\n</rateInfo>\r\n</RateUpdateRQ>",
                CURLOPT_HTTPHEADER => ["content-type: text/xml"],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logCli("Rate update cURL error for Rate ID {$r['rateid']}: $err", "ERROR");
                continue;
            }

            $pdo->prepare("UPDATE \"Trans_roomrateupdates_datewise\" SET \"uploadflg\" = 1 WHERE \"rateid\" = :rid")->execute([':rid' => $r['rateid']]);
            $stats['rates_pushed']++;
            logCli("Rates pushed for Rate ID {$r['rateid']} ({$r['fromdate']} -> {$r['todate']})", "SUCCESS");
        }

    } catch (Exception $e) {
        logCli("Exception in Auto-Sync Cycle: " . $e->getMessage(), "ERROR");
    }

    $elapsed = round(microtime(true) - $startTime, 2);
    logCli("========== CYCLE COMPLETE in {$elapsed}s | Ingested: {$stats['bookings_inserted']} | MarkSend: {$stats['marksend_acked']} | Avail Pushed: {$stats['availability_pushed']} | Rates Pushed: {$stats['rates_pushed']} ==========");
    return $stats;
}

// Execution Loop
if ($is_daemon) {
    logCli("Starting BookLogic Daemon mode (Interval: {$interval}s)...");
    while (true) {
        runAutoSyncCycle($pdo, $api_url, $target_hotel);
        logCli("Sleeping for {$interval} seconds before next cycle...");
        sleep($interval);
    }
} else {
    // Single Run (Ideal for Crontab)
    runAutoSyncCycle($pdo, $api_url, $target_hotel);
}
