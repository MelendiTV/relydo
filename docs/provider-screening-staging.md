# Verification payment + Checkr skeleton

Base reviewed: HEAD and local origin/main a62cf22. No credentials read or used. No external payment/API calls, database migration, commit, push or deployment performed.

## Server environment (never NEXT_PUBLIC)

```dotenv
PROVIDER_SCREENING_ENABLED=false
CHECKR_API_KEY=
CHECKR_API_BASE_URL=https://api.checkr.com/v1/
CHECKR_PACKAGE_SLUG=
PROVIDER_VERIFICATION_AMOUNT_CENTS=5999
PROVIDER_VERIFICATION_CURRENCY=usd
```

Existing server configuration also required: STRIPE_SECRET_KEY (sk_test_ only enforced in this skeleton), STRIPE_WEBHOOK_SECRET, SUPABASE_SECRET_KEY and RELYDO_BASE_URL (trusted HTTPS origin of staging). No new Checkr webhook secret: direct-account Checkr uses CHECKR_API_KEY as the HMAC key. OAuth partner integrations use a client secret and are outside this implementation.

## Architecture / official sources reviewed 2026-10-02

- https://docs.checkr.com/#section/Introduction/Authentication : Basic Auth, API key as username, blank password.
- https://docs.checkr.com/ : Candidates POST /v1/candidates with only email for hosted flow; POST /v1/invitations with candidate_id and package; GET reports/invitations by ID. Candidate PII and consent collected by Checkr.
- Same API reference, Idempotency support: Idempotency-Key on POST; expires after 24 hours. Stable UUID keys persisted before Checkr calls. Uncertain operations after 23 hours require manual reconciliation.
- Same API reference, Securing webhooks: X-Checkr-Signature hex HMAC-SHA256 using direct-account API key. Validate original request bytes; confirm exact fixture serialization with sandbox delivery before activation.
- Same API reference, Report response / Identity Verification: GET /reports/{id}?include=identity_verification explicitly embeds IDV; completed clear maps to verified, terminal negative/unknown/canceled outcomes map to unverified; pending/missing stays blocked. Missing identity keeps approval blocked. SSN trace/identity data evaluation does not satisfy IDV.

POST /api/provider/screening accepts only action pay or start. Ownership derives from authenticated user, never body IDs. GET allows own metadata or an Admin with providers permission. Checkout is card-only with persistent DB reservation, Stripe idempotency key and session reuse. Expired/uncertain payments block further charges rather than create replacement sessions. Success redirects never mark payment paid: existing raw-body signed Stripe webhook retrieves session + intent and validates IDs, owner, amount, currency and succeeded status. Start requires persisted paid state AND fresh PaymentIntent with expanded latest_charge, matching owner/amount/currency and succeeded payment. Partial/full refunds and disputes invalidate the fee. Revalidation runs before candidate creation and again before invitation creation.

Checkr webhook verifies signature, retrieves authoritative object/report and projects only IDs/statuses. Durable event-ID deduplication occurs atomically under a row lock. No global timestamp filter: invitation and report deliveries reconcile freshly retrieved current report state, even when report.completed has an older event timestamp. Same report ID and candidate are checked; duplicate IDs cannot overwrite the projection. Unknown candidate callbacks return retryable failure to tolerate creation/persistence races. No payloads, SSN, DOB, document images, report details or invitation bearer URLs stored/logged/exposed. Invitation delivered by Checkr email. No automatic approval, rejection or adverse-action calls. consider stays human_review and cannot activate through this skeleton; human adjudication is intentionally not implemented.

Both Admin approval URLs use the existing documentary gate plus screening gate. With PROVIDER_SCREENING_ENABLED not exactly true, the API gate returns immediately without querying screening; GET also works before this migration exists. With true, every approval requires screening, with no age/existing-Pro exceptions.

The independent database guard reads protected provider_screening_settings.enabled (defaults false). PostgreSQL cannot read server environment. Operators must synchronize this singleton with PROVIDER_SCREENING_ENABLED. Enable the database guard before enabling the server flag; disable the server flag and database guard together during a controlled maintenance window. A mismatched pair can either block legacy approvals or leave direct-write screening enforcement off. Never enable staging traffic until both settings are verified. This does not create a grandfathering rule or migrate approval state.

The documentary gate and privileged fields STILL depend on the live trigger protect_provider_profile_privileged_fields. This migration does not replace, weaken, recreate or remove that trigger. The temporary SQL tests exercise only the new screening guard, not that live control. Inspect it and verify documentary/privileged-field bypass rejection in staging before approval tests.

## Migration status and staging activation

Migration 202610020002_provider_screening_foundation.sql was applied in RELYDO TEST on 2026-10-02, as reported by the operator. Do not reapply it in TEST. Production application remains pending. The original local implementation review described above did not apply migrations; this status records the subsequent TEST application and was not independently verified against a live database. Remaining activation steps below are a checklist, not confirmation that activation has occurred.

1. Inspect the existing RELYDO TEST schema, profile triggers, grants and roles before activation; review the already applied migration without rerunning it. Production requires a separate reviewed rollout and remains pending.
2. Obtain direct-account sandbox Checkr key and an IDV-enabled package that includes required background checks. Verify IDV is returned with include=identity_verification. Hierarchy accounts require node/work_locations and need extension before enabling; do not invent these values.
3. Configure Stripe test key and test webhook signing secret, staging Supabase and trusted HTTPS origin. Configure the fee/currency/package before first reservation. Never populate this skeleton with live keys.
4. Register /api/stripe/webhook for checkout.session.completed / checkout.session.async_payment_succeeded / charge.refunded / charge.dispute.created / charge.dispute.updated / charge.dispute.closed and /api/checkr/webhook for invitation/report lifecycle events. Verify sandbox HMAC fixture against original request bytes.
5. In isolated staging, synchronize provider_screening_settings.enabled=true with PROVIDER_SCREENING_ENABLED=true (database first; see controlled rollout above). Test unpaid start denial, payment, duplicate clicks/concurrent requests, webhook replay, delayed/out-of-order events, invitation email/consent, pending/clear/consider, missing/unverified IDV and documentary gate failures.
6. Test manual reconciliation of expired sessions, lost external responses and invitation expiry without repeat charges/orders. Confirm displayed price/terms and fee policy before launch.

## Deliberate limitations / risks

- Minimal refund/dispute invalidation only; no full financial reconciliation, automatic refunds, cancellation or adverse action. Dispute close/win remains blocked until manual reconciliation. No automatic revocation of an already active Pro; this remains required before production. Success webhooks cannot restore refunded/disputed rows to paid.
- Checkr retries expire; operational reconciliation for missed events is required. No scheduled reconciliation worker implemented.
- Candidate retries use current authenticated email; email changes during an uncertain creation require reconciliation. Configure account/package once per screening; do not rotate keys during uncertain operations without reconciliation.
- All future activation/approval writes require screening when enabled. Current profiles are disposable test data; no grandfathering path exists.
- Currency display assumes two decimal places; use USD in staging. No replacement payment or reinvitation path until operational policy is defined.
- TypeScript baseline: app/layout.tsx(75,4) TS2304 Cannot find name LayoutProps, present before changes.


## Local verification of corrections

Run node tests/provider-screening.test.cjs (temporary PGlite only; never Supabase), relevant payment/privacy tests, ESLint on changed application files and this CommonJS harness, git diff --check, git diff --stat and npx.cmd tsc --noEmit. LayoutProps at app/layout.tsx:75 exists in HEAD a62cf22 and is the known baseline TypeScript error.

Residual distributed-system risk: a refund/dispute can occur after the final Stripe retrieval and before Checkr accepts an invitation; those services cannot participate in one database transaction. Webhooks mark the payment blocked; manual reconciliation is needed for an already ordered report. Concurrent Checkr retrievals can also race on changing upstream reports; missed events require operational reconciliation. No sensitive PII/report payload is persisted, logged or returned, including embedded identity evaluations/documents.
