# B04 S3d — Resolve shared signup rate limiting with Azure Managed Redis

## Decision and blocker record (2026-10-24)

The blocking dependency is **not** the email/identity code. Public signup requires a shared, atomic per-IP and per-email limiter across every Azure Container Apps replica. The original proposed SQL rate-limit migration was blocked before write by connector safety controls. Do not retry the blocked SQL write, create an equivalent disguised migration, or infer production authorization from prior S3a/s3b source merges.

**Approved implementation candidate:** Azure **Managed** Redis with one atomic Redis Lua `EVAL` operation per hashed rate-limit bucket. The older Azure Cache for Redis SKUs are being retired; use Azure Managed Redis for a new provisioning decision:
- https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-whats-new
- https://learn.microsoft.com/azure/redis/secure-azure-managed-redis
- https://learn.microsoft.com/en-us/cli/azure/redisenterprise
- https://redis.io/docs/latest/develop/clients/nodejs/amr/

This is a proposed **separate cloud service with recurring Azure cost**, not an already-provisioned resource, not a Stripe subscription, and not evidence that public signup can be enabled. There is no verified connected Azure management tool in this chat.

## Completed in this source-only PR

- `src/api/auth/publicSignupRedisLimiter.js`: testable injected Redis-compatible `eval` client. The one-script `GET / INCR / EXPIRE / TTL` critical section is atomic, compares quota, and never extends denied windows. An invalid digest, scope, quota, Redis availability, missing expiry, ambiguous Redis response or Redis exception **fails closed**. No inline credentials, tenant references, HTTP registration handlers or network connection.
- Keys have `quixo:public-signup:rate:v1:` namespace, a rate scope and the existing server-secret **HMAC-SHA256 of the email/IP identifier**, so the limiter backend sees no raw address. 60-minute window and values for challenge IP, challenge email, redemption IP remain controlled by the existing unmounted router.
- `tests/public-signup-redis-limiter.test.js`: concurrency, no-bypass with two app-side adapters sharing one simulated Redis backend, rate window expiry, scope independence, privacy, store outage, and fail-closed malformed replies. This is a deterministic source-level simulator; **it is not evidence of an actual Managed Redis deployment or distributed failover behavior**.
- Test is added to the established `test:authorization` CI; no new CI runner or SQL migration.
- Existing `createPublicSignupRouter` remains **unmounted**. Passing a mock or `durable:true` alone in a test proves nothing about provider readiness. Public registration and production flags remain OFF.

## Actual steps required to close B04 shared-rate-limiter gate

1. **Read-only Azure inventory and cost approval.** Determine the actual Quixo production subscription, Container Apps resource group, region/VNet and whether an existing approved Redis resource may be safely shared with dedicated ACL and namespace. In an authorized Azure CLI session, inventory (read-only):
   `az redisenterprise list --resource-group "$AZURE_RESOURCE_GROUP" --output table`
   and `az containerapp show --name "$AZURE_CONTAINER_APP_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query '{environmentId:properties.environmentId,identity:identity.type}'`.
   Do not assume any resource exists from a source PR.
2. **Provision only after cost/network approval.** For a new Redis instance, evaluate the smallest **Azure Managed Redis** SKU available in the Container App region with production HA, zone redundancy where available, TLS 1.2+, private endpoint with public network access disabled, `noeviction`/appropriate memory safeguards, scoped access and monitoring. Use Microsoft Entra managed identity authentication if supported by the chosen client/configuration; do not commit tokens, connection keys or a plaintext password to GitHub. An Azure administrator may need a separate network/Private DNS change and explicitly approved recurring cost.
3. **Node client and lifecycle adapter.** Use supported `@redis/client` and `@redis/entraid` (or equivalent approved Azure Managed Redis credentials provider) with authenticated TLS, stable cross-replica routing, connection-ready checks, bounded retries, and reconnect handling. Never infer `isReady` from a one-time bootstrap ping. Inject the real client into `createRedisPublicSignupLimiter` only in a **separate release-gated PR**. Shared HMAC secret must be held in Azure secrets/Key Vault and identical for all replicas; rotate with overlap or a controlled throttle reset.
4. **Real distributed acceptance.** Run requests from **two separate replicas** against one Redis backend. Confirm 4/hour/email, 12/hour/source-IP challenge and 12/hour/source-IP redeem (exact policy may be tuned after abuse review), concurrent requests, refill after TTL, HMAC isolation, outages/reconnects and noeviction/memory-pressure behavior. Test Redis failover; decide whether additional protection is required if throttle state is lost. A false/unknown Redis reply must prevent challenge creation and email sends.
5. **Trustworthy source IP and anti-CSRF.** Validate Azure Container Apps ingress and controlled proxy chain. Azure docs warn that `X-Forwarded-For` can contain untrusted client-supplied segments; never select the first unvalidated address. Normalize IPv4/IPv6, bound body size and limit remote clients even for invalid email payloads. Consider edge/WAF protection against distributed botnets.
6. **Registration release still requires** governed S3a production SQL migration, verified SendGrid domain/region, origin/referrer protections, default-off request/redeem API mounting, signed-in tenantless browser acceptance and rollback. The Stripe owner/billing flow is separate, and no customer records, subscriptions, demo renters, documents, invoices or Evia logs are changed here.

## Operational acceptance checklist

- [ ] Production Azure subscription/resource and region verified (read-only).
- [ ] Managed Redis cost/SKU/network/security design approved.
- [ ] Redis deployed with HA, private access, identity and alerting.
- [ ] Test app replicas read the **same** authorized Redis database/namespace.
- [ ] Atomic EVAL verified against real shared provider; failover/TTL tested.
- [ ] HMAC secret held outside source and consistency proven across replicas.
- [ ] Protected trusted-ingress IP resolver + anti-CSRF in place.
- [ ] Production schema and sender verified; default-off registration integrated.
- [ ] Two-org browser/identity acceptance and explicit release go/no-go.
- [ ] Public signup flag changed only after every prerequisite is accepted.

## Non-mutating Azure inventory now staged

The KH Rentals repository already has scoped **GitHub Production OIDC** access for Azure diagnostics. This PR also stages `.github/workflows/audit-b04-azure-redis-readonly.yml`, a new **read-only inventory workflow** triggered by the workflow file being merged into `main` (and independently by manual dispatch). It lists Managed Redis and classic Redis resources **only in the approved `khrental-prod-rg` resource group** and reads the existing Container App environment ID. It prints metadata and aggregate counts only—no keys, passwords, customer data or cloud writes. The source workflow is validated by a negative authorization test that forbids mutating Azure commands.

**Execution status:** The read-only inventory has NOT run yet; a green PR test is not proof that Azure Redis exists. After the workflow merges, use its actual Production OIDC logs and `B04_REDIS_AZURE_INVENTORY_OK` marker to determine whether a shared resource already exists. An empty inventory does not rule out a Redis resource in a different Azure resource group. Failures of OIDC/permissions or Azure CLI MUST be reported as **unknown**, never as zero resources.

**If no suitable approved Redis exists:** Create a costed provisioning plan for Azure Managed Redis, then receive explicit approval before cloud creation. Do not enable public signup merely from this inventory.

**Canonical state:** B04 rate-limiter **source adapter** ready for CI, actual shared-rate-limiter **operational blocker OPEN** until the checklist is proven. Avoid declaring success on a source-only test.
