# Local regression tests

Install the locked development dependencies with `npm ci`, then run:

```sh
node --test tests/change-order-payments.test.cjs tests/change-order-payment-sql.test.cjs tests/change-order-lifecycle.test.cjs tests/claims-resolution-unicode.test.cjs
```

On Node 24 in environments that prohibit child processes, add `--test-isolation=none`.

The suites use mocked external services and PGlite 0.3.14 with synthetic fixtures in memory. They do not load `.env` files, connect to Supabase, or perform Stripe operations. SQL migrations and rollback scripts run only in that disposable in-memory database. No Docker bridge or captured database inventory is required. `RELYDO_PGLITE_MODULE` is an optional override; normal runs use the locked project dependency.

These tests cover payment preparation/confirmation, financial guards, SQL lifecycle and rollback behavior, and claim notification text. They do not establish production-schema compatibility, real Stripe integration, PostgREST authorization, or concurrent independent PostgreSQL connections.

`ISOLATED_CHANGE_ORDERS_VALIDATION.md` preserves the plan for broader integration validation. That broader validation is separate from these local regression suites. Publishing the code does not apply migrations or establish that it is ready for production activation; the SQL files describe their coordinated rollout requirements.
