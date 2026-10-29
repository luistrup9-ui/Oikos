<?php
// Envío de correo por SMTP (para «¿Olvidaste tu clave?»), sin librerías externas: STARTTLS (587) o SSL directo (465) y AUTH LOGIN.
// Se activa con smtp_host y app_url en config.php; sin ellos, la petición le llega al administrador como aviso.
declare(strict_types=1);

function correo_configurado(): bool { return (bool)config('smtp_host') && (bool)config('app_url'); }
function enlace_restablecer(string $token): string { return rtrim((string)config('app_url'), '/') . '/#/restablecer?t=' . $token; }

function correo_enviar(string $a, string $asunto, string $texto): void {
    if (!correo_configurado()) throw new RuntimeException('El correo no está configurado');
    $host = (string)config('smtp_host'); $puerto = (int)(config('smtp_puerto') ?: 587);
    $seguro = $puerto === 465;
    $s = @stream_socket_client(($seguro ? 'ssl://' : 'tcp://') . "$host:$puerto", $errno, $err, 10);
    if (!$s) throw new RuntimeException("No se pudo conectar a $host:$puerto ($err)");
    stream_set_timeout($s, 20);
    $leer = function () use ($s): string { $r = ''; while (($l = fgets($s, 515)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; } return $r; };
    $cmd = function (?string $c, array $esperados) use ($s, $leer): string {
        if ($c !== null) fwrite($s, $c . "\r\n");
        $r = $leer();
        if (!in_array((int)substr($r, 0, 3), $esperados, true)) throw new RuntimeException('SMTP: ' . trim($r));
        return $r;
    };
    $cmd(null, [220]);
    $ehlo = $cmd('EHLO oikos', [250]);
    if (!$seguro && stripos($ehlo, 'STARTTLS') !== false) {
        $cmd('STARTTLS', [220]);
        if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('SMTP: no se pudo iniciar TLS');
        $cmd('EHLO oikos', [250]);
    }
    if (config('smtp_usuario')) {
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode((string)config('smtp_usuario')), [334]);
        $cmd(base64_encode((string)config('smtp_clave')), [235]);
    }
    $de = (string)(config('smtp_remitente') ?: config('smtp_usuario'));
    $cmd("MAIL FROM:<$de>", [250]);
    $cmd("RCPT TO:<$a>", [250, 251]);
    $cmd('DATA', [354]);
    $cuerpo = preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $texto));
    $mensaje = "From: OIKOS <$de>\r\nTo: <$a>\r\nSubject: =?UTF-8?B?" . base64_encode($asunto) . "?=\r\nDate: " . gmdate('D, d M Y H:i:s') . " +0000\r\n"
        . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . $cuerpo . "\r\n.";
    $cmd($mensaje, [250]);
    @fwrite($s, "QUIT\r\n");
    fclose($s);
}
