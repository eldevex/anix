<?php
/**
 * AnixWeb proxy — подставляет User-Agent AnixartApp к API Anixart.
 * Нужен только для создания комментариев: браузер не может отправить UA сам.
 * Загрузите этот файл на любой PHP-хостинг и укажите его URL в Настройках сайта.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$ALLOWED = 'api-s.anixsekai.com';
$UA = 'AnixartApp/9.0 BETA 9-25110702 (Android 13; SDK 33; x86_64)';

$req = json_decode(file_get_contents('php://input'), true);
if (!is_array($req) || empty($req['path'])) {
    http_response_code(400); echo json_encode(['error' => 'bad request']); exit;
}
$method = isset($req['method']) ? strtoupper($req['method']) : 'GET';
if (!in_array($method, ['GET', 'POST'])) {
    http_response_code(400); echo json_encode(['error' => 'bad method']); exit;
}

$ch = curl_init();
$headers = ['Accept: application/json', 'User-Agent: ' . $UA];
$opts = [
    CURLOPT_URL => 'https://' . $ALLOWED . $req['path'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
];
if ($method === 'POST') {
    if (isset($req['form'])) {
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        $opts[CURLOPT_POSTFIELDS] = http_build_query($req['form']);
    } else {
        $headers[] = 'Content-Type: application/json';
        $opts[CURLOPT_POSTFIELDS] = isset($req['body']) ? json_encode($req['body']) : '';
    }
}
$opts[CURLOPT_HTTPHEADER] = $headers;
curl_setopt_array($ch, $opts);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);
if ($err) { http_response_code(502); echo json_encode(['error' => $err]); exit; }
http_response_code($code ?: 502);
echo $body;
