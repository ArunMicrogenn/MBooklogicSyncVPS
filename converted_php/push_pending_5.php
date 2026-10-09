<?php
/**
 * Direct Script to push the 5 pending records for COI4076
 * IDs: 7906, 7901, 7899, 7611, 7610
 */

ini_set('display_errors', 1);
date_default_timezone_set('UTC');

require_once __DIR__ . '/db.php';

$api_url = getenv('BOOKLOGIC_API_URL') ?: 'https://xrs.booklogic.net/ws/external-pms/microgenn';

echo "======================================================================\n";
echo "   PUSHING PENDING 5 RECORDS FOR HOTEL COI4076\n";
echo "======================================================================\n";

// 1. Get credentials for COI4076
$stmt = $pdo->prepare("SELECT hotelcode, username, password FROM mas_hotel WHERE LOWER(TRIM(hotelcode)) = 'coi4076'");
$stmt->execute();
$hotel = $stmt->fetch(PDO::FETCH_ASSOC);

$userName = $hotel['username'] ?? 'MicrogennPMS';
$password = $hotel['password'] ?? 'DU4rbc2A';
$hotelCode = 'COI4076';

echo "Credentials: Hotel {$hotelCode} | User: {$userName}\n\n";

// 2. Select all pending records for COI4076
$query = "
    SELECT * FROM public.trans_roomavailability_chart_datewise 
    WHERE LOWER(TRIM(hotelcode)) = 'coi4076' 
      AND COALESCE(uploadflg, 0) = 0 
      AND COALESCE(notupload, 0) = 0
    ORDER BY avaidd DESC
";
$rows = $pdo->query($query)->fetchAll(PDO::FETCH_ASSOC);

echo "Found " . count($rows) . " record(s) with uploadflg=0 for COI4076.\n\n";

if (empty($rows)) {
    echo "No pending records found with uploadflg = 0 for COI4076.\n";
    exit(0);
}

foreach ($rows as $idx => $r) {
    $avaidd    = $r['avaidd'];
    $alID      = !empty(trim((string)($r['allotcode'] ?? ''))) ? trim((string)$r['allotcode']) : trim((string)($r['roomtypeid'] ?? ''));
    $fromRaw   = substr((string)($r['fromdate'] ?? ''), 0, 10);
    $toRaw     = substr((string)($r['todate'] ?? ''), 0, 10);
    $fromd     = !empty($fromRaw) ? date("Y-m-d", strtotime($fromRaw)) : date("Y-m-d");
    $todate    = !empty($toRaw) ? date("Y-m-d", strtotime($toRaw)) : date("Y-m-d");
    $initAllot = trim((string)($r['availablerooms'] ?? $r['Availablerooms'] ?? $r['available_rooms'] ?? '0'));
    $stopsales = trim((string)($r['stopsales'] ?? '0'));

    echo sprintf("----------------------------------------------------------------------\n");
    echo sprintf("[%d/%d] ID #%d | RoomType: %s | AllotCode: %s | Dates: %s -> %s | Allot: %s | StopSales: %s\n",
        $idx + 1, count($rows), $avaidd, $r['roomtypeid'], $alID, $fromd, $todate, $initAllot, $stopsales);

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
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($err) {
        echo "  [cURL ERROR] {$err}\n";
        $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET remarks = :rem WHERE avaidd = :id")->execute([
            ':rem' => substr("cURL Error: " . $err, 0, 250),
            ':id'  => $avaidd
        ]);
        continue;
    }

    echo "  HTTP Status: {$httpCode}\n";
    $rawResp = trim((string)$response);
    echo "  BookLogic Response: {$rawResp}\n";

    $xml = @simplexml_load_string($rawResp, 'SimpleXMLElement', LIBXML_NOCDATA);
    if ($xml && (isset($xml->Errors->Error) || isset($xml->Error))) {
        $errMsg = (string)($xml->Errors->Error ?? $xml->Error);
        echo "  [REJECTED] BookLogic says: {$errMsg}\n";
        $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET remarks = :rem WHERE avaidd = :id")->execute([
            ':rem' => substr("BookLogic Error: " . $errMsg, 0, 250),
            ':id'  => $avaidd
        ]);
        continue;
    }

    // Success! Update uploadflg = 1
    $pdo->prepare("UPDATE trans_roomavailability_chart_datewise SET uploadflg = 1, remarks = 'BookLogic Synced', last_synced_at = NOW() WHERE avaidd = :id")->execute([':id' => $avaidd]);
    echo "  [SUCCESS] Marked uploadflg = 1 and remarks = 'BookLogic Synced'\n";
}

echo "\n======================================================================\n";
echo "   DONE! Check table status:\n";
echo "======================================================================\n";
