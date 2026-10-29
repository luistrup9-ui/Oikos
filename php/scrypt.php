<?php
// scrypt en PHP puro: solo para verificar las claves creadas por la versión Node (formato "sal:hash", N=16384, r=8, p=1, 32 bytes).
// Al acertar, la clave se vuelve a guardar con password_hash() (ver nucleo.php), así que esto corre una sola vez por persona.
declare(strict_types=1);

function scrypt_salsa208(array $b): array {
    $x = $b;
    for ($i = 0; $i < 8; $i += 2) {
        $x[4] ^= scrypt_rotl(($x[0] + $x[12]) & 0xffffffff, 7);  $x[8] ^= scrypt_rotl(($x[4] + $x[0]) & 0xffffffff, 9);
        $x[12] ^= scrypt_rotl(($x[8] + $x[4]) & 0xffffffff, 13); $x[0] ^= scrypt_rotl(($x[12] + $x[8]) & 0xffffffff, 18);
        $x[9] ^= scrypt_rotl(($x[5] + $x[1]) & 0xffffffff, 7);  $x[13] ^= scrypt_rotl(($x[9] + $x[5]) & 0xffffffff, 9);
        $x[1] ^= scrypt_rotl(($x[13] + $x[9]) & 0xffffffff, 13); $x[5] ^= scrypt_rotl(($x[1] + $x[13]) & 0xffffffff, 18);
        $x[14] ^= scrypt_rotl(($x[10] + $x[6]) & 0xffffffff, 7); $x[2] ^= scrypt_rotl(($x[14] + $x[10]) & 0xffffffff, 9);
        $x[6] ^= scrypt_rotl(($x[2] + $x[14]) & 0xffffffff, 13); $x[10] ^= scrypt_rotl(($x[6] + $x[2]) & 0xffffffff, 18);
        $x[3] ^= scrypt_rotl(($x[15] + $x[11]) & 0xffffffff, 7); $x[7] ^= scrypt_rotl(($x[3] + $x[15]) & 0xffffffff, 9);
        $x[11] ^= scrypt_rotl(($x[7] + $x[3]) & 0xffffffff, 13); $x[15] ^= scrypt_rotl(($x[11] + $x[7]) & 0xffffffff, 18);
        $x[1] ^= scrypt_rotl(($x[0] + $x[3]) & 0xffffffff, 7);  $x[2] ^= scrypt_rotl(($x[1] + $x[0]) & 0xffffffff, 9);
        $x[3] ^= scrypt_rotl(($x[2] + $x[1]) & 0xffffffff, 13); $x[0] ^= scrypt_rotl(($x[3] + $x[2]) & 0xffffffff, 18);
        $x[6] ^= scrypt_rotl(($x[5] + $x[4]) & 0xffffffff, 7);  $x[7] ^= scrypt_rotl(($x[6] + $x[5]) & 0xffffffff, 9);
        $x[4] ^= scrypt_rotl(($x[7] + $x[6]) & 0xffffffff, 13); $x[5] ^= scrypt_rotl(($x[4] + $x[7]) & 0xffffffff, 18);
        $x[11] ^= scrypt_rotl(($x[10] + $x[9]) & 0xffffffff, 7); $x[8] ^= scrypt_rotl(($x[11] + $x[10]) & 0xffffffff, 9);
        $x[9] ^= scrypt_rotl(($x[8] + $x[11]) & 0xffffffff, 13); $x[10] ^= scrypt_rotl(($x[9] + $x[8]) & 0xffffffff, 18);
        $x[12] ^= scrypt_rotl(($x[15] + $x[14]) & 0xffffffff, 7); $x[13] ^= scrypt_rotl(($x[12] + $x[15]) & 0xffffffff, 9);
        $x[14] ^= scrypt_rotl(($x[13] + $x[12]) & 0xffffffff, 13); $x[15] ^= scrypt_rotl(($x[14] + $x[13]) & 0xffffffff, 18);
    }
    for ($i = 0; $i < 16; $i++) $x[$i] = ($x[$i] + $b[$i]) & 0xffffffff;
    return $x;
}
function scrypt_rotl(int $v, int $c): int { return (($v << $c) | ($v >> (32 - $c))) & 0xffffffff; }

// BlockMix con r = 8: el bloque son 2r = 16 trozos de 16 palabras
function scrypt_blockmix(array $b, int $r): array {
    $x = array_slice($b, (2 * $r - 1) * 16, 16);
    $pares = []; $impares = [];
    for ($i = 0; $i < 2 * $r; $i++) {
        $t = [];
        for ($j = 0; $j < 16; $j++) $t[$j] = $x[$j] ^ $b[$i * 16 + $j];
        $x = scrypt_salsa208($t);
        if ($i % 2) $impares[] = $x; else $pares[] = $x;
    }
    return array_merge(...$pares, ...$impares);
}

function scrypt_hash(string $clave, string $sal, int $n = 16384, int $r = 8, int $p = 1, int $largo = 32): string {
    $b = hash_pbkdf2('sha256', $clave, $sal, 1, $p * 128 * $r, true);
    $salida = '';
    for ($k = 0; $k < $p; $k++) {
        $x = array_values(unpack('V*', substr($b, $k * 128 * $r, 128 * $r)));
        $v = [];
        for ($i = 0; $i < $n; $i++) { $v[$i] = pack('V*', ...$x); $x = scrypt_blockmix($x, $r); } // en binario: ~16 MB en vez de cientos
        for ($i = 0; $i < $n; $i++) {
            $j = $x[(2 * $r - 1) * 16] & ($n - 1);
            $vj = array_values(unpack('V*', $v[$j]));
            foreach ($x as $q => $palabra) $x[$q] = $palabra ^ $vj[$q];
            $x = scrypt_blockmix($x, $r);
        }
        $salida .= pack('V*', ...$x);
    }
    return hash_pbkdf2('sha256', $clave, $salida, 1, $largo, true);
}
