<?php
/**
 * PostgreSQL Database Connection for BookLogic Sync Service
 * Host: 72.61.240.34
 * Database: BOOKLOGIC
 * Converted from SQL Server (SQLEXPRESS) to PostgreSQL
 */

$host     = '72.61.240.34';
$port     = '5432';
$dbname   = 'BOOKLOGIC';
$user     = 'postgres';
$password = 'mgenn';

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;sslmode=prefer";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    // If connection fails, output error
    die("PostgreSQL Connection Failed to {$host}: " . $e->getMessage());
}

// BookLogic Channel Manager API Endpoint
$api_url = getenv('BOOKLOGIC_API_URL') ?: 'https://xrs.booklogic.net/ws/external-pms/microgenn';
if (!defined('BOOKLOGIC_API_URL')) {
    define('BOOKLOGIC_API_URL', $api_url);
}

// Fallback / legacy helper for pg_connect if needed
$pg_conn_str = "host=$host port=$port dbname=$dbname user=$user password=$password";
$dbhandle = @pg_connect($pg_conn_str);
