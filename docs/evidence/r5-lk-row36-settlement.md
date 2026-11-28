# Sri Lanka R5 decision for row 36

On 28 November 2026 the product owner confirmed that all outstanding Quixo management subscription dues must be settled before an ended subscription can restart. Paid management resumes only after the new period is paid. Valid prior invoices can be disputed through support.

This clarifies [the approved reactivation terms](../R5-LK-COMMERCIAL-PACKET.md#36-approved-reactivation-wording). [Row 37](../R5-LK-CLOSURE.md#L68) covers sandbox verification.

[PR #804](https://github.com/WasanthaK/khrental/pull/804) implements this rule. In the [disposable SQL Server test](https://github.com/WasanthaK/khrental/actions/runs/46165713759/job/141042665109), prior dues blocked checkout. Settling those dues kept paid management locked. Reopening the review reused one checkout, and confirming its first paid invoice restored the same workspace and retained its history. This test used a synthetic payment provider.

The [browser checks](https://github.com/WasanthaK/khrental/actions/runs/46165713774) exercised the outstanding and settled states on mobile and desktop. Row 37 remains open for the [genuine Stripe sandbox case](https://github.com/WasanthaK/khrental/pull/805).
