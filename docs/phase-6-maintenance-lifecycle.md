# Phase 6 — Maintenance Lifecycle

## Objective

Turn the existing maintenance CRUD surface into a controlled tenancy-linked lifecycle with assignment scope, terminal-state protection, internal notes and an audit trail.

## Grounding

The existing schema already supports maintenance requests, images, comments and assignment/timing fields. Phase 6 deliberately reuses those records instead of introducing a replacement work-order table.

The new authoritative maintenance transitions are:

```text
pending -> in_progress -> completed
   \          \
    -> cancelled -> terminal
```

`completed` and `cancelled` are terminal.

## Tenancy link

New tenant-submitted requests resolve an active agreement for the tenant/property and persist `agreementid` plus optional `unitid`. This prevents a tenant from opening a request against a property they do not currently rent.

## Server lifecycle API

Mounted at `/api/maintenance-lifecycle`.

### Create

`POST /requests`

- tenant portal only in this release;
- requires active tenancy for the selected property;
- server supplies tenant/rentee/agreement/unit context;
- starts in `pending`;
- writes lifecycle event.

### Read projection

`GET /requests/:requestId`

Access:

- tenant: own request only;
- maintenance manager: assigned-property scope;
- maintenance worker: directly assigned request.

Tenant projections omit internal comments.

### Assign

`POST /requests/:requestId/assign`

- requires maintenance-management permission;
- enforces property assignment scope;
- assignee must be an active non-tenant organization member;
- records assigning actor and lifecycle event.

### Start

`POST /requests/:requestId/start`

Only the assigned worker or property-scoped maintenance manager can transition `pending -> in_progress`.

### Complete

`POST /requests/:requestId/complete`

Only the assigned worker or manager can transition `in_progress -> completed`. Completion records actor, timestamp and optional completion cost.

### Cancel

`POST /requests/:requestId/cancel`

- tenant may cancel their own request while it is still `pending`;
- manager may cancel `pending` or `in_progress` requests in property scope;
- reason is mandatory.

### Comments

`POST /requests/:requestId/comments`

Staff/admin may mark a comment internal. Tenants cannot create or read internal comments.

## Schema additions

Migration:

```bash
npm run migrate:maintenance-lifecycle
```

Adds tenancy/actor/cost fields to `maintenance_requests`, `is_internal` to comments, and `maintenance_lifecycle_events`.

## Release gate

Apply the migration before deploying this branch.

## Smoke test

1. tenant submits a request for an actively rented property;
2. submission against a non-active property is rejected;
3. manager assigns a maintenance worker;
4. unrelated worker cannot start the job;
5. assigned worker starts it;
6. tenant can see public comments but not internal comments;
7. assigned worker completes it with notes/cost;
8. completed request cannot be restarted or cancelled;
9. tenant cancellation works only while pending;
10. manager/property and worker/assignment scoping are enforced.

## Compatibility

Existing maintenance tables, images and current UI remain available. The dedicated lifecycle API is the authoritative path for controlled state transitions and is intended to replace direct status mutation incrementally.
