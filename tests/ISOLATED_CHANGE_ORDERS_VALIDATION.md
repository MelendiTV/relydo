# Preparación de validación aislada de Change Orders

Estado: preparación; integración completa NO ejecutada. No aplicar estos pasos al proyecto operativo. Las migraciones y las pruebas existentes no se modifican como parte de este documento.

## Entorno propuesto

Supabase local desechable, con PostgreSQL, Auth y PostgREST, en contenedores. Usar una carpeta y volúmenes exclusivos para la prueba, fuera del checkout de aplicación; no enlazar el CLI con RELYDO ni copiar sus archivos .env. No es necesario crear un proyecto o branch en la nube inicialmente.

Se necesita autorización antes de instalar herramientas, descargar imágenes o consultar/exportar definiciones externas. En la inspección inicial, docker, psql, postgres y supabase no se resolvieron mediante Get-Command. Esto no prueba que no existan en otra ubicación.

## Insumos que faltan

- Exportación solo de esquema anterior a 001: tablas, tipos, secuencias, funciones completas, triggers, índices, constraints, políticas RLS, propietarios y privilegios efectivos; extensiones y versiones relevantes. Incluir dependencias de otros esquemas y configuración de roles necesaria para interpretar los permisos.
- Inventario de tareas programadas, triggers HTTP, webhooks de base de datos y cualquier integración saliente. No activarlos al restaurar.
- Clientes móviles o contratos ejecutables disponibles para verificar Payment Sheet; las simulaciones actuales no equivalen al SDK móvil real.

La exportación no debe contener filas, usuarios, tokens, contraseñas ni valores de secretos. Revisar los cuerpos de funciones de forma privada porque pueden contener URLs o secretos incrustados; redactar secretos y documentar las sustituciones. Las funciones de salida externa deberán sustituirse por stubs locales, dejando constancia de la menor fidelidad. No restaurar un dump sin revisar sus efectos.

## Aislamiento obligatorio antes de ejecutar

- Red de contenedores sin salida externa durante las pruebas; descargas de imágenes, si se autorizan, se realizan antes. Publicar únicamente puertos de loopback.
- Credenciales nuevas y ficticias, exclusivamente del stack local. No cargar .env, .env.local ni claves del proyecto operativo.
- Bloquear desde el proceso de aplicación cualquier destino distinto del stack y simuladores locales. Una configuración de URL por sí sola no es un aislamiento suficiente.
- Stripe simulado localmente; no llamadas a api.stripe.com ni siquiera en TEST MODE. Simular resultados de cobro, transferencia y reembolso. La fidelidad con Stripe real quedará explícitamente sin verificar.
- Solo fixtures sintéticas creadas después de revisar el esquema completo. No copiar ni recalcular históricos.

## Secuencia y criterios de aceptación

1. Restaurar esquema revisado en base vacía; comprobar inventario y dependencias. Guardar definiciones y ACL previas para comparación.
2. Aplicar 001 y después 002 con parada ante error. Inspeccionar todos los cuerpos transformados: firmas, propietarios, ACL y diferencias permitidas. En particular, comprobar que la inserción en BEGIN no afecte comentarios o literales.
3. Probar permisos por PostgREST con JWT locales para anon, Customer propietario/ajeno, Provider activo/inactivo y servidor. No sustituir esta comprobación únicamente por SET ROLE como superusuario.
4. Ejecutar RPC reales y escrituras directas para verificar triggers. Mantener los fixtures existentes como regresión, sin presentarlos como el esquema completo.
5. Usar conexiones PostgreSQL independientes y barreras deterministas: reserva web/web y web/móvil; confirmación/webhook duplicados; confirmación contra cancelación, liberación, finalización, reasignación y reclamo; Admin contra liberación automática. Comprobar estado final e invariantes, no solo respuestas HTTP. Registrar esperas, errores NOWAIT, reintentos y timeouts.
6. Ejecutar las rutas actuales con Supabase local y Stripe simulado: navegador cerrado, token expirado, eventos repetidos/desordenados, errores antes/después del efecto simulado, fallo al guardar y reintentos. Comprobar una sola instrucción financiera y recuperación sin nuevo movimiento simulado.
7. Separar cierre pay_provider sin movimiento de resolución con transferencia/reembolso. Los históricos sintéticos sin clasificación no se infieren automáticamente.
8. En otra base desechable, probar rollback 002 → 001 sin uso, conservación de filas sintéticas, reinstalación y rechazo de rollback con evidencia. Probar también instalación incompleta y versiones mezcladas bajo mantenimiento.

Guardar comandos, versiones, hashes de esquema/migraciones/código, resultados y diferencias. Si una dependencia no puede reproducirse, marcar ese escenario como no verificado. No autorizar producción por un resultado local favorable.

## Punto de autorización

Antes de continuar se requiere decidir la instalación de Docker Desktop y Supabase CLI (si no existen), con sus dependencias y descarga de imágenes, y una exportación de esquema exclusivamente en lectura del proyecto operativo. Si se requiere habilitar WSL2/virtualización, reinicio, permisos de administrador o acceso a un servicio externo adicional, detenerse antes de efectuarlo. No crear proyectos externos como alternativa automática.
