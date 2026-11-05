# KH Rentals implementation mistakes

## Check existing journey records before creating replacements

Read the current agreement list before preparing another contract. Continue the existing signed SUWADA villa agreement; a new demo draft was unnecessary and was cancelled. Do not alter historical signed documents.

## Organization selection is different from denied access

An authenticated account with multiple active memberships may need an explicit organization choice. Preserve the server's selection-required response and show only that account's active choices. Never label this state as missing permissions, select the first membership, or grant access from the global authentication role.

## Treat occupancy as a tenancy relationship

Use active agreements for current renters rather than the global user type or old manual property arrays. Normalize rented/occupied and active/available consistently for display. Browser cancellation must not independently set a property available; actual tenancy closure and settlement remain server-owned. Passing an end date does not prove move-out.

## Render persisted currency and image shapes consistently

Do not hard-code a dollar sign or infer a historical agreement's denomination from locale. Display its recorded currency, disclose missing currency, and keep zero rent valid. Registered property photos may be JSON strings or image objects; extract the URL and use the tenant-scoped display helper, with a graceful failure placeholder.

## Resolve billing participants through the invoice relationship

An organization-scoped invoice references a global app_users identity. Do not filter that identity by its legacy tenant_id: a member may rent in another organization. Keep invoice authorization and tenant scope authoritative and preserve historical participant readback. Exercise the same global renter in both organizations in SQL acceptance.

## Resolve maintenance participants through scoped request references

Do not apply app_users.tenant_id to a request's renter, assigned worker or comment author. These are global identities referenced by tenant-scoped maintenance records. Keep membership, property, assignment and private-comment authorization intact; verify names and privacy when identities originated elsewhere.

## Test the actual renter navigation link

A global account may have role authenticated while its selected organization membership is rentee. Maintenance cards must select the portal from the active membership. Opening the correct detail route directly does not prove that the list card links there; click the real card in desktop/mobile browser acceptance.

## A closed tenancy must not leave its old reservation suppressing stock

A public-stock check that reads only the offer status/deadline can keep an available property hidden after explicit settled closure. Ignore holds linked to a closed agreement on public reads, retire those exact holds transactionally at closure, and reconcile older closed holds on governed offer reads. Preserve other valid reservations, active tenancy guards, unsigned replacement reservations, agreement links and audit history.

## Respect the offer audit request constraint for system events

Offer audit actor/request/hash fields are an all-or-none request group. A closure-driven offer retirement is a system lifecycle event, like expiry, and uses the existing null request group. The acting administrator remains on the agreement and tenancy closure audit in the same transaction. Do not invent a client request or weaken the schema constraint.
