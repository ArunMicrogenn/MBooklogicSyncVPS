<?php
/**
 * BookLogic PMS / Channel Manager Full Auto-Sync Service
 * Converted to PostgreSQL (BOOKLOGIC Database on VPS 72.61.240.34)
 * 
 * Auto-Sync Pipeline:
 *  Step 1. Fetch Bookings from BookLogic API (<syncBookingRQ>) & insert into PostgreSQL
 *  Step 2. MarkSend Booking Acknowledgment (<markSendRQ>) & record response
 *  Step 3. Push Room Availability (<availabilityUpdateRQ>) & update uploadflg = 1
 *  Step 4. Push Room Rates (<RateUpdateRQ>) & update uploadflg = 1
 */

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

$refresh_interval = isset($_GET['interval']) ? max(10, (int)$_GET['interval']) : 60;
$auto_refresh = isset($_GET['auto']) ? ($_GET['auto'] === '1' || $_GET['auto'] === 'true') : true;

$datein = date("Y-m-d H:i:s");
$is_cli = (php_sapi_name() === 'cli');

if (!$is_cli && $auto_refresh) {
    header("Refresh: {$refresh_interval}");
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BookLogic Auto-Sync Pipeline &bull; PostgreSQL VPS 72.61.240.34</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0b1329; color: #e2e8f0; margin: 0; padding: 20px; }
        .card { background-color: #131d38; border: 1px solid #1e293b; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); max-width: 1000px; margin: 0 auto; padding: 25px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 18px; flex-wrap: wrap; gap: 15px; }
        .log-box { background: #070d1e; color: #f8fafc; font-family: "JetBrains Mono", "Courier New", monospace; font-size: 13px; text-align: left; padding: 18px; border-radius: 8px; max-height: 480px; overflow-y: auto; margin-top: 20px; line-height: 1.6; border: 1px solid #1e293b; }
        .success { color: #34d399; }
        .error { color: #f87171; }
        .warn { color: #fbbf24; }
        .info { color: #38bdf8; }
        .badge { background: #0284c7; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 20px; }
        .stat-card { background: #0c152b; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; }
        .stat-val { font-size: 22px; font-weight: 700; color: #38bdf8; font-family: monospace; }
        .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px; }
        .btn { background: #0284c7; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; text-decoration: none; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
        .btn:hover { background: #0369a1; }
        .btn-outline { background: transparent; border: 1px solid #334155; color: #cbd5e1; }
        .btn-outline:hover { background: #1e293b; }
        .countdown { font-family: monospace; color: #34d399; font-weight: bold; }
    </style>
</head>
<body>

<div class="card">
    <div class="header">
        <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <h2 style="color: #f8fafc; margin: 0; font-size: 20px;">BookLogic 4-Phase Auto-Sync Engine</h2>
                <span class="badge">&bull; AUTO-SYNC ACTIVE</span>
            </div>
            <p style="color: #94a3b8; margin: 0; font-size: 13px;">
                VPS Target: <strong style="color: #38bdf8;">72.61.240.34</strong> | Database: <strong style="color: #38bdf8;">BOOKLOGIC</strong> | API: <strong style="color: #38bdf8;"><?php echo htmlspecialchars($api_url); ?></strong>
            </p>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
            <div style="font-size: 12px; color: #94a3b8;">
                Next Auto-Sync in: <span id="timer" class="countdown"><?php echo $refresh_interval; ?></span>s
            </div>
            <a href="?interval=<?php echo $refresh_interval; ?>&auto=1" class="btn">Force Sync Now</a>
        </div>
    </div>

    <!-- Pipeline Visual Steps -->
    <div style="display: flex; gap: 8px; margin-top: 15px; overflow-x: auto; padding-bottom: 5px;">
        <div style="background: #0c152b; border: 1px solid #0284c7; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #38bdf8;">
            1. &lt;syncBookingRQ&gt; Ingest
        </div>
        <div style="color: #475569; display: flex; align-items: center;">&rarr;</div>
        <div style="background: #0c152b; border: 1px solid #10b981; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #34d399;">
            2. &lt;markSendRQ&gt; Ack
        </div>
        <div style="color: #475569; display: flex; align-items: center;">&rarr;</div>
        <div style="background: #0c152b; border: 1px solid #a855f7; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #c084fc;">
            3. &lt;availabilityUpdateRQ&gt; Push
        </div>
        <div style="color: #475569; display: flex; align-items: center;">&rarr;</div>
        <div style="background: #0c152b; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #fbbf24;">
            4. &lt;RateUpdateRQ&gt; Push
        </div>
    </div>

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

$statBookings = 0;
$statMarkSend = 0;
$statAvail = 0;
$statRates = 0;

try {
    $hotelStmt = $pdo->query("SELECT * FROM \"Mas_Hotel\" WHERE COALESCE(\"Inactive\", 0) = 0");
    $activeHotels = $hotelStmt->fetchAll();

    // =========================================================================
    // STEP 1: FETCH NEW BOOKINGS FROM BOOKLOGIC API (<syncBookingRQ>)
    // =========================================================================
    logMsg("=== [STEP 1/4] FETCHING BOOKINGS FROM BOOKLOGIC API ===", "info");

    foreach ($activeHotels as $hotel) {
        $HotelCode = $hotel['HotelCode'];
        $UserName  = $hotel['Username'];
        $Password  = $hotel['Password'];

        logMsg("Checking new reservations for Hotel Code: {$HotelCode}...", "info");

        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $api_url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => "POST",
            CURLOPT_POSTFIELDS => "<syncBookingRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n</syncBookingRQ>",
            CURLOPT_HTTPHEADER => [
                "cache-control: no-cache",
                "content-type: text/xml"
            ],
        ]);
        $response = curl_exec($curl);
        $err = curl_error($curl);
        curl_close($curl);

        if ($err) {
            logMsg("Booking cURL Error for Hotel {$HotelCode}: {$err}", "error");
            continue;
        }

        $xml = @simplexml_load_string($response, 'SimpleXMLElement', LIBXML_NOCDATA);
        $data = $xml ? json_decode(json_encode($xml), true) : [];

        if (!empty($data['Hotel']['Booking'])) {
            $bookings = isset($data['Hotel']['Booking']['Booking_Id']) ? [$data['Hotel']['Booking']] : $data['Hotel']['Booking'];

            foreach ($bookings as $b) {
                $Booking_Id = $b['Booking_Id'] ?? null;
                $syncType   = $b['syncType'] ?? 'N';
                if (!$Booking_Id) continue;

                // Check duplicate
                $chk = $pdo->prepare("SELECT \"Res_id\" FROM \"Reservations\" WHERE \"Booking_Id\" = :bid AND \"syncType\" = :st");
                $chk->execute([':bid' => $Booking_Id, ':st' => $syncType]);
                if ($chk->fetch()) {
                    continue; // Skip duplicate
                }

                $pdo->beginTransaction();

                $insRes = $pdo->prepare("
                    INSERT INTO \"Reservations\" (
                        \"Hotel_Code\", \"Booking_Id\", \"syncType\", \"PnrID\", \"ExternalReference\",
                        \"deposit\", \"Service\", \"TravelagentName\", \"UpdateDate\", \"Currency\",
                        \"Status\", \"Adult\", \"Remarks\", \"Insertdate\", \"MarkSend\"
                    ) VALUES (
                        :hc, :bid, :st, :pnr, :ext,
                        :dep, :srv, :ta, :ud, :curr,
                        :stat, :adult, :rem, :idate, 0
                    ) RETURNING \"Res_id\"
                ");
                $insRes->execute([
                    ':hc' => $HotelCode,
                    ':bid' => $Booking_Id,
                    ':st' => $syncType,
                    ':pnr' => $b['PnrID'] ?? 'PNR' . rand(1000, 9999),
                    ':ext' => $b['ExternalReference'] ?? '',
                    ':dep' => (float)($b['deposit'] ?? 0),
                    ':srv' => $b['Service'] ?? '',
                    ':ta' => $b['TravelagentName'] ?? 'BookLogic OTA',
                    ':ud' => $b['UpdateDate'] ?? $datein,
                    ':curr' => $b['Currency'] ?? 'USD',
                    ':stat' => $b['Status'] ?? 'Confirmed',
                    ':adult' => (int)($b['Adult'] ?? 2),
                    ':rem' => $b['Remarks'] ?? '',
                    ':idate' => $datein
                ]);
                $newResId = $insRes->fetchColumn();

                if (!empty($b['Customer'])) {
                    $cust = $b['Customer'];
                    $insCust = $pdo->prepare("
                        INSERT INTO \"Reservation_Customer\" (\"Res_id\", \"FirstName\", \"LastName\", \"Email\", \"Tel\", \"Country\")
                        VALUES (:rid, :fn, :ln, :em, :tel, :cnt)
                    ");
                    $insCust->execute([
                        ':rid' => $newResId,
                        ':fn' => $cust['FirstName'] ?? '',
                        ':ln' => $cust['LastName'] ?? '',
                        ':em' => $cust['Email'] ?? '',
                        ':tel' => $cust['Tel'] ?? '',
                        ':cnt' => $cust['Country'] ?? ''
                    ]);
                }

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
                            ':rt' => $room['RoomType'] ?? '',
                            ':cin' => $room['Checkindate'] ?? date('Y-m-d'),
                            ':cout' => $room['Checkoutdate'] ?? date('Y-m-d', strtotime('+2 days')),
                            ':tot' => (float)($room['Total'] ?? 0),
                            ':rn' => $room['rate_name'] ?? ''
                        ]);
                    }
                }

                $pdo->commit();
                $statBookings++;
                logMsg("Ingested Booking ID: {$Booking_Id} (Postgres Res_id: {$newResId})", "success");
            }
        }
    }

    // =========================================================================
    // STEP 2: MARKSEND ACKNOWLEDGMENT (<markSendRQ>)
    // =========================================================================
    logMsg("=== [STEP 2/4] MARKSEND BOOKING ACKNOWLEDGMENTS ===", "info");

    foreach ($activeHotels as $hotel) {
        $HotelCode = $hotel['HotelCode'];
        $UserName  = $hotel['Username'];
        $Password  = $hotel['Password'];

        $resStmt = $pdo->prepare("SELECT * FROM \"Reservations\" WHERE COALESCE(\"MarkSend\", 0) = 0 AND \"Hotel_Code\" = :hotel_code LIMIT 15");
        $resStmt->execute([':hotel_code' => $HotelCode]);
        $pendingReservations = $resStmt->fetchAll();

        foreach ($pendingReservations as $row2) {
            $Res_id     = $row2['Res_id'];
            $PnrID      = $row2['PnrID'];
            $Booking_Id = $row2['Booking_Id'];

            $curl = curl_init();
            curl_setopt_array($curl, [
                CURLOPT_URL => $api_url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => "<markSendRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n<PnrID>{$PnrID}</PnrID>\r\n<SrvNum>{$Res_id}</SrvNum>\r\n</markSendRQ>",
                CURLOPT_HTTPHEADER => ["content-type: text/xml"],
            ]);
            $response = curl_exec($curl);
            $err = curl_error($curl);
            curl_close($curl);

            if ($err) {
                logMsg("MarkSend cURL Error for Booking {$Booking_Id}: {$err}", "error");
            } else {
                $pdo->beginTransaction();
                $insLog = $pdo->prepare("INSERT INTO \"MarkSend_Response\" (\"Hotel_Code\", \"Booking_id\", \"Service\", \"PnrID\", \"Message\", \"Type\") VALUES (:hc, :bid, :srv, :pnr, 'Auto-Sync Acknowledged', 'B')");
                $insLog->execute([
                    ':hc' => $HotelCode,
                    ':bid' => $Booking_Id,
                    ':srv' => (string)$Res_id,
                    ':pnr' => $PnrID
                ]);

                $updRes = $pdo->prepare("UPDATE \"Reservations\" SET \"MarkSend\" = 1 WHERE \"Res_id\" = :res_id");
                $updRes->execute([':res_id' => $Res_id]);

                $pdo->commit();
                $statMarkSend++;
                logMsg("MarkSend Acknowledged for Booking ID {$Booking_Id} (Res_id: {$Res_id})", "success");
            }
        }
    }

    // =========================================================================
    // STEP 3: PUSH ROOM AVAILABILITY (<availabilityUpdateRQ>)
    // =========================================================================
    logMsg("=== [STEP 3/4] PUSHING ROOM AVAILABILITY ===", "info");

    $availStmt = $pdo->query("
        SELECT a.*, h.\"Username\", h.\"Password\"
        FROM trans_roomavailability_chart_datewise a
        JOIN \"Mas_Hotel\" h ON a.hotelcode = h.\"HotelCode\"
        WHERE COALESCE(a.uploadflg, 0) = 0
        LIMIT 50
    ");
    $pendingAvail = $availStmt->fetchAll();

    foreach ($pendingAvail as $row) {
        $avaidd    = $row['avaidd'];
        $HotelCode = $row['hotelcode'];
        $allotcode = $row['allotcode'];
        $fromdate  = $row['fromdate'];
        $todate    = $row['todate'];
        $rooms     = $row['Availablerooms'];
        $stopsales = $row['stopsales'];
        $UserName  = $row['Username'];
        $Password  = $row['Password'];

        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $api_url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => "POST",
            CURLOPT_POSTFIELDS => "<availabilityUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<availInfo>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n<allotmentCode>{$allotcode}</allotmentCode>\r\n<fromd>{$fromdate}</fromd>\r\n<tod>{$todate}</tod>\r\n<allotment>{$rooms}</allotment>\r\n<stopSales>{$stopsales}</stopSales>\r\n</availInfo>\r\n</availabilityUpdateRQ>",
            CURLOPT_HTTPHEADER => ["content-type: text/xml"],
        ]);
        $response = curl_exec($curl);
        $err = curl_error($curl);
        curl_close($curl);

        if ($err) {
            logMsg("Availability cURL Error for Allotment {$allotcode}: {$err}", "error");
        } else {
            $updAvail = $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1 WHERE avaidd = :id");
            $updAvail->execute([':id' => $avaidd]);
            $statAvail++;
            logMsg("Availability pushed for Allotment {$allotcode} ({$fromdate} -> {$todate}, {$rooms} rooms)", "success");
        }
    }

    // =========================================================================
    // STEP 4: PUSH ROOM RATES (<RateUpdateRQ>)
    // =========================================================================
    logMsg("=== [STEP 4/4] PUSHING ROOM RATES ===", "info");

    $rateStmt = $pdo->query("
        SELECT r.*, h.\"Username\", h.\"Password\"
        FROM \"Trans_roomrateupdates_datewise\" r
        JOIN \"Mas_Hotel\" h ON r.\"HotelCode\" = h.\"HotelCode\"
        WHERE COALESCE(r.\"uploadflg\", 0) = 0
        LIMIT 50
    ");
    $pendingRates = $rateStmt->fetchAll();

    foreach ($pendingRates as $row) {
        $rateid    = $row['rateid'];
        $HotelCode = $row['HotelCode'];
        $fromd     = $row['fromdate'];
        $todate    = $row['todate'];
        $UserName  = $row['Username'];
        $Password  = $row['Password'];

        $combination = "<combination><adult>1</adult><price>" . (float)($row['adultprice1'] ?? 100) . "</price></combination>" .
                       "<combination><adult>2</adult><price>" . (float)($row['adultprice2'] ?? 120) . "</price></combination>" .
                       "<combination><adult>3</adult><price>" . (float)($row['adultprice3'] ?? 150) . "</price></combination>" .
                       "<combination><adult>4</adult><price>" . (float)($row['adultprice4'] ?? 180) . "</price></combination>";

        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $api_url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => "POST",
            CURLOPT_POSTFIELDS => "<RateUpdateRQ>\r\n<RequestorID>\r\n<UserName>{$UserName}</UserName>\r\n<Password>{$Password}</Password>\r\n</RequestorID>\r\n<rateInfo>\r\n<hotelCode>{$HotelCode}</hotelCode>\r\n<rateId>{$rateid}</rateId>\r\n<fromd>{$fromd}</fromd>\r\n<tod>{$todate}</tod>\r\n<freeCancel>0</freeCancel>\r\n<clpolicy>1</clpolicy>\r\n<paypolicy>1</paypolicy>\r\n<closeout>0</closeout>\r\n<partialUpdate>2</partialUpdate>\r\n<combinations>{$combination}</combinations>\r\n</rateInfo>\r\n</RateUpdateRQ>",
            CURLOPT_HTTPHEADER => ["content-type: text/xml"],
        ]);
        $response = curl_exec($curl);
        $err = curl_error($curl);
        curl_close($curl);

        if ($err) {
            logMsg("Rate cURL Error for Rate ID {$rateid}: {$err}", "error");
        } else {
            $updRate = $pdo->prepare("UPDATE \"Trans_roomrateupdates_datewise\" SET \"uploadflg\" = 1 WHERE \"rateid\" = :id");
            $updRate->execute([':id' => $rateid]);
            $statRates++;
            logMsg("Rates pushed for Rate ID {$rateid} ({$fromd} -> {$todate})", "success");
        }
    }

    logMsg("Auto-Sync Cycle Finished at " . date("Y-m-d H:i:s"), "success");

} catch (Exception $e) {
    logMsg("Pipeline Exception: " . $e->getMessage(), "error");
}
?>
    </div>

    <!-- Cycle Result Summary Cards -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-val"><?php echo $statBookings; ?></div>
            <div class="stat-lbl">1. Bookings Ingested</div>
        </div>
        <div class="stat-card">
            <div class="stat-val"><?php echo $statMarkSend; ?></div>
            <div class="stat-lbl">2. MarkSend Acknowledged</div>
        </div>
        <div class="stat-card">
            <div class="stat-val"><?php echo $statAvail; ?></div>
            <div class="stat-lbl">3. Allotments Pushed</div>
        </div>
        <div class="stat-card">
            <div class="stat-val"><?php echo $statRates; ?></div>
            <div class="stat-lbl">4. Rate Updates Pushed</div>
        </div>
    </div>
</div>

<script>
let remaining = <?php echo $refresh_interval; ?>;
const timerEl = document.getElementById('timer');
if (timerEl) {
    setInterval(() => {
        if (remaining > 0) {
            remaining--;
            timerEl.textContent = remaining;
        }
    }, 1000);
}
</script>
</body>
</html>
