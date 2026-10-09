<?php
/**
 * Direct Room Inventory Push Tool for Hotel COI4076
 * Usage:
 *   php push_inventory_coi4076.php
 *   php push_inventory_coi4076.php --hotel=COI4076 --limit=50
 */

ini_set('display_errors', 1);
date_default_timezone_set('UTC');

require_once __DIR__ . '/db.php';

$api_url = getenv('BOOKLOGIC_API_URL') ?: (defined('BOOKLOGIC_API_URL') ? BOOKLOGIC_API_URL : 'https://xrs.booklogic.net/ws/external-pms/microgenn');

$options   = getopt("", ["hotel::", "limit::", "force"]);
$hotelCode = trim($options['hotel'] ?? 'COI4076');
$limit     = isset($options['limit']) ? (int)$options['limit'] : 100;
$force     = isset($options['force']);

echo "======================================================================\n";
echo "   PUSHING ROOM INVENTORY TO BOOKLOGIC: {$hotelCode}\n";
echo "======================================================================\n";

// 1. Resolve or auto-register hotel in mas_hotel
$stmt = $pdo->prepare("SELECT hotelcode, username, password FROM mas_hotel WHERE LOWER(TRIM(hotelcode)) = LOWER(TRIM(:h))");
$stmt->execute([':h' => $hotelCode]);
$hotel = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$hotel) {
    echo "[!] Hotel '{$hotelCode}' was not in mas_hotel. Auto-registering with MicrogennPMS credentials...\n";
    $userName = 'MicrogennPMS';
    $password = 'DU4rbc2A';
    try {
        $pdo->prepare("INSERT INTO mas_hotel (hotelcode, username, password, inactive) VALUES (:h, :u, :p, 0) ON CONFLICT (hotelcode) DO UPDATE SET username = EXCLUDED.username, password = EXCLUDED.password, inactive = 0")->execute([
            ':h' => $hotelCode,
            ':u' => $userName,
            ':p' => $password
        ]);
        echo "    Registered successfully.\n";
    } catch (Exception $e) {
        echo "    Notice: " . $e->getMessage() . "\n";
    }
} else {
    $userName = $hotel['username'];
    $password = $hotel['password'];
}

echo "Using Credentials -> Hotel: {$hotelCode} | User: {$userName}\n\n";

// 2. Select rows from trans_roomavailability_chart_datewise
$whereClause = $force ? "WHERE LOWER(TRIM(hotelcode)) = LOWER(TRIM(:h))" : "WHERE LOWER(TRIM(hotelcode)) = LOWER(TRIM(:h)) AND COALESCE(uploadflg, 0) = 0";
$query = "SELECT * FROM trans_roomavailability_chart_datewise {$whereClause} ORDER BY avaidd DESC LIMIT {$limit}";
$rowsStmt = $pdo->prepare($query);
$rowsStmt->execute([':h' => $hotelCode]);
$rows = $rowsStmt->fetchAll(PDO::FETCH_ASSOC);

echo "Found " . count($rows) . " row(s) to push.\n\n";

if (empty($rows)) {
    echo "No rows found with uploadflg = 0 for hotel '{$hotelCode}'.\n";
    echo "To push all rows anyway, re-run with --force:\n";
    echo "  php push_inventory_coi4076.php --hotel={$hotelCode} --force\n";
    exit(0);
}

$successCount = 0;
$failCount = 0;

foreach ($rows as $idx => $r) {
    $avaidd    = $r['avaidd'];
    $alID      = !empty(trim((string)($r['allotcode'] ?? ''))) ? trim((string)$r['allotcode']) : trim((string)($r['roomtypeid'] ?? ''));
    $fromRaw   = substr((string)($r['fromdate'] ?? ''), 0, 10);
    $toRaw     = substr((string)($r['todate'] ?? ''), 0, 10);
    $fromd     = !empty($fromRaw) ? date("Y-m-d", strtotime($fromRaw)) : date("Y-m-d");
    $todate    = !empty($toRaw) ? date("Y-m-d", strtotime($toRaw)) : date("Y-m-d");
    $initAllot = trim((string)($r['availablerooms'] ?? $r['Availablerooms'] ?? $r['available_rooms'] ?? '0'));
    $stopsales = trim((string)($r['stopsales'] ?? '0'));

    echo sprintf("[%02d] ID #%d | Allot: %s | Dates: %s -> %s | Rooms: %s | StopSales: %s ... ",
        $idx + 1, $avaidd, $alID, $fromd, $todate, $initAllot, $stopsales);

    if (empty($alID)) {
        echo "SKIPPED (allotcode and roomtypeid are empty)\n";
        $failCount++;
        continue;
    }

    $availPayload = "<availabilityUpdateRQ>\r\n" .
        "<RequestorID>\r\n" .
        "\t<UserName>{$userName}</UserName>\r\n" .
        "\t<Password>{$password}</Password>\r\n" .
        "</RequestorID>\r\n" .
        "<allotInfo>\r\n" .
        "\t<hotelCode>{$hotelCode}</hotelCode>\r\n" .
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
            "postman-token: 7514e2d6-d4e3-e8c8-4ae3-3eb6045f43da"
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
    ]);
    $response = curl_exec($curl);
    $err = curl_error($curl);
    curl_close($curl);

    if ($err) {
        echo "FAILED (cURL: {$err})\n";
        $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET remarks = :rem WHERE avaidd = :id")->execute([
            ':rem' => substr("cURL Error: " . $err, 0, 250),
            ':id'  => $avaidd
        ]);
        $failCount++;
        continue;
    }

    $xml = @simplexml_load_string(trim((string)$response), 'SimpleXMLElement', LIBXML_NOCDATA);
    if ($xml && (isset($xml->Errors->Error) || isset($xml->Error))) {
        $errMsg = (string)($xml->Errors->Error ?? $xml->Error);
        echo "REJECTED by BookLogic: {$errMsg}\n";
        $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET remarks = :rem WHERE avaidd = :id")->execute([
            ':rem' => substr("BookLogic Error: " . $errMsg, 0, 250),
            ':id'  => $avaidd
        ]);
        $failCount++;
        continue;
    }

    // Success! Update uploadflg = 1 and remarks = 'BookLogic Synced'
    $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1, remarks = 'BookLogic Synced' WHERE avaidd = :id")->execute([':id' => $avaidd]);
    echo "SUCCESS (uploadflg=1, remarks='BookLogic Synced')\n";
    $successCount++;
}

echo "\n======================================================================\n";
echo "SUMMARY: {$successCount} pushed successfully | {$failCount} failed\n";
echo "======================================================================\n";
