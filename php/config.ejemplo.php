<?php
// Configuración de OIKOS. Copia este archivo como config.php (en esta misma carpeta) y llena los datos.
// config.php NO va al repositorio: tiene la clave de la base de datos.
return [
    // Base de datos MySQL (en cPanel: «Bases de datos MySQL» crea la base, el usuario y le das todos los privilegios)
    'db_host' => 'localhost',
    'db_nombre' => 'oikos',
    'db_usuario' => 'root',
    'db_clave' => '',

    // Carpeta donde se guardan los archivos adjuntos y las copias de seguridad. Debe quedar FUERA de public_html.
    // Si se deja vacía se usa la carpeta «datos» al lado de php/ (protegida con .htaccess).
    'datos_dir' => '',

    // Dirección con la que la gente abre OIKOS (ej. https://oikos.metalcof.co). Con ella se arman los enlaces del correo.
    'app_url' => '',

    // Duración de la sesión, en horas
    'sesion_horas' => 12,

    // Correo para «¿Olvidaste tu clave?». Sin smtp_host, la petición le aparece al administrador en Usuarios.
    'smtp_host' => '',
    'smtp_puerto' => 587,         // 465 = conexión segura directa
    'smtp_usuario' => '',
    'smtp_clave' => '',          // en Gmail o Microsoft 365 suele ser una «contraseña de aplicación»
    'smtp_remitente' => '',      // por defecto, smtp_usuario

    // Copias de seguridad: cuántas se conservan. La copia diaria la hace el Cron de cPanel (herramientas/respaldar.php);
    // pon respaldo_automatico en true cuando lo configures, para que la pantalla de Respaldos lo indique.
    'respaldos_conservar' => 30,
    'respaldo_automatico' => false,
    'respaldo_hora' => 2,
];
