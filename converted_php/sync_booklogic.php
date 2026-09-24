<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Book Logic - PostgreSQL Sync Service</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: rgb(248,248,248); margin: 0; padding: 0; }
        .card { background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); width: 75%; max-width: 800px; margin: 40px auto; padding: 30px; text-align: center; }
        .log-box { background: #1e293b; color: #f8fafc; font-family: monospace; font-size: 13px; text-align: left; padding: 15px; border-radius: 6px; max-height: 350px; overflow-y: auto; margin-top: 20px; }
        .success { color: #4ade80; }
        .error { color: #f87171; }
        .info { color: #38bdf8; }
        footer { background-color: #0f172a; color: #94a3b8; padding: 12px; text-align: center; font-size: 12px; margin-top: 40px; }
    </style>
</head>
<body>

<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
ini_set('max_execution_time', 0);

// Include PostgreSQL Database Connection
include_once __DIR__ . '/db.php';

// BookLogic Channel Manager API URL (Stage / Testing)
$api_url = getenv('BOOKLOGIC_API_URL') ?: (defined('BOOKLOGIC_API_URL') ? BOOKLOGIC_API_URL : 'https://stage-xrs.booklogic.net/ws/external-pms/microgenn');
if (!defined('BOOKLOGIC_API_URL')) {
    define('BOOKLOGIC_API_URL', $api_url);
}

$datein = date("Y-m-d H:i:s");
$is_cli = (php_sapi_name() === 'cli');

if (!$is_cli) {
    header("Refresh: 200");
}
?>

<section>
    <div class="card">
        <h2 style="color: #334155; margin-bottom: 5px;">Book Logic Syncing Services (PostgreSQL VPS)</h2>
        <p style="color: #64748b; margin-top: 0; font-size: 14px;">VPS Database: <strong>72.61.240.34</strong> | DB: <strong>BOOKLOGIC</strong></p>
        <p style="color: #0ea5e9; font-weight: bold;">Syncing is in process... (Started at <?php echo date("H:i:s"); ?>)</p>

        <div class="log-box">
<?php

function logMsg($msg, $type = 'info') {
    global $is_cli;
    $time = date("H:i:s");
    $formatted = "[$time] $msg";
    if ($is_cli) {
        echo $formatted . PHP_EOL;
    } else {
        echo "<div class='{$type}'>" . htmlspecialchars($formatted) . "</div>";
        flush();
    }
}

// -------------------------------------------------------------
// STEP 1: MarkSend Sync (Acknowledge bookings to BookLogic)
// -------------------------------------------------------------
logMsg("=== STEP 1: Starting MarkSend Acknowledgment Sync ===", "info");

try {
    $hotelStmt = $pdo->query("SELECT * FROM \"Mas_Hotel\" WHERE COALESCE(\"Inactive\", 0) = 0");
    $activeHotels = $hotelStmt->fetchAll();

    foreach ($activeHotels as $hotel) {
        $HotelCode = $hotel['HotelCode'];
        $UserName  = $hotel['Username'];
        $Password  = $hotel['Password'];

        $resStmt = $pdo->prepare("SELECT * FROM \"Reservations\" WHERE COALESCE(\"MarkSend\", 0) = 0 AND \"Hotel_Code\" = :hotel_code LIMIT 10");
        $resStmt->execute([':hotel_code' => $HotelCode]);
        $pendingReservations = $resStmt->fetchAll();

        foreach ($pendingReservations as $row2) {
            $Res_id = $row2['Res_id'];
            $PnrID  = $row2['PnrID'];
            $Booking_Id = $row2['Booking_Id'];

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => "",
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n<PnrID>{$PnrID}</PnrID>\r\n<SrvNum>{$Res_id}</SrvNum>\r\n</markSendRQ>",
                CURLOPT_HTTPHEADER => [
                    "cache-control: no-cache",
                    "content-type: text/xml",
                    "postman-token: 49febbc8-8756-79b6-1074-cbcc1d6369f3"
                ],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logMsg("MarkSend cURL Error for Booking {$Booking_Id}: {$err}", "error");
            } else {
                $xml = simplexml_load_string($response, 'SimpleXMLElement', LIBXML_NOCDATA);
                $data = json_decode(json_encode($xml), true);

                if (!empty($data['Hotel']['Booking'])) {
                    $msg = $data['Hotel']['Booking']['Message'] ?? 'Success';
                    $pdo->beginTransaction();
                    
                    $insLog = $pdo->prepare("INSERT INTO \"MarkSend_Response\" (\"Hotel_Code\", \"Booking_id\", \"Service\", \"PnrID\", \"Message\", \"Type\") VALUES (:hc, :bid, :srv, :pnr, :msg, 'B')");
                    $insLog->execute([
                        ':hc' => $HotelCode,
                        ':bid' => $Booking_Id,
                        ':srv' => (string)$Res_id,
                        ':pnr' => $PnrID,
                        ':msg' => $msg
                    ]);

                    $updRes = $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :res_id");
                    $updRes->execute([':res_id' => $Res_id]);

                    $pdo->commit();
                    logMsg("MarkSend Confirmed for Booking {$Booking_Id} (Res_id: {$Res_id})", "success");
                } elseif (!empty($data['Errors']['Error'])) {
                    $errMsg = is_array($data['Errors']['Error']) ? json_encode($data['Errors']['Error']) : $data['Errors']['Error'];
                    $pdo->beginTransaction();

                    $insLog = $pdo->prepare("INSERT INTO \"MarkSend_Response\" (\"Hotel_Code\", \"Booking_id\", \"Service\", \"PnrID\", \"Message\", \"Type\") VALUES (:hc, :bid, :srv, :pnr, :msg, 'C')");
                    $insLog->execute([
                        ':hc' => $HotelCode,
                        ':bid' => $Booking_Id,
                        ':srv' => (string)$Res_id,
                        ':pnr' => $PnrID,
                        ':msg' => $errMsg
                    ]);

                    $updRes = $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :res_id");
                    $updRes->execute([':res_id' => $Res_id]);

                    $pdo->commit();
                    logMsg("MarkSend Logged Error for Booking {$Booking_Id}: {$errMsg}", "warn");
                }
            }
        }
    }
} catch (Exception $e) {
    logMsg("MarkSend Exception: " . $e->getMessage(), "error");
}


// -------------------------------------------------------------
// STEP 2: Booking Fetch (<syncBookingRQ>)
// -------------------------------------------------------------
logMsg("=== STEP 2: Starting BookLogic Reservation Ingestion ===", "info");

try {
    $hotelStmt = $pdo->query("SELECT * FROM \"Mas_Hotel\" WHERE COALESCE(\"Inactive\", 0) = 0");
    $activeHotels = $hotelStmt->fetchAll();

    foreach ($activeHotels as $hotel) {
        $HotelCode = $hotel['HotelCode'];
        $UserName  = $hotel['Username'];
        $Password  = $hotel['Password'];

        logMsg("Fetching reservations for Hotel [{$HotelCode}]...", "info");

        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $api_url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => "",
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => "POST",
            CURLOPT_POSTFIELDS => "\r\n<syncBookingRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n</syncBookingRQ>",
            CURLOPT_HTTPHEADER => [
                "cache-control: no-cache",
                "content-type: text/xml",
                "postman-token: 11c801f7-f091-f384-312b-46c2a9a958a0"
            ],
        ]);
        $response = curl_exec($curl);
        $err = curl_error($curl);
        curl_close($curl);

        if ($err) {
            logMsg("cURL Error for Hotel {$HotelCode}: {$err}", "error");
            continue;
        }

        $xml = simplexml_load_string($response, 'SimpleXMLElement', LIBXML_NOCDATA);
        $data = json_decode(json_encode($xml), true);

        if (empty($data['Hotel']['Bookings']['Booking'])) {
            logMsg("No new bookings found for Hotel {$HotelCode}.", "info");
            continue;
        }

        $rawBookings = $data['Hotel']['Bookings']['Booking'];
        // Normalize single booking vs array of bookings
        $bookingList = isset($rawBookings['@attributes']) || isset($rawBookings['syncType']) ? [$rawBookings] : $rawBookings;

        foreach ($bookingList as $datas) {
            $Booking_Id = $datas['@attributes']['id'] ?? ($datas['id'] ?? null);
            if (!$Booking_Id) continue;

            $syncType           = $datas['syncType'] ?? '';
            $PnrID              = $datas['PnrID'] ?? '';
            $ExternalReference  = $datas['ExternalReference'] ?? '';
            $deposit            = $datas['deposit'] ?? '';
            $Service            = $datas['Service'] ?? '';
            $TravelagentName    = $datas['TravelagentName'] ?? '';
            $ExtResRoomId       = $datas['ExternalReservationRoomId'] ?? '';
            $ExtResId           = $datas['ExternalReservationId'] ?? '';
            $UpdateDate         = $datas['UpdateDate'] ?? '';
            $modifyDate         = $datas['modifyDate'] ?? '';
            $cancelDate         = $datas['cancelDate'] ?? '';
            $Currency           = $datas['Currency'] ?? '';
            $Status             = $datas['Status'] ?? '';
            $Adult              = $datas['Adult'] ?? '0';
            $ChildB             = $datas['ChildB'] ?? '0';
            $ChildA             = $datas['ChildA'] ?? '0';
            $Infant             = $datas['Infant'] ?? '0';
            $Remarks            = str_replace("'", "", $datas['Remarks'] ?? '');

            // Check if already exists in PostgreSQL
            $checkStmt = $pdo->prepare("SELECT COUNT(*) as rcnt FROM \"Reservations\" WHERE \"Booking_Id\" = :b_id AND \"syncType\" = :stype");
            $checkStmt->execute([':b_id' => $Booking_Id, ':stype' => $syncType]);
            $existing = $checkStmt->fetch();

            if ($existing && intval($existing['rcnt']) > 0) {
                logMsg("Duplicate booking ignored: Booking_Id {$Booking_Id} (syncType: {$syncType})", "warn");
                continue;
            }

            // Room / Price data
            $Rooms        = $datas['Rooms'] ?? '1';
            $Room         = $datas['Room'] ?? '';
            $Checkin      = $datas['Checkin'] ?? '';
            $Checkout     = $datas['Checkout'] ?? '';
            $Netprice     = $datas['Netprice'] ?? '0';
            $RoomTotal    = $datas['roomTotal'] ?? ($datas['RoomTotal'] ?? '0');
            $ExtrasTotal  = $datas['ExtrasTotal'] ?? '0';
            $MealTotal    = $datas['MealTotal'] ?? '0';
            $Total        = $datas['Total'] ?? '0';
            $TaxIncluded  = $datas['TaxIncluded'] ?? '0';
            $TaxExcluded  = $datas['TaxExcluded'] ?? '0';
            $rate         = $datas['rate'] ?? '';
            $rate_id      = is_array($datas['rate'] ?? null) ? ($datas['rate']['@attributes']['id'] ?? '') : '';
            $Availability_id   = is_array($datas['allot'] ?? null) ? ($datas['allot']['@attributes']['id'] ?? '') : '';
            $Availability_name = is_string($datas['allot'] ?? null) ? $datas['allot'] : '';
            $Room_Id      = is_array($datas['rmName'] ?? null) ? ($datas['rmName']['@attributes']['id'] ?? '') : '';
            $Room_Name    = is_string($datas['rmName'] ?? null) ? $datas['rmName'] : '';

            // Customer Data
            $CL        = $datas['CL'] ?? [];
            $FirstName = $CL['FirstName'] ?? '';
            $LastName  = $CL['LastName'] ?? '';
            $Email     = $CL['Email'] ?? '';
            $Tel       = $CL['Tel'] ?? '';
            $address   = $CL['address'] ?? '';
            $zip       = $CL['zip'] ?? '';
            $Location  = $CL['Location'] ?? '';
            $Country   = $CL['Country'] ?? '';

            // PostgreSQL Transaction with RETURNING Res_id (Replacing SQL Server @@identity)
            try {
                $pdo->beginTransaction();

                // 1. Insert into Reservations and retrieve generated Res_id
                $insRes = $pdo->prepare("
                    INSERT INTO \"Reservations\" (
                        \"Hotel_Code\", \"Booking_Id\", \"syncType\", \"PnrID\", \"ExternalReference\",
                        \"ExternalReservationRoomId\", \"ExternalReservationId\", \"deposit\", \"Service\",
                        \"TravelagentName\", \"UpdateDate\", \"modifyDate\", \"cancelDate\", \"Currency\",
                        \"Status\", \"Adult\", \"ChildB\", \"ChildA\", \"Infant\", \"Remarks\", \"Insertdate\", \"MarkSend\"
                    ) VALUES (
                        :hc, :bid, :st, :pnr, :extref, :exrrid, :exrid, :dep, :srv,
                        :ta, :ud, :md, :cd, :curr, :status, :ad, :cb, :ca, :inf, :rem, :idate, 0
                    ) RETURNING \"Res_id\"
                ");

                $insRes->execute([
                    ':hc'     => $HotelCode,
                    ':bid'    => $Booking_Id,
                    ':st'     => $syncType,
                    ':pnr'    => $PnrID,
                    ':extref' => $ExternalReference,
                    ':exrrid' => $ExtResRoomId,
                    ':exrid'  => $ExtResId,
                    ':dep'    => $deposit,
                    ':srv'    => $Service,
                    ':ta'     => $TravelagentName,
                    ':ud'     => $UpdateDate,
                    ':md'     => $modifyDate,
                    ':cd'     => $cancelDate,
                    ':curr'   => $Currency,
                    ':status' => $Status,
                    ':ad'     => $Adult,
                    ':cb'     => $ChildB,
                    ':ca'     => $ChildA,
                    ':inf'    => $Infant,
                    ':rem'    => $Remarks,
                    ':idate'  => $datein
                ]);

                $resRow = $insRes->fetch();
                $newResId = $resRow['Res_id'];

                // 2. Insert into Reservations_details
                $insDet = $pdo->prepare("
                    INSERT INTO \"Reservations_details\" (
                        \"Res_id\", \"NoofRooms\", \"RoomType\", \"Checkindate\", \"Checkoutdate\",
                        \"Netprice\", \"RoomTotal\", \"ExtrasTotal\", \"MealTotal\", \"Total\",
                        \"TaxIncluded\", \"TaxExcluded\", \"rate_name\", \"rate_id\", \"Availability_id\",
                        \"Availability_name\", \"Room_Id\", \"Room_Name\"
                    ) VALUES (
                        :rid, :nr, :rt, :cin, :cout, :np, :rtot, :extot, :mtot, :tot,
                        :tinc, :texc, :rname, :ridx, :avid, :avname, :rmid, :rmname
                    )
                ");
                $insDet->execute([
                    ':rid'    => $newResId,
                    ':nr'     => $Rooms,
                    ':rt'     => $Room,
                    ':cin'    => $Checkin,
                    ':cout'   => $Checkout,
                    ':np'     => $Netprice,
                    ':rtot'   => $RoomTotal,
                    ':extot'  => $ExtrasTotal,
                    ':mtot'   => $MealTotal,
                    ':tot'    => $Total,
                    ':tinc'   => $TaxIncluded,
                    ':texc'   => $TaxExcluded,
                    ':rname'  => $rate,
                    ':ridx'   => $rate_id,
                    ':avid'   => $Availability_id,
                    ':avname' => $Availability_name,
                    ':rmid'   => $Room_Id,
                    ':rmname' => $Room_Name
                ]);

                // 3. Insert into Reservation_Customer
                $insCust = $pdo->prepare("
                    INSERT INTO \"Reservation_Customer\" (
                        \"Res_id\", \"FirstName\", \"LastName\", \"Email\", \"Tel\",
                        \"address\", \"zip\", \"Location\", \"Country\"
                    ) VALUES (
                        :rid, :fn, :ln, :email, :tel, :addr, :zip, :loc, :ctry
                    )
                ");
                $insCust->execute([
                    ':rid'   => $newResId,
                    ':fn'    => $FirstName,
                    ':ln'    => $LastName,
                    ':email' => $Email,
                    ':tel'   => $Tel,
                    ':addr'  => $address,
                    ':zip'   => $zip,
                    ':loc'   => $Location,
                    ':ctry'  => $Country
                ]);

                // 4. Insert PerDay breakdown
                $perDayArr = $datas['PerDay'] ?? [];
                if (!empty($perDayArr)) {
                    $perDayList = isset($perDayArr['@attributes']) || isset($perDayArr['Price']) ? [$perDayArr] : $perDayArr;
                    $insPerDay = $pdo->prepare("
                        INSERT INTO \"Reservation_PerDay_details\" (\"Hotel_Code\", \"Booking_Id\", \"Date\", \"rm_no\", \"Price\", \"Res_id\")
                        VALUES (:hc, :bid, :dt, :rmno, :price, :rid)
                    ");
                    foreach ($perDayList as $pItem) {
                        $pDate  = $pItem['@attributes']['date'] ?? ($pItem['date'] ?? '');
                        $pRmNo  = $pItem['@attributes']['rm_no'] ?? ($pItem['rm_no'] ?? '');
                        $pPrice = $pItem['Price'] ?? '0';

                        $insPerDay->execute([
                            ':hc'    => $HotelCode,
                            ':bid'   => $Booking_Id,
                            ':dt'    => $pDate,
                            ':rmno'  => $pRmNo,
                            ':price' => $pPrice,
                            ':rid'   => $newResId
                        ]);
                    }
                }

                // 5. Insert into Audit Log tables
                $insLog = $pdo->prepare("
                    INSERT INTO \"Reservations_log\" (
                        \"Hotel_Code\", \"Booking_Id\", \"syncType\", \"PnrID\", \"ExternalReference\",
                        \"ExternalReservationRoomId\", \"ExternalReservationId\", \"deposit\", \"Service\",
                        \"TravelagentName\", \"UpdateDate\", \"modifyDate\", \"cancelDate\", \"Currency\",
                        \"Status\", \"Adult\", \"ChildB\", \"ChildA\", \"Infant\", \"Remarks\", \"Insertdate\"
                    ) VALUES (
                        :hc, :bid, :st, :pnr, :extref, :exrrid, :exrid, :dep, :srv,
                        :ta, :ud, :md, :cd, :curr, :status, :ad, :cb, :ca, :inf, :rem, :idate
                    )
                ");
                $insLog->execute([
                    ':hc'     => $HotelCode,
                    ':bid'    => $Booking_Id,
                    ':st'     => $syncType,
                    ':pnr'    => $PnrID,
                    ':extref' => $ExternalReference,
                    ':exrrid' => $ExtResRoomId,
                    ':exrid'  => $ExtResId,
                    ':dep'    => $deposit,
                    ':srv'    => $Service,
                    ':ta'     => $TravelagentName,
                    ':ud'     => $UpdateDate,
                    ':md'     => $modifyDate,
                    ':cd'     => $cancelDate,
                    ':curr'   => $Currency,
                    ':status' => $Status,
                    ':ad'     => $Adult,
                    ':cb'     => $ChildB,
                    ':ca'     => $ChildA,
                    ':inf'    => $Infant,
                    ':rem'    => $Remarks,
                    ':idate'  => $datein
                ]);

                $pdo->commit();
                logMsg("Successfully ingested Booking ID: {$Booking_Id} (Generated PostgreSQL Res_id: {$newResId}) for Guest {$FirstName} {$LastName}", "success");

            } catch (Exception $insErr) {
                $pdo->rollBack();
                logMsg("Failed to insert Booking {$Booking_Id}: " . $insErr->getMessage(), "error");
            }
        }
    }
} catch (Exception $e) {
    logMsg("Booking Ingestion Error: " . $e->getMessage(), "error");
}


// -------------------------------------------------------------
// STEP 3: Room Availability Updates (<availabilityUpdateRQ>)
// -------------------------------------------------------------
logMsg("=== STEP 3: Starting Room Availability Sync ===", "info");

try {
    $hotelStmt = $pdo->query("SELECT * FROM \"Mas_Hotel\" WHERE COALESCE(\"Inactive\", 0) = 0");
    $activeHotels = $hotelStmt->fetchAll();

    foreach ($activeHotels as $hotel) {
        $HotelCode = $hotel['HotelCode'];
        $UserName  = $hotel['Username'];
        $Password  = $hotel['Password'];

        $availStmt = $pdo->prepare("
            SELECT * FROM trans_roomavailability_chart_datewise 
            WHERE COALESCE(uploadflg, 0) = 0 AND TRIM(hotelcode) = :hcode 
            LIMIT 5
        ");
        $availStmt->execute([':hcode' => $HotelCode]);
        $pendingAvail = $availStmt->fetchAll();

        foreach ($pendingAvail as $row1) {
            $alID      = $row1['allotcode'];
            $fromd     = $row1['fromdate'];
            $todate    = $row1['todate'];
            $initAllot = $row1['Availablerooms'];
            $stopsales = $row1['stopsales'] ?? '0';
            $avaidd    = $row1['avaidd'];

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => "",
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<availabilityUpdateRQ>\n<RequestorID>\n\t<UserName>{$UserName}</UserName>\n\t<Password>{$Password}</Password>\n</RequestorID>\n<allotInfo>\n\t<hotelCode>{$HotelCode}</hotelCode>\n\t<alID>{$alID}</alID>\n\t<fromd>{$fromd}</fromd>\n\t<tod>{$todate}</tod>\n\t<initAllot>{$initAllot}</initAllot>\n\t<advanceBookingDays>0</advanceBookingDays>\n\t<MinStay>1</MinStay>\n\t<stopsales>{$stopsales}</stopsales>\n\t<closedonarrival>0</closedonarrival>\n\t<closedondeparture>0</closedondeparture>\n</allotInfo>\n</availabilityUpdateRQ>",
                CURLOPT_HTTPHEADER => [
                    "cache-control: no-cache",
                    "content-type: text/xml",
                    "postman-token: 7514e2d6-d4e3-e8c8-4ae3-3eb6045f43da"
                ],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logMsg("Availability Update Error: {$err}", "error");
            } else {
                $updStmt = $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1 WHERE avaidd = :avaidd");
                $updStmt->execute([':avaidd' => $avaidd]);
                logMsg("Availability updated for Allot Code {$alID} ({$fromd} to {$todate})", "success");
            }
        }
    }
} catch (Exception $e) {
    logMsg("Availability Sync Error: " . $e->getMessage(), "error");
}


// -------------------------------------------------------------
// STEP 4: Room Rate Updates (<RateUpdateRQ>)
// -------------------------------------------------------------
logMsg("=== STEP 4: Starting Room Rate Sync ===", "info");

try {
    $hotelStmt = $pdo->query("SELECT * FROM \"Mas_Hotel\" WHERE COALESCE(\"Inactive\", 0) = 0");
    $activeHotels = $hotelStmt->fetchAll();

    foreach ($activeHotels as $hotel) {
        $HotelCode = $hotel['HotelCode'];
        $UserName  = $hotel['Username'];
        $Password  = $hotel['Password'];

        $rateStmt = $pdo->prepare("
            SELECT * FROM \"Trans_roomrateupdates_datewise\" 
            WHERE COALESCE(uploadflg, 0) = 0 AND COALESCE(notuploadflg, 0) = 0 AND hotelcode = :hcode
        ");
        $rateStmt->execute([':hcode' => $HotelCode]);
        $pendingRates = $rateStmt->fetchAll();

        foreach ($pendingRates as $row3) {
            $rateid   = $row3['rateid'];
            $fromd    = date("Y-m-d", strtotime($row3['fromdate']));
            $tod      = date("Y-m-d", strtotime($row3['todate']));
            $clpolicy = $row3['cancelpolicyid'];
            $paypolicy= $row3['paymentpolicyid'];
            $rmrateid = $row3['rmrateid'];

            $combination = '';
            if (!empty($row3['singlerent']) && $row3['singlerent'] != '0.00') {
                $combination .= "<combination>\r\n<adult>1</adult>\r\n<childA>0</childA>\r\n<childB>0</childB>\r\n<infant>0</infant>\r\n<price>{$row3['singlerent']}</price>\r\n<MinStay>0</MinStay>\r\n</combination>\r\n";
            }
            if (!empty($row3['doublerent']) && $row3['doublerent'] != '0.00') {
                $combination .= "<combination>\r\n<adult>2</adult>\r\n<childA>0</childA>\r\n<childB>0</childB>\r\n<infant>0</infant>\r\n<price>{$row3['doublerent']}</price>\r\n<MinStay>0</MinStay>\r\n</combination>\r\n";
            }
            if (!empty($row3['triplerent']) && $row3['triplerent'] != '0.00') {
                $combination .= "<combination>\r\n<adult>3</adult>\r\n<childA>0</childA>\r\n<childB>0</childB>\r\n<infant>0</infant>\r\n<price>{$row3['triplerent']}</price>\r\n<MinStay>0</MinStay>\r\n</combination>\r\n";
            }
            if (!empty($row3['Quartertriplerent']) && $row3['Quartertriplerent'] != '0.00') {
                $combination .= "<combination>\r\n<adult>4</adult>\r\n<childA>0</childA>\r\n<childB>0</childB>\r\n<infant>0</infant>\r\n<price>{$row3['Quartertriplerent']}</price>\r\n<MinStay>0</MinStay>\r\n</combination>\r\n";
            }

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => "",
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<RateUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<rateInfo>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n<rateId>{$rateid}</rateId>\r\n<fromd>{$fromd}</fromd>\r\n<tod>{$todate}</tod>\r\n<freeCancel>0</freeCancel>\r\n<clpolicy>{$clpolicy}</clpolicy>\r\n<paypolicy>{$paypolicy}</paypolicy>\r\n<closeout>0</closeout>\r\n<partialUpdate>2</partialUpdate>\r\n<combinations>{$combination}</combinations>\r\n</rateInfo>\r\n</RateUpdateRQ>",
                CURLOPT_HTTPHEADER => [
                    "cache-control: no-cache",
                    "content-type: text/xml",
                    "postman-token: 7560a3d4-ae70-a015-bfc2-e67ffc090ebc"
                ],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logMsg("Rate Update cURL Error: {$err}", "error");
            } else {
                $xml = simplexml_load_string($response, 'SimpleXMLElement', LIBXML_NOCDATA);
                $data = json_decode(json_encode($xml), true);

                if (!empty($data['Errors']['Error'])) {
                    $errorTxt = is_array($data['Errors']['Error']) ? json_encode($data['Errors']['Error']) : $data['Errors']['Error'];
                    $updStmt = $pdo->prepare("UPDATE \"Trans_roomrateupdates_datewise\" SET notuploadflg = 1, remarks = :rem WHERE rmrateid = :rmid");
                    $updStmt->execute([':rem' => $errorTxt, ':rmid' => $rmrateid]);
                    logMsg("Rate Update Error for Rate ID {$rateid}: {$errorTxt}", "warn");
                } else {
                    $statusTxt = $data['Hotel']['Rate']['Status'] ?? 'Success';
                    $updStmt = $pdo->prepare("UPDATE \"Trans_roomrateupdates_datewise\" SET uploadflg = 1, remarks = :rem WHERE rmrateid = :rmid");
                    $updStmt->execute([':rem' => $statusTxt, ':rmid' => $rmrateid]);
                    logMsg("Rate Update Successful for Rate ID {$rateid}", "success");
                }
            }
        }
    }
} catch (Exception $e) {
    logMsg("Rate Sync Error: " . $e->getMessage(), "error");
}

logMsg("=== All BookLogic Sync Cycles Completed ===", "success");
?>
        </div>
    </div>
</section>

<footer>
    <p>&copy; <?php echo date("Y"); ?> Microgenn Software Solutions & BookLogic Integration. PostgreSQL VPS 72.61.240.34.</p>
</footer>
</body>
</html>
