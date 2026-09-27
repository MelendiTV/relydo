# Conciliación histórica — propuesta local sobre ab96c6f

Alcance: exclusivamente los dos `automatic_release` del incidente. No se ejecutó SQL remoto, Stripe, QStash, push ni deploy. Esta migración instala una función; no concilia filas al instalarse.

## Resultado diseñado

| Caso | Efecto exclusivamente en DB |
|---|---|
| d22970ec… / $540 | Adopta un único transfer existente: cargo, PI, moneda, 54000 centavos, destino y ausencia de reversals exactos. Registra receipt derivado del objeto externo, fecha histórica, payment `paid_out` y resolución `settled`. Conserva plan, decision, intentos y snapshot anterior con el error. |
| 059532b3… / CO $52.50 | Registra `refunded_amount=52.50`, ID real del refund y fecha real; conserva `payment_status='paid'`, `paid_at`, PI y el pago base íntegro. Retira el plan mediante `reconciliation_required` más audit outcome `retired_invalid_plan`. Mantiene plan/decision/step originales y `receipt=NULL`; impide modificar o resucitar el plan. No afirma que sus transferencias se ejecutaron. |

## Funciones y guardas revisadas

En `ab96c6f`, `financial_receipt_matches` compara un receipt normalizado con la instrucción, pero no autentica Stripe. `record_job_financial_step` solo admite instrucciones del plan reservado y evita reutilizar IDs. `settle_job_financial_resolution` exige igualdad del conjunto completo de pasos/plan y receipts válidos; para `automatic_release` no proyecta por sí sola el pago base. La recuperación de `financialStripe` rechaza movimientos históricos sin metadata del step; no sirve para adoptar este transfer antiguo.

`co_guard_refund_projection` de 202609270001 exige un refund en el plan vigente. El plan del CO contiene dos transferencias; no puede representar este refund sin falsificar o cambiar historia. La propuesta conserva esa guarda y añade una excepción para el único CO, respaldada por snapshots completos antes/después en la tabla de auditoría. No usa flags de sesión que el llamador pueda falsificar.

Se revisaron también `reserve_job_financial_resolution`, `reserve_job_financial_step`, `co_guard_child_lifecycle` y la ruta release: `reconciliation_required` impide llegar a recovery/transfer. No se añade un estado nuevo que los clientes antiguos pudieran ignorar. El retiro queda explícito en la auditoría, aunque la etiqueta técnica conservadora siga siendo `reconciliation_required`.

Fuente: checkout local exacto `ab96c6fe88afa7f615776651d0efb2830b13df42`, los planes exportados y el `settle_job_financial_resolution` adjunto a la conversación. No se consultó producción. La migración compara hashes de los cuerpos de siete funciones existentes (solo normaliza CRLF/LF), y aborta ante cualquier diferencia. No omitir esa comprobación: una diferencia requiere revisar la definición concreta, no otra auditoría general.

## Evidencia pendiente y frontera de confianza

IDs aportados por el usuario y fijados en SQL y en el generador: transfer `tr_3U4IGSIEn05DVPjv00L0GaMI` y refund `re_3UC5VNIEn05DVPjv1MUPgfdG`. Se rechaza cualquier otro ID aunque coincidan los importes. El usuario confirmó 5250 centavos USD, cargo/PI y la visualización «Sep 4, 2026, 10:22 PM». Faltan los objetos exportados completos, sus timestamps `created`, la zona horaria del Dashboard y la lectura completa de transfers. Los tests usan esos IDs con campos simulados, no son evidencia aplicable. No hay una conciliación real ya ejecutada ni un SQL de aplicación rellenado con datos inventados.

La función es exclusiva del propietario de la migración; ni `anon`, ni `authenticated`, ni `service_role` pueden ejecutarla o escribir auditoría. Un operador debe verificar la procedencia de los exports Stripe Sandbox y el platform account correcto. SQL valida consistencia exacta de los objetos, no puede demostrar que un JSON fue emitido por Stripe. Un administrador capaz de cambiar DDL sigue pudiendo alterar controles; la inmutabilidad protege las rutas normales, no a un superusuario hostil.

Cada evidencia JSON contiene:

* `reviewed_by`, `reference` (referencia al export revisado), `stripe_account_id` (cuenta plataforma), `livemode:false`, `observed_at` ISO de la lectura, no más de 24 horas antes de aplicar.
* `charge`: objeto de cargo real sin secretos ni PII, con `object,id,payment_intent,currency,livemode,paid,status,amount,amount_refunded,refunded,created`.
* `transfers`: `{object:'list', source_transaction:'ch_…', has_more:false, data:[...]}`. Es el conjunto **completo** de transferencias con ese source transaction, obtenido al revisar todas las páginas, sin restringir por el transfer_group incorrecto del plan. `source_transaction` aquí describe el filtro aplicado al conjunto, no un campo nativo del objeto list de Stripe. $540 exige exactamente un elemento; CO exige cero. Con paginación incompleta no marcar `has_more:false`.
* Cada transfer incluye `object,id,amount,currency,source_transaction,destination,livemode,reversed,amount_reversed,created`. IDs de relaciones como strings, no objetos expandidos.
* CO: además `refund_display_timezone` con la zona horaria verificada del Dashboard (nombre reconocido por PostgreSQL), `refund` con `object,id,status,amount,currency,charge,payment_intent,created`, y `base_transfer` completo cuyo ID es `tr_3UC46SIEn05DVPjv09Pndce0`, 4500, cargo `ch_3UC46SIEn05DVPjv07BFJ61z`, destino `acct_1U8I9TIyP2FO3lKM`.

La fecha reportada «4 de septiembre de 2026, 10:22 PM» no especifica zona horaria. La función exige una zona explícita y comprueba que el `created` real corresponda a ese minuto en dicha zona; conserva sus segundos originales. No asume America/Los_Angeles ni UTC. Si el Dashboard y el objeto no coinciden, aborta. La fecha externa se compara con la creación del cargo, no con `paid_at` local, que podría haberse reparado posteriormente.

Se bloquea ante otro owner/state, planes o metadata distintos, pasos extra, receipts previos, otro pago/CO, claims pendientes/históricos bloqueantes o reasignaciones. El caso $540 exige cero COs; el segundo exactamente el CO indicado. Si el estado real difiere, no se relajan automáticamente las condiciones. Bloqueos de fila NOWAIT siguen el orden padre/hijos existente; ejecución y auditoría son una única transacción. Un retry con evidencia y estado exactamente iguales no modifica nada; cualquier deriva falla.

## Revisión y pruebas locales

Desde el repo, después de aplicar el patch localmente:

```powershell
git diff --check
git diff --stat
git diff -- supabase/migrations/202609270002_historical_release_reconciliation.sql
node --test --test-isolation=none tests/historical-release-reconciliation.test.cjs
node --test --test-isolation=none tests/change-order-refund-projection.test.cjs
```

Requiere Node 24 y la dependencia ya declarada `@electric-sql/pglite`. Si no está instalada en esa copia, apuntar `RELYDO_PGLITE_MODULE` a una instalación local existente. Los tests cargan las migraciones originales de lifecycle/refund y esta propuesta en PostgreSQL en memoria; usan tablas mínimas y wrappers legacy simulados, sin conexiones externas. No equivalen a probar todos los triggers de Supabase ni concurrencia entre conexiones.

## Aplicación futura, no ejecutada

1. Mantener QStash pausado y los escritores financieros detenidos durante la operación. Esta entrega no pausa, reanuda ni modifica servicios.
2. Revisar el patch, los exports y el destino de DB. No ejecutar `supabase db push` indiscriminadamente.
3. Instalar **solo** `supabase/migrations/202609270002_historical_release_reconciliation.sql` por el proceso habitual de migraciones, como propietario. Aborta si los cuerpos existentes difieren de los revisados. No hay backfill automático. Comando concreto para la copia local; para el destino revisado, sustituir la variable solo en una aplicación futura autorizada:

```powershell
psql -X --set=ON_ERROR_STOP=1 --dbname="$env:RELYDO_LOCAL_DB_URL" --file=supabase/migrations/202609270002_historical_release_reconciliation.sql
```

Si el proceso de despliegue registra versiones de migración en Supabase, registrar también esta versión por ese proceso; ejecutar SQL con `psql` por sí solo no actualiza el historial del CLI.

4. Preparar ambos JSON reales según el contrato anterior, y generar SQL localmente con el script incluido:

```powershell
node scripts/render-historical-reconciliation.cjs evidence-540.json evidence-co-refund.json work/reconciliation-review.sql
```

El archivo generado usa una sola transacción para ambos casos y termina en `ROLLBACK`. Revisar el contenido. En una copia **local** de la DB con el esquema/migración instalados:

```powershell
psql -X --set=ON_ERROR_STOP=1 --dbname="$env:RELYDO_LOCAL_DB_URL" --file=work/reconciliation-review.sql
```

Para una aplicación futura explícitamente autorizada, generar una variante con `--commit`, revisar el diff (solo cambia el cierre de transacción), y usar un destino de DB comprobado:

```powershell
node scripts/render-historical-reconciliation.cjs evidence-540.json evidence-co-refund.json work/reconciliation-apply.sql --commit
psql -X --set=ON_ERROR_STOP=1 --dbname="$env:RELYDO_REVIEWED_DB_URL" --file=work/reconciliation-apply.sql
```

La instalación de la migración es un paso separado; estos comandos solo invocan la conciliación. No invocan Stripe. Ante fallo, la transacción de ambos casos se revierte. Guardar el JSON exacto aplicado: cambiar `observed_at` o cualquier campo convierte el retry en evidencia distinta y se rechaza. El SQL devuelve los outcomes y snapshots para verificar el resultado antes de cerrar la transacción. No incluye instrucciones para reactivar QStash.
