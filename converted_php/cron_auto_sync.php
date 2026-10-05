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
$is_daemon = isset($options['daemon']) || in_array('--daemon', $argv ?? []);
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
        // Query Active Hotels from mas_hotel
        $hotelQuery = "SELECT hotelcode, username, password, COALESCE(inactive, 0) as inactive FROM mas_hotel WHERE COALESCE(inactive, 0) = 0";
        if ($target_hotel) {
            $hotelQuery .= " AND hotelcode = " . $pdo->quote($target_hotel);
        }
        $hotels = $pdo->query($hotelQuery)->fetchAll(PDO::FETCH_ASSOC);

        if (empty($hotels)) {
            logCli("No active hotels found in mas_hotel table.", "WARN");
            return $stats;
        }

        // =========================================================================
        // PHASE 1: FETCH ALL BOOKINGS IN QUEUE (<syncBookingRQ> + Instant <markSendRQ>)
        // =========================================================================
        logCli("--- [PHASE 1] Fetching Bookings from BookLogic API ---");
        foreach ($hotels as $hotel) {
            $hotelCode = $hotel['hotelcode'] ?? $hotel['HotelCode'];
            $username  = $hotel['username'] ?? $hotel['Username'];
            $password  = $hotel['password'] ?? $hotel['Password'];

            logCli("Querying BookLogic API for Hotel: {$hotelCode}...");

            $maxQueueIterations = 50; // Safety limit per cycle
            $iteration = 0;

            while ($iteration < $maxQueueIterations) {
                $iteration++;
                $curl = curl_init();
                curl_setopt_array($curl, [
                    CURLOPT_URL => $api_url,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 35,
                    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                    CURLOPT_CUSTOMREQUEST => "POST",
                    CURLOPT_POSTFIELDS => "<syncBookingRQ>\r\n<RequestorID>\r\n<UserName>{$username}</UserName>\r\n<Password>{$password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$hotelCode}</hotelCode>\r\n</syncBookingRQ>",
                    CURLOPT_HTTPHEADER => ["content-type: text/xml; charset=utf-8"],
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => false,
                ]);
                $response = curl_exec($curl);
                $err = curl_error($curl);
                curl_close($curl);

                if ($err) {
                    logCli("cURL error fetching bookings for {$hotelCode}: $err", "ERROR");
                    break;
                }

                $xml = @simplexml_load_string($response, 'SimpleXMLElement', LIBXML_NOCDATA);
                if (!$xml) {
                    logCli("Invalid or empty XML payload received for Hotel: {$hotelCode}", "WARN");
                    break;
                }

                // Extract bookings flexibly regardless of XML root/hierarchy variations
                $bookingsList = [];
                if (isset($xml->Hotel->Bookings->Booking)) {
                    $bookingsList = $xml->Hotel->Bookings->Booking;
                } elseif (isset($xml->Hotel->Booking)) {
                    $bookingsList = $xml->Hotel->Booking;
                } elseif (isset($xml->Bookings->Booking)) {
                    $bookingsList = $xml->Bookings->Booking;
                }

                $foundCount = count($bookingsList);
                if ($foundCount === 0) {
                    logCli("No more pending bookings in BookLogic queue for Hotel {$hotelCode}.");
                    break;
                }

                logCli("Found {$foundCount} booking(s) in batch #{$iteration} for Hotel {$hotelCode}");

                foreach ($bookingsList as $b) {
                    $bAttrs = $b->attributes();
                    $bookingId = (string)($bAttrs['id'] ?? $bAttrs['Booking_Id'] ?? $b->Booking_Id ?? $b->id ?? '');
                    $syncType  = (string)($b->syncType ?? 'NEW');
                    if (!$bookingId) continue;

                    $pnrId      = (string)($b->PnrID ?? '');
                    $extRef     = (string)($b->ExternalReference ?? '');
                    $extResRoomId = (string)($b->ExternalReservationRoomId ?? '');
                    $extResId   = (string)($b->ExternalReservationId ?? '');
                    $deposit    = (float)($b->deposit ?? 0);
                    $service    = (string)($b->Service ?? '');
                    $agentName  = (string)($b->TravelagentName ?? $b->TravelagentCode ?? 'BookLogic OTA');
                    $updateDate = (string)($b->UpdateDate ?? date('Y-m-d H:i:s'));
                    $modifyDate = (string)($b->modifyDate ?? $b->ModifyDate ?? $b->modify_date ?? $b->UpdateDate ?? date('Y-m-d H:i:s'));
                    if (empty(trim($modifyDate))) {
                        $modifyDate = $updateDate ?: date('Y-m-d H:i:s');
                    }
                    $cancelDate = (string)($b->cancelDate ?? $b->CancelDate ?? '');
                    $currency   = (string)($b->Currency ?? 'USD');
                    $status     = (string)($b->Status ?? 'Confirmed');
                    $adult      = (int)($b->Adult ?? 2);
                    $childB     = (string)($b->ChildB ?? '0');
                    $childA     = (string)($b->ChildA ?? '0');
                    $infant     = (string)($b->Infant ?? '0');
                    $remarks    = (string)($b->Remarks ?? 'BookLogic Live Ingest');

                    // Check duplicate
                    $chk = $pdo->prepare("SELECT \"Res_id\" FROM \"Reservations\" WHERE \"Booking_Id\" = :bid AND \"syncType\" = :st LIMIT 1");
                    $chk->execute([':bid' => $bookingId, ':st' => $syncType]);
                    $existingResId = $chk->fetchColumn();

                    $newResId = $existingResId;

                    if (!$existingResId) {
                        $pdo->beginTransaction();
                        try {
                            $insRes = $pdo->prepare("
                                INSERT INTO \"Reservations\" (
                                    \"Hotel_Code\", \"Booking_Id\", \"syncType\", \"PnrID\", \"ExternalReference\",
                                    \"ExternalReservationRoomId\", \"ExternalReservationId\", \"deposit\", \"Service\",
                                    \"TravelagentName\", \"UpdateDate\", \"modifyDate\", \"cancelDate\", \"Currency\",
                                    \"Status\", \"Adult\", \"ChildB\", \"ChildA\", \"Infant\", \"Remarks\", \"Insertdate\", \"MarkSend\"
                                ) VALUES (
                                    :hc, :bid, :st, :pnr, :ext,
                                    :exrrid, :exrid, :dep, :srv,
                                    :ta, :ud, :md, :cd, :curr,
                                    :stat, :adult, :cb, :ca, :inf, :rem, NOW(), 0
                                ) RETURNING \"Res_id\"
                            ");
                            $insRes->execute([
                                ':hc'     => $hotelCode,
                                ':bid'    => $bookingId,
                                ':st'     => $syncType,
                                ':pnr'    => $pnrId,
                                ':ext'    => $extRef,
                                ':exrrid' => $extResRoomId,
                                ':exrid'  => $extResId,
                                ':dep'    => $deposit,
                                ':srv'    => $service,
                                ':ta'     => $agentName,
                                ':ud'     => $updateDate,
                                ':md'     => $modifyDate,
                                ':cd'     => $cancelDate,
                                ':curr'   => $currency,
                                ':stat'   => $status,
                                ':adult'  => $adult,
                                ':cb'     => $childB,
                                ':ca'     => $childA,
                                ':inf'    => $infant,
                                ':rem'    => $remarks
                            ]);
                            $newResId = $insRes->fetchColumn();

                            // 2. Insert Customer linked with Res_id
                            if (isset($b->CL) || isset($b->Customer)) {
                                $cust = $b->CL ?? $b->Customer;
                                $insCust = $pdo->prepare("
                                    INSERT INTO \"Reservation_Customer\" (
                                        \"Res_id\", \"FirstName\", \"LastName\", \"Email\", \"Tel\",
                                        \"address\", \"zip\", \"Location\", \"Country\"
                                    ) VALUES (
                                        :rid, :fn, :ln, :em, :tel,
                                        :addr, :zip, :loc, :cnt
                                    )
                                ");
                                $insCust->execute([
                                    ':rid'  => $newResId,
                                    ':fn'   => (string)($cust->FirstName ?? 'Valued'),
                                    ':ln'   => (string)($cust->LastName ?? 'Guest'),
                                    ':em'   => (string)($cust->Email ?? ''),
                                    ':tel'  => (string)($cust->Tel ?? ''),
                                    ':addr' => (string)($cust->address ?? ''),
                                    ':zip'  => (string)($cust->zip ?? ''),
                                    ':loc'  => (string)($cust->Location ?? ''),
                                    ':cnt'  => (string)($cust->Country ?? '')
                                ]);
                            }

                            // 3. Insert into reservations_details_booklogic and Reservations_details linked with Res_id
                            $roomsList = [];
                            if (isset($b->RoomDetails)) {
                                $roomsList = is_array($b->RoomDetails) ? $b->RoomDetails : [$b->RoomDetails];
                            } elseif (isset($b->Rooms) || isset($b->Room)) {
                                $roomsList = [$b];
                            }

                            foreach ($roomsList as $room) {
                                $rAttrs = is_object($room) ? $room->attributes() : [];
                                $rateAttrs = isset($room->rate) && is_object($room->rate) ? $room->rate->attributes() : [];
                                $allotAttrs = isset($room->allot) && is_object($room->allot) ? $room->allot->attributes() : [];
                                $rmNameAttrs = isset($room->rmName) && is_object($room->rmName) ? $room->rmName->attributes() : [];

                                // Insert into reservations_details_booklogic
                                try {
                                    $insDetBL = $pdo->prepare("
                                        INSERT INTO reservations_details_booklogic (
                                            res_id, noofrooms, roomtype, checkindate, checkoutdate,
                                            netprice, roomtotal, extrastotal, mealtotal, total,
                                            taxincluded, taxexcluded, rate_name, rate_id, availability_id,
                                            availability_name, room_id, room_name, insertdate
                                        ) VALUES (
                                            :rid, :nr, :rt, :cin, :cout,
                                            :np, :rtot, :extot, :mtot, :tot,
                                            :tinc, :texc, :rname, :ridx, :avid,
                                            :avname, :rmid, :rmname, NOW()
                                        )
                                    ");
                                    $insDetBL->execute([
                                        ':rid'    => $newResId,
                                        ':nr'     => (string)($room->Rooms ?? $room->NoofRooms ?? '1'),
                                        ':rt'     => (string)($room->Room ?? $room->RoomType ?? ''),
                                        ':cin'    => (string)($room->Checkin ?? $room->Checkindate ?? date('Y-m-d')),
                                        ':cout'   => (string)($room->Checkout ?? $room->Checkoutdate ?? date('Y-m-d', strtotime('+1 day'))),
                                        ':np'     => (string)($room->Netprice ?? '0'),
                                        ':rtot'   => (string)($room->roomTotal ?? $room->RoomTotal ?? '0'),
                                        ':extot'  => (string)($room->ExtrasTotal ?? '0'),
                                        ':mtot'   => (string)($room->MealTotal ?? '0'),
                                        ':tot'    => (string)($room->Total ?? $room->RoomTotal ?? '0'),
                                        ':tinc'   => (string)($room->TaxIncluded ?? '0'),
                                        ':texc'   => (string)($room->TaxExcluded ?? '0'),
                                        ':rname'  => (string)($room->rate ?? $room->rate_name ?? ''),
                                        ':ridx'   => (string)($rateAttrs['id'] ?? $room->rate_id ?? ''),
                                        ':avid'   => (string)($allotAttrs['id'] ?? $room->Availability_id ?? ''),
                                        ':avname' => (string)($room->allot ?? $room->Availability_name ?? ''),
                                        ':rmid'   => (string)($rmNameAttrs['id'] ?? $room->Room_Id ?? ''),
                                        ':rmname' => (string)($room->rmName ?? $room->Room_Name ?? '')
                                    ]);
                                } catch (Exception $eBL) {
                                    // Fallback / legacy table
                                }

                                try {
                                    $insDet = $pdo->prepare("
                                        INSERT INTO \"Reservations_details\" (
                                            \"Res_id\", \"NoofRooms\", \"RoomType\", \"Checkindate\", \"Checkoutdate\",
                                            \"Netprice\", \"RoomTotal\", \"ExtrasTotal\", \"MealTotal\", \"Total\",
                                            \"TaxIncluded\", \"TaxExcluded\", \"rate_name\", \"rate_id\", \"Availability_id\",
                                            \"Availability_name\", \"Room_Id\", \"Room_Name\"
                                        ) VALUES (
                                            :rid, :nr, :rt, :cin, :cout,
                                            :np, :rtot, :extot, :mtot, :tot,
                                            :tinc, :texc, :rname, :ridx, :avid,
                                            :avname, :rmid, :rmname
                                        )
                                    ");
                                    $insDet->execute([
                                        ':rid'    => $newResId,
                                        ':nr'     => (string)($room->Rooms ?? $room->NoofRooms ?? '1'),
                                        ':rt'     => (string)($room->Room ?? $room->RoomType ?? ''),
                                        ':cin'    => (string)($room->Checkin ?? $room->Checkindate ?? date('Y-m-d')),
                                        ':cout'   => (string)($room->Checkout ?? $room->Checkoutdate ?? date('Y-m-d', strtotime('+1 day'))),
                                        ':np'     => (string)($room->Netprice ?? '0'),
                                        ':rtot'   => (string)($room->roomTotal ?? $room->RoomTotal ?? '0'),
                                        ':extot'  => (string)($room->ExtrasTotal ?? '0'),
                                        ':mtot'   => (string)($room->MealTotal ?? '0'),
                                        ':tot'    => (string)($room->Total ?? $room->RoomTotal ?? '0'),
                                        ':tinc'   => (string)($room->TaxIncluded ?? '0'),
                                        ':texc'   => (string)($room->TaxExcluded ?? '0'),
                                        ':rname'  => (string)($room->rate ?? $room->rate_name ?? ''),
                                        ':ridx'   => (string)($rateAttrs['id'] ?? $room->rate_id ?? ''),
                                        ':avid'   => (string)($allotAttrs['id'] ?? $room->Availability_id ?? ''),
                                        ':avname' => (string)($room->allot ?? $room->Availability_name ?? ''),
                                        ':rmid'   => (string)($rmNameAttrs['id'] ?? $room->Room_Id ?? ''),
                                        ':rmname' => (string)($room->rmName ?? $room->Room_Name ?? '')
                                    ]);
                                } catch (Exception $eDet) {
                                    // Ignored if table name differs
                                }
                            }

                            // 4. Insert reservation_perday_details_booklogic and Reservation_PerDay_details linked with Res_id
                            if (isset($b->PerDay)) {
                                $perDayList = [];
                                if (is_array($b->PerDay)) {
                                    $perDayList = $b->PerDay;
                                } elseif ($b->PerDay instanceof SimpleXMLElement) {
                                    foreach ($b->PerDay as $pd) {
                                        $perDayList[] = $pd;
                                    }
                                }

                                if (!empty($perDayList)) {
                                    foreach ($perDayList as $pItem) {
                                        $pdAttrs = is_object($pItem) ? $pItem->attributes() : [];
                                        $pDate   = (string)($pdAttrs['date'] ?? ($pItem['date'] ?? ''));
                                        $pRmNo   = (string)($pdAttrs['rm_no'] ?? ($pItem['rm_no'] ?? '1'));
                                        $pPrice  = (string)($pItem->Price ?? ($pItem['Price'] ?? '0'));

                                        // Insert into reservation_perday_details_booklogic
                                        try {
                                            $insPerDayBL = $pdo->prepare("
                                                INSERT INTO reservation_perday_details_booklogic (hotel_code, booking_id, date, rm_no, price, res_id, insertdate)
                                                VALUES (:hc, :bid, :dt, :rmno, :price, :rid, NOW())
                                            ");
                                            $insPerDayBL->execute([
                                                ':hc'    => $hotelCode,
                                                ':bid'   => $bookingId,
                                                ':dt'    => $pDate,
                                                ':rmno'  => $pRmNo,
                                                ':price' => $pPrice,
                                                ':rid'   => $newResId
                                            ]);
                                        } catch (Exception $ePBL) {
                                            // Fallback
                                        }

                                        try {
                                            $insPerDay = $pdo->prepare("
                                                INSERT INTO \"Reservation_PerDay_details\" (\"Hotel_Code\", \"Booking_Id\", \"Date\", \"rm_no\", \"Price\", \"Res_id\")
                                                VALUES (:hc, :bid, :dt, :rmno, :price, :rid)
                                            ");
                                            $insPerDay->execute([
                                                ':hc'    => $hotelCode,
                                                ':bid'   => $bookingId,
                                                ':dt'    => $pDate,
                                                ':rmno'  => $pRmNo,
                                                ':price' => $pPrice,
                                                ':rid'   => $newResId
                                            ]);
                                        } catch (Exception $ePD) {
                                            // Ignored if table name differs
                                        }
                                    }
                                }
                            }

                            $pdo->commit();
                            $stats['bookings_inserted']++;
                            logCli("Successfully ingested Booking ID: {$bookingId} (Postgres Res_id: {$newResId})", "SUCCESS");
                        } catch (Exception $e) {
                            $pdo->rollBack();
                            logCli("Failed to save booking {$bookingId}: " . $e->getMessage(), "ERROR");
                        }
                    } else {
                        logCli("Booking [{$bookingId}] already in database (Res_id: {$existingResId}).");
                    }

                    // Acknowledge immediately to BookLogic so it advances the queue
                    if ($pnrId && $newResId) {
                        $Res_id = $newResId;
                        $PnrID  = $pnrId;
                        $curl = curl_init();
                        curl_setopt_array($curl, array(
                            CURLOPT_URL => $api_url,
                            CURLOPT_RETURNTRANSFER => true,
                            CURLOPT_ENCODING => "",
                            CURLOPT_MAXREDIRS => 10,
                            CURLOPT_TIMEOUT => 30,
                            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                            CURLOPT_CUSTOMREQUEST => "POST",
                            CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>$username</UserName>\r\n<Password>$password</Password>\r\n</RequestorID>\r\n<hotelCode>$hotelCode</hotelCode>\r\n<PnrID>$PnrID</PnrID>\r\n<SrvNum>$Res_id</SrvNum>\r\n</markSendRQ>",
                            CURLOPT_HTTPHEADER => array(
                                "cache-control: no-cache",
                                "postman-token: 49febbc8-8756-79b6-1074-cbcc1d6369f3"
                            ),
                        ));
                        $markResp = curl_exec($curl);
                        $err = curl_error($curl);
                        curl_close($curl);

                        $msg = $err ? ("cURL Error: " . $err) : substr(strip_tags((string)$markResp), 0, 950);
                        if (empty($msg)) $msg = 'MarkSend Transmitted';

                        // Insert into public.marksend_response
                        $pdo->prepare("
                            INSERT INTO public.marksend_response (hotel_code, booking_id, service, pnrid, message, type, insertdate)
                            VALUES (:hc, :bid, :srv, :pnr, :msg, :type, NOW())
                        ")->execute([
                            ':hc'   => $hotelCode,
                            ':bid'  => $bookingId,
                            ':srv'  => (string)$Res_id,
                            ':pnr'  => $PnrID,
                            ':msg'  => $msg,
                            ':type' => $err ? 'E' : 'B'
                        ]);

                        $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :rid")->execute([':rid' => $Res_id]);
                        $stats['marksend_acked']++;
                        logCli("MarkSend acknowledged & inserted to marksend_response for PnrID: {$PnrID} (Res_id: {$Res_id})", "SUCCESS");
                    }
                }
            }
        }

        // =========================================================================
        // PHASE 2: MARKSEND ACKNOWLEDGMENT (<markSendRQ>)
        // =========================================================================
        logCli("--- [PHASE 2] Processing MarkSend Acknowledgments ---");
        $pendingResStmt = $pdo->query("
            SELECT r.\"Res_id\", r.\"Booking_Id\", r.\"Hotel_Code\", r.\"PnrID\", h.username, h.password
            FROM \"Reservations\" r
            JOIN mas_hotel h ON r.\"Hotel_Code\" = h.hotelcode
            WHERE COALESCE(r.\"MarkSend\", 0) = 0
            LIMIT 25
        ");
        $pendingAcks = $pendingResStmt->fetchAll(PDO::FETCH_ASSOC);

        logCli("Found " . count($pendingAcks) . " pending MarkSend acknowledgment(s)");

        foreach ($pendingAcks as $p) {
            $Res_id    = $p['Res_id'];
            $PnrID     = $p['PnrID'];
            $UserName  = $p['username'];
            $Password  = $p['password'];
            $HotelCode = $p['Hotel_Code'];

            $curl = curl_init();
            curl_setopt_array($curl, array(
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => "",
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>$UserName</UserName>\r\n<Password>$Password</Password>\r\n</RequestorID>\r\n<hotelCode>$HotelCode</hotelCode>\r\n<PnrID>$PnrID</PnrID>\r\n<SrvNum>$Res_id</SrvNum>\r\n</markSendRQ>",
                CURLOPT_HTTPHEADER => array(
                    "cache-control: no-cache",
                    "postman-token: 49febbc8-8756-79b6-1074-cbcc1d6369f3"
                ),
            ));
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            $msg = $err ? ("cURL Error: " . $err) : substr(strip_tags((string)$response), 0, 950);
            if (empty($msg)) $msg = 'MarkSend Transmitted';

            $pdo->beginTransaction();
            $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :rid")->execute([':rid' => $Res_id]);
            $pdo->prepare("
                INSERT INTO public.marksend_response (hotel_code, booking_id, service, pnrid, message, type, insertdate)
                VALUES (:hc, :bid, :srv, :pnr, :msg, :type, NOW())
            ")->execute([
                ':hc'   => $HotelCode,
                ':bid'  => $p['Booking_Id'],
                ':srv'  => (string)$Res_id,
                ':pnr'  => $PnrID,
                ':msg'  => $msg,
                ':type' => $err ? 'E' : 'B'
            ]);
            $pdo->commit();
            $stats['marksend_acked']++;
            logCli("MarkSend recorded in marksend_response for Booking ID: {$p['Booking_Id']} (Res_id: {$Res_id})", "SUCCESS");
        }

        // =========================================================================
        // PHASE 3: PUSH ROOM AVAILABILITY (<availabilityUpdateRQ>)
        // =========================================================================
        logCli("--- [PHASE 3] Pushing Pending Room Availability ---");
        $availStmt = $pdo->query("
            SELECT a.*, h.username, h.password
            FROM trans_roomavailability_chart_datewise a
            JOIN mas_hotel h ON a.hotelcode = h.hotelcode
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
                CURLOPT_POSTFIELDS => "<availabilityUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$a['username']}</UserName>\r\n<Password>{$a['password']}</Password>\r\n</RequestorID>\r\n<availInfo>\r\n<hotelCode>{$a['hotelcode']}</hotelCode>\r\n<allotmentCode>{$a['allotcode']}</allotmentCode>\r\n<fromd>{$a['fromdate']}</fromd>\r\n<tod>{$a['todate']}</tod>\r\n<allotment>{$a['Availablerooms']}</allotment>\r\n<stopSales>{$a['stopsales']}</stopSales>\r\n</availInfo>\r\n</availabilityUpdateRQ>",
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
            SELECT r.*, h.username, h.password
            FROM \"Trans_roomrateupdates_datewise\" r
            JOIN mas_hotel h ON r.\"HotelCode\" = h.hotelcode
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
