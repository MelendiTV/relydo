# Referidos Pro: implementación local

Fecha: 8 de octubre de 2026. Repositorio: `C:\Users\melendIVIPPromotions\Desktop\relydo-sync`.

## Comportamiento

- A refiere a B con código `PRO-XXXXXXXXXX`. Se captura `provider_referral_code` en metadata Auth únicamente al insertar el perfil Pro. Modificar metadata después no cambia la relación. Actualizaciones y borrados de códigos/relaciones están bloqueados; no auto-referidos.
- Clientes conservan sus códigos, créditos, checkout y migraciones. El programa Pro utiliza tablas y RPC propios, sin consumir créditos de clientes.
- El bono permanece pendiente hasta el primer trabajo realmente elegible del Pro referido: real, completado, pagado, sin refund/dispute/incidente financiero y con release/payout confirmado. Los trabajos cancelados, reembolsados, disputados, con incidentes o que no superen las validaciones no consumen ni queman la oportunidad. Cada release se valida con evidencia Stripe reciente; el primer otorgamiento válido bajo el bloqueo de la relación crea $25 para A y $25 para B una sola vez. Pagos y change orders nunca cuentan como trabajos adicionales. No hay backfill: solo califican requests creados desde la relación de referido; los anteriores tampoco bloquean los posteriores.
- B debe tener `verified=true` y `verification_status='verified'`. Trabajo completado, cliente distinto de A/B, pago real positivo en USD, release guardado, ausencia de claims, refunds y reasignaciones, resolución automática conciliable, comprobantes completos del pago y todos los change orders pagados.
- Se vuelve a observar Stripe: cargos pagados, sin refunds incluso pendientes, sin disputes, transferencias sin reversión, importes/destinos/orígenes coincidentes. SQL exige evidencia reciente de cada paso y settlement del plan completo.
- Tras release válido se crean **dos créditos de 2500 centavos en una sola transacción SQL**. Una falla en cualquiera revierte ambos.
- En el primer release realmente elegible de B, A recibe sus $25 completos inmediatamente mediante una transferencia promocional a la cuenta de A, usando la evidencia del trabajo de B; A no necesita completar otro trabajo. B desbloquea sus $25, pero no los cobra en ese primer trabajo. B solo puede reservarlos en otro request elegible, creado desde la relación, cuyo release sea posterior al otorgamiento del primer trabajo. Requests ya liberados antes del otorgamiento no absorben el crédito. Cada crédito se aplica entero una sola vez con reserva exclusiva.
- Un segundo intento cancelado, reembolsado, disputado o con incidente financiero no consume el crédito de B: queda pendiente para el siguiente release elegible. Si ya existe una reserva con resultado remoto incierto, se conserva su identidad y se concilia antes de cualquier nueva transferencia; nunca se libera ni se mueve a ciegas.
- El bono es una transferencia independiente de **$25 desde el saldo de RELYDO**, sin `source_transaction`, sin límite por margen o comisión. Ejemplo: primer trabajo de B, neto normal $90 para B y promoción $25 para A; siguiente trabajo elegible de B, neto normal $90 + bono $25 = **$115** para B. Se conservan dos comprobantes separados: neto contractual y promoción. Puede coexistir con crédito de cliente de $15 en checkout.
- El saldo Stripe de RELYDO debe cubrir la transferencia del bono ([referencia de Stripe](https://docs.stripe.com/api/transfers/create)). Falta de saldo no reduce el bono: conserva la reserva completa para reintento/conciliación.
- Cola duradera en la misma transacción del guardado de release. El cron autorizado reintenta promociones sin repetir el release normal. Errores Pro se registran sin impedir el otorgamiento de clientes.
- Reserva, destino, crédito y clave de idempotencia permanecen fijos. Se recupera Stripe por un `transfer_group` exclusivo antes de crear un nuevo movimiento. Listados incompletos, duplicados o discrepancias bloquean la creación. Una reserva incierta de 20 horas o más no crea nuevos movimientos automáticamente; requiere conciliación. Un éxito remoto puede recuperarse aun después de ese plazo o de un incidente posterior.
- Solo service_role puede invocar los RPC financieros; ni siquiera ese rol puede escribir directamente en estas tablas. Los Pros solo leen sus datos/saldos mediante RLS o `my_provider_referral_summary`. `my_provider_referral_code` entrega su código para compartir. No se añadió un dashboard grande.

## Archivos de este cambio

1. `supabase/migrations/202610080001_provider_referrals_foundation.sql`: códigos, relación fija, ledger Pro $25, captura al registro y permisos.
2. `supabase/migrations/202610080002_provider_referral_release_bonus.sql`: elegibilidad, otorgamiento atómico, reservas, autorización, comprobantes, cola y resumen.
3. `app/lib/providerReferralBonuses.ts`: evidencia Stripe, transferencia completa, recuperación y reintentos.
4. `app/api/payments/release/route.ts`: integración después del guardado durable y reintento desde cron autorizado.
5. `app/registro-profesional/page.tsx`: campo opcional de código y validación antes de signup.
6. `tests/provider-referrals.test.cjs`: pruebas SQL con PostgreSQL local en memoria.
7. `tests/provider-referral-bonuses-web.test.cjs`: transporte Stripe simulado, fallas, recuperación y simultaneidad.
8. `tests/release-cancellation-plans.test.cjs`: reconoce el nuevo módulo en fixtures sin referidos; mantiene sus pruebas de release/cancelación.
9. `docs/provider-referrals.md`: esta documentación.

## Regla definitiva de pago

Respecto al estado local al iniciar este ajuste, solo cambian la migración de release Pro, sus pruebas SQL y este documento. A cobra en el primer release elegible de B; B cobra en el siguiente release elegible posterior al otorgamiento. El transporte Stripe existente toma el beneficiario/destino de la reserva y conserva la transferencia independiente de $25, idempotencia, recuperación y reintentos. Cliente y Pro pueden usar promociones simultáneamente; RELYDO subsidia la diferencia como costo de adquisición.

## Verificación

**Resultado del ajuste: 772 pruebas descubiertas; 764 aprobadas, 0 fallos y 8 omitidas por requerir servidor HTTP (`RELYDO_LEGAL_TEST_URL`). Las 67 pruebas de referidos Pro pasaron. TypeScript: exit 0. ESLint de los archivos del programa Pro: exit 0. `git diff --check`: exit 0; además se comprobaron los tres archivos de este ajuste aún no versionados, sin errores de whitespace. Los cinco archivos protegidos mantienen exactamente sus huellas SHA-256 previas.** Las pruebas usan PostgreSQL en memoria (PGlite) y Stripe simulado; no equivalen a E2E en TEST/PROD ni a contención real entre conexiones PostgreSQL.

```powershell
Set-Location 'C:\Users\melendIVIPPromotions\Desktop\relydo-sync'
node --test --test-concurrency=1 tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/lib/providerReferralBonuses.ts app/api/payments/release/route.ts app/registro-profesional/page.tsx tests/provider-referrals.test.cjs tests/provider-referral-bonuses-web.test.cjs tests/release-cancellation-plans.test.cjs
git --work-tree="C:/Users/melendIVIPPromotions/Desktop/relydo-sync" diff --check
```

## Revisar, commit y push manual

Estos comandos incluyen los nueve archivos del programa Pro completo con la regla corregida; solo tres cambiaron en este ajuste. No usar `git add .`: hay cambios protegidos preexistentes. El worktree requiere aquí `--work-tree` explícito. No se ejecutaron commit ni push.

```powershell
Set-Location 'C:\Users\melendIVIPPromotions\Desktop\relydo-sync'
$repoPath = 'C:/Users/melendIVIPPromotions/Desktop/relydo-sync'
git --work-tree=$repoPath status --short
git --work-tree=$repoPath switch -c feat/pro-referrals-definitive-bonuses

$proFiles = @(
  'supabase/migrations/202610080001_provider_referrals_foundation.sql'
  'supabase/migrations/202610080002_provider_referral_release_bonus.sql'
  'app/lib/providerReferralBonuses.ts'
  'app/api/payments/release/route.ts'
  'app/registro-profesional/page.tsx'
  'tests/provider-referrals.test.cjs'
  'tests/provider-referral-bonuses-web.test.cjs'
  'tests/release-cancellation-plans.test.cjs'
  'docs/provider-referrals.md'
)
git --work-tree=$repoPath diff -- $proFiles
git --work-tree=$repoPath add -- $proFiles
git --work-tree=$repoPath diff --cached --check
git --work-tree=$repoPath diff --cached --stat
git --work-tree=$repoPath diff --cached -- $proFiles
git --work-tree=$repoPath commit --only -m "feat: pay Pro referrer on first release and referred on next" -- $proFiles
git --work-tree=$repoPath show --stat --oneline HEAD
git --work-tree=$repoPath push -u origin feat/pro-referrals-first-eligible
```

`git commit --only` limita el commit a esos paths aun si hubiera otros cambios ya staged. El push se deja al usuario desde PowerShell con su Git Credential Manager. Estos comandos no se ejecutaron.

## Límites y activación pendiente

No se ejecutó `supabase db push`, `migration repair`, aplicación a TEST/PROD, despliegue, commit ni push. Los archivos protegidos se conservaron y no se abrió/editó `Desktop\relydo`.

Para activar requiere revisión de las migraciones y aprobación explícita de aplicación a TEST. Comprobar allí schema real, triggers de signup, permisos/propietarios, RLS, concurrencia con múltiples conexiones y transferencias Stripe de prueba. No se incluyen comandos de aplicación remota. Aplicar las nuevas migraciones aprobadas antes de activar código que las utilice. Los totales de pantallas existentes siguen mostrando el neto contractual; el bono se consulta por el resumen Pro y sus comprobantes separados.
