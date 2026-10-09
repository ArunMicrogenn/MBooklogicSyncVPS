<?php
/**
 * BookLogic Specific Hotel & Booking Diagnostic Tool
 * Usage:
 *   php debug_sync_hotel.php --hotel=COI4076
 *   php debug_sync_hotel.php --hotel=COI4076 --booking=MC-25-0189647869
 */

ini_set('display_errors', 1);
date_default_timezone_set('UTC');

require_once __DIR__ . '/db.php';

$api_url = getenv('BOOKLOGIC_API_URL') ?: (defined('BOOKLOGIC_API_URL') ? BOOKLOGIC_API_URL : 'https://xrs.booklogic.net/ws/external-pms/microgenn');

$options = getopt("", ["hotel::", "booking::", "user::", "pass::"]);
$hotelCode = trim($options['hotel'] ?? 'COI4076');
$targetBooking = trim($options['booking'] ?? 'MC-25-0189647869');
$customUser = trim($options['user'] ?? '');
$customPass = trim($options['pass'] ?? '');

echo "======================================================================\n";
echo "   BOOKLOGIC HOTEL DIAGNOSTIC: {$hotelCode}\n";
echo "======================================================================\n";

// 1. Check if hotel exists in mas_hotel
echo "[1] Checking hotel '{$hotelCode}' in mas_hotel table...\n";
$stmt = $pdo->prepare("SELECT hotelcode, username, password, COALESCE(inactive, 0) as inactive FROM mas_hotel WHERE LOWER(TRIM(hotelcode)) = LOWER(TRIM(:h))");
$stmt->execute([':h' => $hotelCode]);
$hotel = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$hotel && empty($customUser)) {
    echo "  [ERROR] Hotel '{$hotelCode}' was NOT found in mas_hotel table!\n";
    echo "  This is why bookings for '{$hotelCode}' were never fetched.\n\n";
    echo "  To register '{$hotelCode}', run:\n";
    echo "  PGPASSWORD=mgenn psql -h 127.0.0.1 -U postgres -d BOOKLOGIC -c \"INSERT INTO mas_hotel (hotelcode, username, password, inactive) VALUES ('{$hotelCode}', 'YOUR_BOOKLOGIC_USERNAME', 'YOUR_BOOKLOGIC_PASSWORD', 0);\"\n\n";
    echo "  Or re-run this tool with credentials:\n";
    echo "  php debug_sync_hotel.php --hotel={$hotelCode} --user=USERNAME --pass=PASSWORD\n";
    exit(1);
}

$userName = !empty($customUser) ? $customUser : $hotel['username'];
$password = !empty($customPass) ? $customPass : $hotel['password'];

if ($hotel && $hotel['inactive'] == 1) {
    echo "  [WARN] Hotel '{$hotelCode}' has inactive = 1! Enabling it...\n";
    $pdo->prepare("UPDATE mas_hotel SET inactive = 0 WHERE LOWER(TRIM(hotelcode)) = LOWER(TRIM(:h))")->execute([':h' => $hotelCode]);
}

echo "  Hotel: {$hotelCode} | Username: {$userName} | Status: Active\n\n";

// 2. Check if booking already exists in Reservations table
echo "[2] Checking if '{$targetBooking}' is already in VPS database...\n";
$chkRes = $pdo->prepare("SELECT \"Res_id\", \"Booking_Id\", \"Hotel_Code\", \"Status\", \"Insertdate\", \"MarkSend\" FROM \"Reservations\" WHERE \"Booking_Id\" LIKE :b");
$chkRes->execute([':b' => "%{$targetBooking}%"]);
$existing = $chkRes->fetchAll(PDO::FETCH_ASSOC);

if (!empty($existing)) {
    echo "  [FOUND] Booking is already present in VPS PostgreSQL:\n";
    print_r($existing);
    echo "\n";
} else {
    echo "  [NOT FOUND] Booking '{$targetBooking}' is NOT in VPS Reservations table.\n\n";
}

// 3. Query BookLogic API live
echo "[3] Sending <syncBookingRQ> to BookLogic API for Hotel '{$hotelCode}'...\n";
$requestXml = "<syncBookingRQ>\r\n" .
    "<RequestorID>\r\n" .
    "<UserName>{$userName}</UserName>\r\n" .
    "<Password>{$password}</Password>\r\n" .
    "</RequestorID>\r\n" .
    "<hotelCode>{$hotelCode}</hotelCode>\r\n" .
    "</syncBookingRQ>";

$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => $api_url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 45,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => "POST",
    CURLOPT_POSTFIELDS => $requestXml,
    CURLOPT_HTTPHEADER => ["content-type: text/xml; charset=utf-8"],
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
]);
$response = curl_exec($curl);
$err = curl_error($curl);
$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);

if ($err) {
    echo "  [cURL ERROR] {$err}\n";
    exit(1);
}

echo "  HTTP Status: {$httpCode}\n";
echo "  Raw Response:\n";
echo "  ---------------------------------------------------\n";
echo substr($response, 0, 2000) . (strlen($response) > 2000 ? "\n  ... [truncated]" : "") . "\n";
echo "  ---------------------------------------------------\n\n";

// 4. Parse response
$xml = @simplexml_load_string((string)$response, 'SimpleXMLElement', LIBXML_NOCDATA);
if (!$xml) {
    echo "  [ERROR] Could not parse BookLogic XML response!\n";
    exit(1);
}

if (isset($xml->Errors->Error)) {
    echo "  [BOOKLOGIC NOTICE] " . (string)$xml->Errors->Error . "\n";
    echo "  If BookLogic says 'No booking found', the booking was already acknowledged with <markSendRQ> or has not been pushed to PMS queue yet.\n";
    exit(0);
}

$xpathBookings = $xml->xpath('//Booking') ?: ($xml->xpath('//booking') ?: []);
echo "[4] Parsed Bookings in Queue: " . count($xpathBookings) . "\n";

foreach ($xpathBookings as $b) {
    $bAttrs = is_object($b) ? $b->attributes() : [];
    $bId = (string)($bAttrs['id'] ?? $bAttrs['Booking_Id'] ?? $b->Booking_Id ?? $b->id ?? '');
    echo "  - Booking ID in queue: {$bId}\n";
}

echo "\nDone!\n";
