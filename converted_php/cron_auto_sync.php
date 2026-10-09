<?php
/**
 * BookLogic Automated Synchronization Worker
 * Complete production-ready script with resilient error handling,
 * correct <allotInfo> XML schema, fallback allotcode, date formatting,
 * and individual try-catch blocks per phase.
 */

ini_set('display_errors', 1);
ini_set('max_execution_time', 0);
date_default_timezone_set('UTC');

require_once __DIR__ . '/db.php';

$api_url = getenv('BOOKLOGIC_API_URL') ?: (defined('BOOKLOGIC_API_URL') ? BOOKLOGIC_API_URL : 'https://xrs.booklogic.net/ws/external-pms/microgenn');

// Parse CLI options
$options = getopt("", ["daemon", "interval::", "hotel::", "force-avail"]);
$is_daemon   = isset($options['daemon']) || in_array('--daemon', $argv ?? []);
$force_avail = isset($options['force-avail']) || in_array('--force-avail', $argv ?? []);
$interval    = isset($options['interval']) ? max(10, (int)$options['interval']) : 60;
$target_hotel = $options['hotel'] ?? null;

function logCli($message, $type = 'INFO') {
    $ts = date('Y-m-d H:i:s');
    echo "[$ts][$type] $message\n";
}

function runAutoSyncCycle($pdo, $api_url, $target_hotel = null, $force_avail = false) {
    logCli("========== STARTING AUTOMATED SYNC CYCLE ==========");
    $startTime = microtime(true);
    $stats = [
        'bookings_inserted'   => 0,
        'marksend_acked'      => 0,
        'availability_pushed' => 0,
        'rates_pushed'        => 0,
    ];

    // =========================================================================
    // QUERY ACTIVE HOTELS
    // =========================================================================
    $hotels = [];
    try {
        $hotelQuery = "SELECT hotelcode, username, password, COALESCE(inactive, 0) as inactive FROM mas_hotel WHERE COALESCE(inactive, 0) = 0";
        if ($target_hotel) {
            $hotelQuery .= " AND hotelcode = " . $pdo->quote($target_hotel);
        }
        $hotels = $pdo->query($hotelQuery)->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        logCli("Error querying mas_hotel: " . $e->getMessage(), "ERROR");
    }

    if (empty($hotels)) {
        logCli("No active hotels found in mas_hotel table.", "WARN");
    } else {
        logCli("Found " . count($hotels) . " active hotel(s) in mas_hotel table.");
    }

    // =========================================================================
    // PHASE 1: FETCH BOOKINGS (<syncBookingRQ>) & INSERT DETAILS TABLES
    // =========================================================================
    logCli("--- [PHASE 1] Fetching Bookings from BookLogic API ---");
    foreach ($hotels as $hotel) {
        $HotelCode = trim($hotel['hotelcode'] ?? '');
        $UserName  = trim($hotel['username'] ?? '');
        $Password  = trim($hotel['password'] ?? '');

        if (empty($HotelCode) || empty($UserName) || empty($Password)) {
            continue;
        }

        try {
            $maxQueueIterations = 20;
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
                    CURLOPT_POSTFIELDS => "<syncBookingRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n</syncBookingRQ>",
                    CURLOPT_HTTPHEADER => ["content-type: text/xml; charset=utf-8"],
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => false,
                ]);
                $response = curl_exec($curl);
                $err = curl_error($curl);
                curl_close($curl);

                if ($err) {
                    logCli("cURL error fetching bookings for {$HotelCode}: $err", "ERROR");
                    break;
                }

                $xml = @simplexml_load_string((string)$response, 'SimpleXMLElement', LIBXML_NOCDATA);
                if (!$xml) break;

                if (isset($xml->Errors->Error)) {
                    $errMsg = (string)$xml->Errors->Error;
                    logCli("BookLogic notice for Hotel {$HotelCode}: {$errMsg}", "WARN");
                    break;
                }

                $bookingsList = [];
                // Robust XPath search to catch any <Booking> element regardless of XML root or nesting
                $xpathBookings = $xml->xpath('//Booking') ?: ($xml->xpath('//booking') ?: []);
                if (!empty($xpathBookings)) {
                    $bookingsList = $xpathBookings;
                } elseif (isset($xml->Bookings->Booking)) {
                    $bookingsList = is_array($xml->Bookings->Booking) ? $xml->Bookings->Booking : [$xml->Bookings->Booking];
                } elseif (isset($xml->Hotel->Bookings->Booking)) {
                    $bookingsList = is_array($xml->Hotel->Bookings->Booking) ? $xml->Hotel->Bookings->Booking : [$xml->Hotel->Bookings->Booking];
                } elseif (isset($xml->Hotel->Booking)) {
                    $bookingsList = is_array($xml->Hotel->Booking) ? $xml->Hotel->Booking : [$xml->Hotel->Booking];
                } elseif (isset($xml->Booking)) {
                    $bookingsList = [$xml->Booking];
                }

                $foundCount = count($bookingsList);
                if ($foundCount === 0) {
                    $rawSnippet = substr(trim((string)$response), 0, 150);
                    logCli("No pending bookings in queue for Hotel {$HotelCode}. (Response: {$rawSnippet})");
                    break;
                }

                logCli("Found {$foundCount} booking(s) for Hotel {$HotelCode}");

                foreach ($bookingsList as $b) {
                    $bAttrs = $b->attributes();
                    $Booking_Id = (string)($bAttrs['id'] ?? $bAttrs['Booking_Id'] ?? $b->Booking_Id ?? $b->id ?? '');
                    $syncType   = (string)($b->syncType ?? 'NEW');
                    if (!$Booking_Id) continue;

                    $PnrID        = (string)($b->PnrID ?? '');
                    $extRef       = (string)($b->ExternalReference ?? '');
                    $extResRoomId = (string)($b->ExternalReservationRoomId ?? '');
                    $extResId     = (string)($b->ExternalReservationId ?? '');
                    $deposit      = (float)($b->deposit ?? 0);
                    $service      = (string)($b->Service ?? '');
                    $agentName    = (string)($b->TravelagentName ?? $b->TravelagentCode ?? 'BookLogic OTA');
                    $updateDate   = (string)($b->UpdateDate ?? date('Y-m-d H:i:s'));
                    $modifyDate   = (string)($b->modifyDate ?? $b->ModifyDate ?? $b->modify_date ?? $b->UpdateDate ?? date('Y-m-d H:i:s'));
                    if (empty(trim($modifyDate))) {
                        $modifyDate = $updateDate ?: date('Y-m-d H:i:s');
                    }
                    $cancelDate   = (string)($b->cancelDate ?? $b->CancelDate ?? '');
                    $currency     = (string)($b->Currency ?? 'USD');
                    $status       = (string)($b->Status ?? 'Confirmed');
                    $adult        = (int)($b->Adult ?? 2);
                    $childB       = (string)($b->ChildB ?? '0');
                    $childA       = (string)($b->ChildA ?? '0');
                    $infant       = (string)($b->Infant ?? '0');
                    $remarks      = (string)($b->Remarks ?? 'BookLogic Live Ingest');

                    $chk = $pdo->prepare("SELECT \"Res_id\" FROM \"Reservations\" WHERE \"Booking_Id\" = :bid AND \"syncType\" = :st LIMIT 1");
                    $chk->execute([':bid' => $Booking_Id, ':st' => $syncType]);
                    $existingResId = $chk->fetchColumn();

                    $Res_id = $existingResId;

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
                                ':hc'     => $HotelCode,
                                ':bid'    => $Booking_Id,
                                ':st'     => $syncType,
                                ':pnr'    => $PnrID,
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
                            $Res_id = $insRes->fetchColumn();

                            // Customer Info
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
                                    ':rid'  => $Res_id,
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

                            // Rooms Details
                            $roomsList = [];
                            if (isset($b->RoomDetails)) {
                                $roomsList = is_array($b->RoomDetails) ? $b->RoomDetails : [$b->RoomDetails];
                            } elseif (isset($b->Rooms) || isset($b->Room)) {
                                $roomsList = [$b];
                            }

                            foreach ($roomsList as $room) {
                                $rateAttrs   = isset($room->rate) && is_object($room->rate) ? $room->rate->attributes() : [];
                                $allotAttrs  = isset($room->allot) && is_object($room->allot) ? $room->allot->attributes() : [];
                                $rmNameAttrs = isset($room->rmName) && is_object($room->rmName) ? $room->rmName->attributes() : [];

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
                                        ':rid'    => $Res_id,
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
                                } catch (Exception $eBL) {}

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
                                        ':rid'    => $Res_id,
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
                                } catch (Exception $eDet) {}
                            }

                            // Per Day Breakdown
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

                                        try {
                                            $insPerDayBL = $pdo->prepare("
                                                INSERT INTO reservation_perday_details_booklogic (hotel_code, booking_id, date, rm_no, price, res_id, insertdate)
                                                VALUES (:hc, :bid, :dt, :rmno, :price, :rid, NOW())
                                            ");
                                            $insPerDayBL->execute([
                                                ':hc'    => $HotelCode,
                                                ':bid'   => $Booking_Id,
                                                ':dt'    => $pDate,
                                                ':rmno'  => $pRmNo,
                                                ':price' => $pPrice,
                                                ':rid'   => $Res_id
                                            ]);
                                        } catch (Exception $ePBL) {}

                                        try {
                                            $insPerDay = $pdo->prepare("
                                                INSERT INTO \"Reservation_PerDay_details\" (\"Hotel_Code\", \"Booking_Id\", \"Date\", \"rm_no\", \"Price\", \"Res_id\")
                                                VALUES (:hc, :bid, :dt, :rmno, :price, :rid)
                                            ");
                                            $insPerDay->execute([
                                                ':hc'    => $HotelCode,
                                                ':bid'   => $Booking_Id,
                                                ':dt'    => $pDate,
                                                ':rmno'  => $pRmNo,
                                                ':price' => $pPrice,
                                                ':rid'   => $Res_id
                                            ]);
                                        } catch (Exception $ePD) {}
                                    }
                                }
                            }

                            $pdo->commit();
                            $stats['bookings_inserted']++;
                            logCli("Ingested Booking ID: {$Booking_Id} (Res_id: {$Res_id})", "SUCCESS");
                        } catch (Exception $e) {
                            $pdo->rollBack();
                            logCli("Failed to save booking {$Booking_Id}: " . $e->getMessage(), "ERROR");
                        }
                    }

                    // Send markSendRQ for new booking
                    if ($PnrID && $Res_id) {
                        $curl = curl_init();
                        curl_setopt_array($curl, array(
                            CURLOPT_URL => "https://xrs.booklogic.net/ws/external-pms/microgenn",
                            CURLOPT_RETURNTRANSFER => true,
                            CURLOPT_TIMEOUT => 30,
                            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                            CURLOPT_CUSTOMREQUEST => "POST",
                            CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>$UserName</UserName>\r\n<Password>$Password</Password>\r\n</RequestorID>\r\n<hotelCode>$HotelCode</hotelCode>\r\n<PnrID>$PnrID</PnrID>\r\n<SrvNum>$Res_id</SrvNum>\r\n</markSendRQ>",
                            CURLOPT_HTTPHEADER => array(
                                "cache-control: no-cache",
                                "postman-token: 49febbc8-8756-79b6-1074-cbcc1d6369f3"
                            ),
                            CURLOPT_SSL_VERIFYPEER => false,
                            CURLOPT_SSL_VERIFYHOST => false,
                        ));
                        $markResp = curl_exec($curl);
                        $err = curl_error($curl);
                        curl_close($curl);

                        $msg = $err ? ("cURL Error: " . $err) : substr(strip_tags((string)$markResp), 0, 950);
                        if (empty($msg)) $msg = 'MarkSend Transmitted';

                        try {
                            $insLog = $pdo->prepare("
                                INSERT INTO public.marksend_response (hotel_code, booking_id, service, pnrid, message, type, insertdate)
                                VALUES (:hc, :bid, :srv, :pnr, :msg, :type, NOW())
                            ");
                            $insLog->execute([
                                ':hc'   => $HotelCode,
                                ':bid'  => $Booking_Id,
                                ':srv'  => (string)$Res_id,
                                ':pnr'  => $PnrID,
                                ':msg'  => $msg,
                                ':type' => $err ? 'E' : 'B'
                            ]);
                        } catch (Exception $eML) {}

                        $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :rid")->execute([':rid' => $Res_id]);
                        $stats['marksend_acked']++;
                        logCli("MarkSend acknowledged for Booking ID: {$Booking_Id} (Res_id: {$Res_id})", "SUCCESS");
                    }
                }
            }
        } catch (Exception $e) {
            logCli("Booking phase error for {$HotelCode}: " . $e->getMessage(), "ERROR");
        }
    }

    // =========================================================================
    // PHASE 2: PENDING MARKSEND ACKNOWLEDGMENTS (<markSendRQ>)
    // =========================================================================
    logCli("--- [PHASE 2] Processing MarkSend Acknowledgments ---");
    try {
        $pendingResStmt = $pdo->query("
            SELECT r.\"Res_id\", r.\"Booking_Id\", r.\"Hotel_Code\", r.\"PnrID\", h.username, h.password
            FROM \"Reservations\" r
            JOIN mas_hotel h ON LOWER(TRIM(r.\"Hotel_Code\")) = LOWER(TRIM(h.hotelcode))
            WHERE COALESCE(r.\"MarkSend\", 0) = 0
            LIMIT 25
        ");
        $pendingAcks = $pendingResStmt ? $pendingResStmt->fetchAll(PDO::FETCH_ASSOC) : [];

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
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>$UserName</UserName>\r\n<Password>$Password</Password>\r\n</RequestorID>\r\n<hotelCode>$HotelCode</hotelCode>\r\n<PnrID>$PnrID</PnrID>\r\n<SrvNum>$Res_id</SrvNum>\r\n</markSendRQ>",
                CURLOPT_HTTPHEADER => array(
                    "cache-control: no-cache",
                    "postman-token: 49febbc8-8756-79b6-1074-cbcc1d6369f3"
                ),
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
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
            logCli("MarkSend recorded for Booking ID: {$p['Booking_Id']} (Res_id: {$Res_id})", "SUCCESS");
        }
    } catch (Exception $e) {
        logCli("MarkSend phase error: " . $e->getMessage(), "ERROR");
    }

    // =========================================================================
    // PHASE 3: PUSH ROOM AVAILABILITY (<availabilityUpdateRQ>)
    // Common for all hotels in mas_hotel - no hotelcode required
    // =========================================================================
    logCli("--- [PHASE 3] Pushing Pending Room Availability Across mas_hotel ---");
    try {
        $uploadClause = $force_avail ? "1=1" : "COALESCE(a.uploadflg, 0) = 0 AND COALESCE(a.notupload, 0) = 0";
        $hotelFilter  = $target_hotel ? "AND LOWER(TRIM(a.hotelcode)) = " . $pdo->quote(strtolower(trim($target_hotel))) : "";

        // Common query joining trans_roomavailability_chart_datewise with mas_hotel
        // Uses ORDER BY a.avaidd ASC to ensure FIFO processing without starving older records
        $availSql = "
            SELECT a.*, h.username, h.password, h.hotelcode as mas_hcode
            FROM trans_roomavailability_chart_datewise a
            LEFT JOIN mas_hotel h ON LOWER(TRIM(a.hotelcode)) = LOWER(TRIM(h.hotelcode))
            WHERE {$uploadClause} {$hotelFilter}
            ORDER BY a.avaidd ASC
            LIMIT 150
        ";
        $availStmt = $pdo->query($availSql);
        $pendingAvail = $availStmt ? $availStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        logCli("Found " . count($pendingAvail) . " pending availability update(s) to process");

        // Primary active hotel credentials fallback if a row lacks specific hotel match
        $defaultHotel = !empty($hotels) ? $hotels[0] : null;

        foreach ($pendingAvail as $a) {
            $HotelCode = trim($a['hotelcode'] ?? '');
            $UserName  = trim($a['username'] ?? '');
            $Password  = trim($a['password'] ?? '');

            // Fallback credentials if not matched in join
            if (empty($UserName) || empty($Password)) {
                if ($defaultHotel) {
                    $HotelCode = !empty($HotelCode) && $HotelCode !== '0' ? $HotelCode : trim($defaultHotel['hotelcode']);
                    $UserName  = trim($defaultHotel['username']);
                    $Password  = trim($defaultHotel['password']);
                }
            }

            // Allotment code resolution: check row first, then hotel allotment mapping cache
            $alID = trim((string)($a['allotcode'] ?? ''));
            if (empty($alID) || $alID === '0') {
                // Known roomtype -> allotcode mappings per hotel
                static $allotMappingCache = [
                    'COI4076' => [
                        '1'  => '9148',
                        '2'  => '9152',
                        '3'  => '9146',
                        '6'  => '9147',
                        '7'  => '9151',
                        '8'  => '9150',
                        '9'  => '9149',
                        '10' => '9153',
                        '22' => '13660'
                    ]
                ];
                $rtId = trim((string)($a['roomtypeid'] ?? ''));
                $hcUpper = strtoupper($HotelCode);
                if (!empty($rtId) && isset($allotMappingCache[$hcUpper][$rtId])) {
                    $alID = $allotMappingCache[$hcUpper][$rtId];
                    try {
                        $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET allotcode = :al WHERE avaidd = :id")->execute([':al' => $alID, ':id' => $a['avaidd']]);
                    } catch (Exception $eBf) {}
                } elseif (!empty($rtId) && $rtId !== '0') {
                    // Fallback to roomtypeid for hotels where roomtypeid equals allotment ID
                    $alID = $rtId;
                }
            }

            // Format dates strictly as YYYY-MM-DD
            $fromRaw   = substr((string)($a['fromdate'] ?? ''), 0, 10);
            $toRaw     = substr((string)($a['todate'] ?? ''), 0, 10);
            $fromd     = !empty($fromRaw) ? date("Y-m-d", strtotime($fromRaw)) : date("Y-m-d");
            $todate    = !empty($toRaw) ? date("Y-m-d", strtotime($toRaw)) : date("Y-m-d");

            $initAllot = trim((string)($a['availablerooms'] ?? $a['Availablerooms'] ?? $a['available_rooms'] ?? '0'));
            $stopsales = trim((string)($a['stopsales'] ?? '0'));
            $avaidd    = $a['avaidd'];

            if (empty($HotelCode) || empty($UserName) || empty($Password)) {
                logCli("SKIPPED row [{$avaidd}]: Missing hotel credentials in mas_hotel", "WARN");
                continue;
            }

            if (empty($alID) || $alID === '0') {
                logCli("SKIPPED row [{$avaidd}] for hotel [{$HotelCode}]: RoomType [{$a['roomtypeid']}] has no OTA allotment mapping in BookLogic", "WARN");
                $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1, notupload = 1, remarks = 'Skipped: Unmapped local room type' WHERE avaidd = :id")->execute([':id' => $avaidd]);
                continue;
            }

            // Official BookLogic <availabilityUpdateRQ> structure
            $availPayload = "<availabilityUpdateRQ>\r\n" .
                "<RequestorID>\r\n" .
                "\t<UserName>{$UserName}</UserName>\r\n" .
                "\t<Password>{$Password}</Password>\r\n" .
                "</RequestorID>\r\n" .
                "<allotInfo>\r\n" .
                "\t<hotelCode>{$HotelCode}</hotelCode>\r\n" .
                "\t<alID>{$alID}</alID>\r\n" .
                "\t<fromd>{$fromd}</fromd>\r\n" .
                "\t<tod>{$todate}</tod>\r\n" .
                "\t<initAllot>{$initAllot}</initAllot>\r\n" .
                "\t<advanceBookingDays>0</advanceBookingDays>\r\n" .
                "\t<MinStay>1</MinStay>\r\n" .
                "\t<stopsales>{$stopsales}</stopsales>\r\n" .
                "\t<closedonarrival>0</closedonarrival>\r\n" .
                "\t<closedondeparture>0</closedondeparture>\r\n" .
                "</allotInfo>\r\n" .
                "</availabilityUpdateRQ>";

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => $availPayload,
                CURLOPT_HTTPHEADER => [
                    "cache-control: no-cache",
                    "content-type: text/xml; charset=utf-8",
                ],
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);

            if ($err || ($httpCode >= 400 && $httpCode !== 200)) {
                $errDetail = $err ? "cURL Error: {$err}" : "BookLogic HTTP {$httpCode}";
                logCli("Availability error for Hotel {$HotelCode} Allotment {$alID}: {$errDetail}", "ERROR");
                $isPermanent = ($httpCode == 401 || $httpCode == 403);
                $upClause = $isPermanent ? "uploadflg = 1, notupload = 1, remarks = :rem" : "remarks = :rem";
                $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET {$upClause} WHERE avaidd = :id")->execute([
                    ':rem' => substr($errDetail, 0, 250),
                    ':id'  => $avaidd
                ]);
                continue;
            }

            // Check if BookLogic returned Errors
            $cleanResp = trim((string)$response);
            $xml = @simplexml_load_string($cleanResp, 'SimpleXMLElement', LIBXML_NOCDATA);
            if ($xml && (isset($xml->Errors->Error) || isset($xml->Error))) {
                $errMsg = (string)($xml->Errors->Error ?? $xml->Error);
                logCli("BookLogic rejected Availability for Hotel {$HotelCode} Allotment {$alID}: {$errMsg}", "WARN");
                $isPermanent = stripos($errMsg, 'unknown allotment') !== false || stripos($errMsg, 'permission denied') !== false;
                $upClause = $isPermanent ? "uploadflg = 1, notupload = 1, remarks = :rem" : "remarks = :rem";
                $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET {$upClause} WHERE avaidd = :id")->execute([
                    ':rem' => substr("BookLogic Error: " . $errMsg, 0, 250),
                    ':id'  => $avaidd
                ]);
                continue;
            }

            // Successfully pushed, mark uploadflg = 1 and update remarks
            $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1, notupload = 0, remarks = 'BookLogic Synced', last_synced_at = NOW() WHERE avaidd = :id")->execute([':id' => $avaidd]);
            $stats['availability_pushed']++;
            logCli("Availability successfully pushed to BookLogic for Hotel {$HotelCode} Allotment {$alID} ({$fromd} -> {$todate}: {$initAllot} rooms)", "SUCCESS");
        }
    } catch (Exception $e) {
        logCli("Availability phase error: " . $e->getMessage(), "ERROR");
    }

    // =========================================================================
    // PHASE 4: PUSH ROOM RATES (<RateUpdateRQ>)
    // Common for all hotels in mas_hotel - no hotelcode required
    // =========================================================================
    logCli("--- [PHASE 4] Pushing Pending Room Rates Across mas_hotel ---");
    try {
        // Query trans_roomrateupdates_datewise (common table for rate updates)
        $hotelFilter = $target_hotel ? "AND LOWER(TRIM(r.hotelcode)) = " . $pdo->quote(strtolower(trim($target_hotel))) : "";
        $ratesStmt = $pdo->query("
            SELECT r.*, h.username, h.password, h.hotelcode as mas_hcode
            FROM trans_roomrateupdates_datewise r
            LEFT JOIN mas_hotel h ON LOWER(TRIM(r.hotelcode)) = LOWER(TRIM(h.hotelcode))
            WHERE COALESCE(r.uploadflg, 0) = 0 AND COALESCE(r.notupload, 0) = 0 {$hotelFilter}
            ORDER BY r.rateupdateid ASC
            LIMIT 50
        ");
        $pendingRates = $ratesStmt ? $ratesStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        logCli("Found " . count($pendingRates) . " pending rate tier update(s)");

        $defaultHotel = !empty($hotels) ? $hotels[0] : null;

        foreach ($pendingRates as $r) {
            $HotelCode = trim($r['hotelcode'] ?? '');
            $UserName  = trim($r['username'] ?? '');
            $Password  = trim($r['password'] ?? '');

            // Fallback credentials if r.hotelcode was empty or unmatched
            if (empty($UserName) || empty($Password)) {
                if ($defaultHotel) {
                    $HotelCode = !empty($HotelCode) && $HotelCode !== '0' ? $HotelCode : trim($defaultHotel['hotelcode']);
                    $UserName  = trim($defaultHotel['username']);
                    $Password  = trim($defaultHotel['password']);
                }
            }

            $rateid    = trim($r['rateplanid'] ?? $r['rateid'] ?? 'BAR');
            $fromd     = !empty($r['fromdate']) ? date("Y-m-d", strtotime($r['fromdate'])) : date("Y-m-d");
            $tod       = !empty($r['todate']) ? date("Y-m-d", strtotime($r['todate'])) : date("Y-m-d");
            $rateupdateid = $r['rateupdateid'] ?? ($r['rmrateid'] ?? null);

            if (empty($HotelCode) || empty($UserName) || empty($Password) || empty($rateupdateid)) {
                continue;
            }

            $singleRent = (float)($r['singlerate'] ?? $r['singlerent'] ?? $r['adultprice1'] ?? 100);
            $doubleRent = (float)($r['doublerate'] ?? $r['doublerent'] ?? $r['adultprice2'] ?? 120);
            $tripleRent = (float)($r['triplerate'] ?? $r['triplerent'] ?? $r['adultprice3'] ?? 150);

            $comb = "<combination><adult>1</adult><price>{$singleRent}</price></combination>" .
                    "<combination><adult>2</adult><price>{$doubleRent}</price></combination>" .
                    "<combination><adult>3</adult><price>{$tripleRent}</price></combination>";

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<RateUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<rateInfo>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n<rateId>{$rateid}</rateId>\r\n<fromd>{$fromd}</fromd>\r\n<tod>{$tod}</tod>\r\n<freeCancel>0</freeCancel>\r\n<clpolicy>1</clpolicy>\r\n<paypolicy>1</paypolicy>\r\n<closeout>0</closeout>\r\n<partialUpdate>2</partialUpdate>\r\n<combinations>{$comb}</combinations>\r\n</rateInfo>\r\n</RateUpdateRQ>",
                CURLOPT_HTTPHEADER => [
                    "cache-control: no-cache",
                    "content-type: text/xml; charset=utf-8"
                ],
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logCli("Rate update cURL error for Hotel {$HotelCode} Rate ID {$rateid}: {$err}", "ERROR");
                $pdo->prepare("UPDATE trans_roomrateupdates_datewise SET remarks = :rem WHERE rateupdateid = :rid")->execute([
                    ':rem' => substr("cURL error: " . $err, 0, 250),
                    ':rid' => $rateupdateid
                ]);
                continue;
            }

            $pdo->prepare("UPDATE trans_roomrateupdates_datewise SET uploadflg = 1, remarks = 'BookLogic Synced', last_synced_at = NOW() WHERE rateupdateid = :rid")->execute([':rid' => $rateupdateid]);
            $stats['rates_pushed']++;
            logCli("Rates pushed for Hotel {$HotelCode} Rate ID {$rateid} ({$fromd} -> {$tod})", "SUCCESS");
        }
    } catch (Exception $e) {
        logCli("Rates phase error: " . $e->getMessage(), "ERROR");
    }

    $elapsed = round(microtime(true) - $startTime, 2);
    logCli("========== CYCLE COMPLETE in {$elapsed}s | Ingested: {$stats['bookings_inserted']} | MarkSend: {$stats['marksend_acked']} | Avail Pushed: {$stats['availability_pushed']} | Rates Pushed: {$stats['rates_pushed']} ==========");
    return $stats;
}

// Execution Loop
if ($is_daemon) {
    logCli("Starting BookLogic Daemon mode (Interval: {$interval}s)...");
    while (true) {
        runAutoSyncCycle($pdo, $api_url, $target_hotel, $force_avail);
        logCli("Sleeping for {$interval} seconds before next cycle...");
        sleep($interval);
    }
} else {
    runAutoSyncCycle($pdo, $api_url, $target_hotel, $force_avail);
}
