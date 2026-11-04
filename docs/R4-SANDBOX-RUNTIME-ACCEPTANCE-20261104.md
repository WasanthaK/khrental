# R4 sandbox runtime acceptance — 4 November 2026

Sandbox runtime deployment and activation succeeded. The release verified all 18 strict database schema checks, application read/write permissions, matching deployed build, a single serving revision and one-replica configuration. Sandbox credentials were bound through the existing secret mechanism.

The receiver rejected unsigned requests and accepted a correctly signed synthetic probe without business writes. This proves signature transport, not a Stripe-origin payment or event reconciliation.

Two defects were corrected: runtime readiness no longer requires database definition visibility, and the production container installs the tested dependency lockfile. Restricted-identity SQL regression tests and build checks passed. No database grants or dependency versions were changed.

Remaining acceptance: explicit development-workspace enrollment, hosted sandbox Checkout, genuine Stripe event reconciliation, quantity changes, renewal/failure/cancellation, production entitlement and inventory guards, merchant readiness and regional launch. No customer, subscription, payment or workspace enrollment was created by this release. Live charging remains disabled. R4 and R5 remain open.

Interactive Checkout testing could not continue because the shared browser disconnected. The existing canonical documents were not updated: automatic approval review blocked re-uploading their embedded account identifiers. This separate checkpoint contains no tenant or Stripe account identifiers.
