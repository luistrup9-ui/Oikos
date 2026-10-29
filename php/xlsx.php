<?php
// Generador mínimo de archivos XLSX (una hoja, encabezado en negrita) sin extensiones: XML de Office Open en un ZIP sin compresión.
// Igual a xlsx.js; no necesita la extensión zip de PHP (que muchos hostings no traen activa).
declare(strict_types=1);

function zip_sin_compresion(array $archivos): string {
    $partes = ''; $central = ''; $offset = 0;
    foreach ($archivos as [$nombre, $datos]) {
        $crc = crc32($datos); $largo = strlen($datos); $n = strlen($nombre);
        $local = pack('VvvvvvVVVvv', 0x04034b50, 20, 0x0800, 0, 0, 0, $crc, $largo, $largo, $n, 0);
        $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, 0, 0, $crc, $largo, $largo, $n, 0, 0, 0, 0, 0, $offset) . $nombre;
        $partes .= $local . $nombre . $datos;
        $offset += 30 + $n + $largo;
    }
    return $partes . $central . pack('VvvvvVVv', 0x06054b50, 0, 0, count($archivos), count($archivos), strlen($central), $offset, 0);
}

function xml_texto($v): string {
    return preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', '', str_replace(['&', '<', '>', '"'], ['&amp;', '&lt;', '&gt;', '&quot;'], (string)$v));
}
function columna_xlsx(int $i): string { $s = ''; for ($i++; $i; $i = intdiv($i - 1, 26)) $s = chr(65 + ($i - 1) % 26) . $s; return $s; }
// Número como lo escribe JavaScript (sin ".0" de más)
function numero_js($v): string { if (is_int($v)) return (string)$v; $s = json_encode($v); return str_ends_with($s, '.0') ? substr($s, 0, -2) : $s; } // la forma más corta, como JavaScript

// $filas: arreglo de arreglos; la primera es el encabezado. $anchos: caracteres por columna (opcional)
function xlsx(string $hoja, array $filas, array $anchos = []): string {
    $celdas = '';
    foreach (array_values($filas) as $r => $fila) {
        $celdas .= '<row r="' . ($r + 1) . '">';
        foreach (array_values($fila) as $c => $v) {
            if ($v === null || $v === '') continue;
            $ref = columna_xlsx($c) . ($r + 1); $estilo = $r === 0 ? ' s="1"' : '';
            $celdas .= (is_int($v) || (is_float($v) && is_finite($v))) ? "<c r=\"$ref\"$estilo><v>" . numero_js($v) . '</v></c>'
                : "<c r=\"$ref\" t=\"inlineStr\"$estilo><is><t xml:space=\"preserve\">" . xml_texto($v) . '</t></is></c>';
        }
        $celdas .= '</row>';
    }
    $cols = '';
    if ($anchos) { $cols = '<cols>'; foreach ($anchos as $i => $w) $cols .= '<col min="' . ($i + 1) . '" max="' . ($i + 1) . "\" width=\"$w\" customWidth=\"1\"/>"; $cols .= '</cols>'; }
    $x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zip_sin_compresion([
        ['[Content_Types].xml', $x . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
        ['_rels/.rels', $x . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', $x . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' . xml_texto(mb_substr($hoja, 0, 31)) . '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
        ['xl/_rels/workbook.xml.rels', $x . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
        ['xl/styles.xml', $x . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7EBF9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'],
        ['xl/worksheets/sheet1.xml', $x . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' . $cols . '<sheetData>' . $celdas . '</sheetData></worksheet>'],
    ]);
}

// CSV con punto y coma y BOM, como lo abre Excel en español
function csv(array $filas): string {
    return "\u{FEFF}" . implode("\r\n", array_map(fn($f) => implode(';', array_map(fn($v) => '"' . str_replace('"', '""', (string)($v ?? '')) . '"', $f)), $filas));
}
