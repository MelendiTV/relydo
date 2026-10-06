# 13.3: garantía local de pago BASE

Las migraciones versionadas anteriores no declaran una UNIQUE de `payments`.
El repositorio tampoco contiene el DDL inicial de esa tabla ni `supabase/config.toml`.
No se consultaron datos ni catálogos remotos. Docker local no fue accesible.
Por tanto, no se puede acreditar qué constraints existen en un Supabase desplegado.

El diseño actual consulta BASE por `offer_id` en `app/api/checkout/route.ts` y
`app/api/checkout/verify-payment/route.ts`, usando `maybeSingle()` y recuperando
colisiones `23505` por esa misma oferta. Las reasignaciones conservan el pago
original y pueden crear un pago para otra oferta de la misma solicitud.
Una UNIQUE de `request_id` o del par `(request_id, offer_id)` no corresponde:
la primera bloquearía reasignaciones y la segunda permitiría repetir una oferta
con otra solicitud. Los Change Orders se guardan en `change_orders`.

`202610060001_base_payment_offer_unique.sql` garantiza como máximo una fila de
`payments` por `offer_id` no nulo, independientemente del estado o PaymentIntent.
No cambia funciones, políticas, lógica de negocio ni tablas de Change Orders.
Conserva los NULL históricos (no garantiza unicidad de pagos sin oferta).
Los escritores BASE actuales exigen una oferta; no se inventa una clasificación
de filas históricas ni se añade un NOT NULL sin disponer del esquema/datos reales.

La migración toma un bloqueo de escrituras con espera máxima de cinco segundos,
comprueba duplicados y crea el índice dentro de una transacción. Si hay duplicados
aborta sin borrar ni elegir pagos ganadores; deben conciliarse antes de aplicarla.
Si el bloqueo vence, debe reintentarse en una ventana adecuada. La creación del
índice bloquea escrituras durante su ejecución; revisar tamaño/ventana en el
entorno destino. El rollback elimina únicamente el índice nuevo y conserva datos.

Validación local con PostgreSQL/PGlite y esquema sintético mínimo:

```sh
node --test --test-isolation=none tests/base-payment-unique-sql.test.cjs tests/base-mobile-webhook.test.cjs tests/base-payment-snapshot.test.cjs tests/provider-net-summary.test.cjs tests/change-order-payment-sql.test.cjs tests/change-order-payments.test.cjs
```

Se prueban duplicados, distintos estados/PaymentIntents, actualizaciones, datos
previos válidos, rechazo de duplicados históricos, ofertas de reasignación, NULL,
Change Orders intactos, rollback y reaplicación. Veinte inserciones lanzadas a la
vez producen un ganador y diecinueve `23505`; PGlite las serializa en una conexión.
Esto valida el índice, pero no simula sesiones PostgreSQL independientes.

Resultado de esta ejecución: cinco pruebas SQL nuevas pasan; las seis suites
relevantes suman 198/198, cero fallos. `npx tsc --noEmit --incremental false`,
lint del test nuevo y `git diff --check` pasan. También se revisaron los cuatro
archivos nuevos con `git diff --no-index --check` (sin errores de espacios).

13.3 queda resuelto en código/migraciones y pruebas locales para BASE por oferta.
Su cierre operativo depende de inspeccionar el catálogo/datos reales y aplicar
la migración allí con autorización independiente. Este trabajo no aplica nada
a Supabase remoto, Vercel ni producción.
