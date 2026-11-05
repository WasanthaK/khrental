# KH Rentals implementation mistakes

## Check existing journey records before creating replacements

Read the current agreement list before preparing another contract. Continue the existing signed SUWADA villa agreement; a new demo draft was unnecessary and was cancelled. Do not alter historical signed documents.

## Organization selection is different from denied access

An authenticated account with multiple active memberships may need an explicit organization choice. Preserve the server's selection-required response and show only that account's active choices. Never label this state as missing permissions, select the first membership, or grant access from the global authentication role.

## Treat occupancy as a tenancy relationship

Use active agreements for current renters rather than the global user type or old manual property arrays. Normalize rented/occupied and active/available consistently for display. Browser cancellation must not independently set a property available; actual tenancy closure and settlement remain server-owned. Passing an end date does not prove move-out.
