# RELYDO — Reparaciones de auditoría PRO

Fecha: 2026-09-01
Base: RELYDO-ACTUAL-2.zip

## Reparaciones aplicadas en código

1. Checkout inicial exige sesión autenticada y comprueba propietario de la solicitud.
2. Checkout valida que la solicitud siga abierta y la oferta siga pendiente.
3. Checkout toma título/nombre/importe desde servidor, no desde datos visuales enviados por el navegador.
4. Checkout congela importes, porcentajes y participantes en metadata de Stripe.
5. Checkout usa idempotency key para reducir sesiones duplicadas.
6. Verificación del pago inicial exige cliente autenticado o llamada interna firmada desde webhook.
7. Verificación del pago evita sobrescribir un PaymentIntent distinto y reembolsa automáticamente cobros duplicados/conflictivos.
8. Verificación del pago reclama la solicitud de forma condicional para evitar que dos pagos contraten dos profesionales.
9. Se añadió webhook de Stripe para finalizar pagos aunque el navegador no vuelva del Checkout.
10. Change Order verify exige autenticación o webhook interno, valida estado/propiedad y reembolsa duplicados o pagos que ya no pueden aplicarse.
11. Push de nuevo trabajo filtra profesionales por radio/ZIP y respeta idioma preferido.
12. Notificaciones server-side principales incorporan ES/EN y precomprobación de duplicados.
13. Login profesional ya no funciona como entrada alternativa para cuentas Admin.
14. Resolución Admin de reclamos usa el sistema de permisos/roles existente y no un email hardcodeado.
15. Endpoint público check-email basado en auth.admin.listUsers fue desactivado; registro usa el RPC ya existente.
16. Realtime del panel PRO fue filtrado por el profesional para evitar recargas globales innecesarias.
17. Se añadieron rollbacks/cleanup en subidas de documentos, logo, evidencia de reclamos y evidencia de Change Orders para reducir estados parciales.
18. Se corrigieron textos de estado de chat ES/EN detectados en el detalle PRO.
19. Se añadió .gitignore para excluir .env, .env.local, node_modules y artefactos de build.

## Validación realizada aquí

Se ejecutó un chequeo sintáctico TypeScript sobre todos los archivos modificados. No se detectaron errores de sintaxis TS1xxx.

No se pudo ejecutar `next build` dentro de este entorno porque la instalación local de dependencias quedó incompleta y no existe el binario local de Next (`next: not found`). Por eso el `npm run build` del proyecto real es obligatorio antes del commit/push.

## Acciones externas obligatorias

### Stripe webhook

Después de desplegar el código:

- Crear/usar `STRIPE_WEBHOOK_SECRET` en las variables de entorno de Vercel.
- Registrar en Stripe el endpoint de producción `/api/stripe/webhook`.
- Suscribir al menos `checkout.session.completed`.
- El código también acepta `checkout.session.async_payment_succeeded`.

### Supabase

El ZIP no contiene las definiciones SQL reales de RLS/RPC/Storage policies. Por tanto siguen necesitando revisión directa en Supabase:

- RLS entre Pro A y Pro B.
- permisos EXECUTE de RPC sensibles.
- Storage policies.
- protección DB contra carreras/duplicados donde corresponda.
- revisar quién puede ejecutar `relydo_email_exists`; si debe dejar de ser público, cambiar la UX de registro y revocar el permiso en Supabase.

### Secreto local

El ZIP original contenía `app/.env.local`. Este paquete NO incluye ese archivo. Si ese archivo estuviera trackeado por Git, sacarlo del índice sin borrarlo del equipo con:

`git rm --cached "app/.env.local"`

Después rotar cualquier secreto que haya sido publicado o compartido fuera de un entorno de confianza.

## Nota sobre idempotencia de notificaciones

El código ahora hace precomprobación de duplicados. La garantía absoluta frente a dos solicitudes concurrentes requiere una restricción/índice de base de datos adecuado; no se añadió a ciegas porque el esquema SQL de producción no está incluido en el ZIP.
