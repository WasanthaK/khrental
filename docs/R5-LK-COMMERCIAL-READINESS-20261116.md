# R5 Sri Lanka commercial, tax and privacy readiness — 16 November 2026

**Status: research and proposals prepared for review; commercial approval and launch acceptance remain open.** This record advances CM01.3–CM01.7 and CM02.1/2/4/5. It does not publish customer terms, enable charging or establish tax compliance. The controlling project status remains in the [Execution Plan](EXECUTION-PLAN.md#development-progress-and-remaining-acceptance--controlling-queue) and [task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md#handoff-task-level-dispositions).

The owner requested this commercial lane in parallel with engineering. Its scope is this decision record and documentation integration. The [self-handoff](R5-SELF-HANDOFF-20261115.md#remaining-queue-and-exit-criteria) retains its engineering queue; no recovery, cessation, workflow, application or provider change is part of this work. Source baseline: `367274cfd800dd64774d7490c7a58d353e74a039`. External sources were checked on 16 November 2026. Dated older decisions remain history; the latest explicit owner decision controls each topic.

The [documentation review record](evidence/r5-lk-commercial-readiness-20261116.json) retains the source list, checks and evidence boundaries. It is not a deployed acceptance run.

## 1. Decisions retained and implementation boundary

| Topic | Existing direction retained |
| --- | --- |
| Subscription | USD 5 per independently rentable managed residential dwelling per month, monthly only, no trial. Vacant or unlisted managed dwellings count; a parent and its separately rentable units are not counted twice. |
| Customer and listing | The property-management organization buys the SaaS subscription. Browsing is free; standard eligible public listing is included, with owner opt-out and no separate listing fee. SaaS charges are separate from landlord rent, deposits and rental invoices. |
| Inventory changes | Ordinary additions are prorated onto the next invoice. Obligations-closed removals reduce quantity at renewal without an immediate current-period reduction credit. The final dwelling schedules cancellation at renewal; do not send quantity zero. |
| Expiry and records | Management becomes read-only after expiry, including existing-tenancy writes. Preserve authorized history, renter access and billing recovery. The seven-day renewal-failure grace policy remains; its natural-expiry acceptance is outside R5 by owner decision. |
| LK price direction | Retain the recorded LKR 25,000 threshold and 2% excess direction. The complete rent basis, FX convention, rounding, effective price and customer treatment still need approval. |
| Authority and regions | Only verified platform administration governs market rules. Sri Lanka is first; Brunei has separate later commercial and launch acceptance. |

Authority: [approved contract and 10 November commercial pack](QUIXO-STRIPE-B02-B03-READINESS.md#controlling-commercial-decision-pack--10-november-2026), [30 October configurable-pricing decision](QUIXO-HOMES-STRIPE-SAAS-BILLING.md#controlling-owner-decision--configurable-market-pricing-30-october-2026), and the canonical scope decision. The older statement that LKR 25,000 is merely an example must not reopen the subsequently retained direction.

The current [pricing contract](../src/api/managementBilling/contract.js) accepts only `pending` or `none` for the excess policy; its preview reports no adjustment and no included tax. The [publication route](../src/api/managementBilling/router.js) rejects incomplete pricing and publishes a monthly USD base price. **A published 2%/FX calculation is not implemented or accepted.** Drafting these terms cannot close that engineering dependency.

## 2. Commercial proposals ready for an owner decision

Every recommendation in this section is **proposed**, including the suggested notice period and rent basis. None is a newly approved fee or legal minimum.

### Calculation and exchange rate — CM01.3

Retain the existing candidate formula. For each dwelling, with monthly rent `R` in LKR and conversion rate `F` in LKR per USD:

`monthly USD cents = round_half_up(500 + 2 × max(R − 25,000, 0) / F)`

Use decimal/rational arithmetic, round once per dwelling to USD cents, then sum. Tax is evaluated separately on the actual taxable consideration. Do not substitute the full landlord rent for the SaaS tax base.

| Unresolved choice | Recommended decision | Why / consequence |
| --- | --- | --- |
| Rent basis | Use the current agreed monthly base rent for an occupied dwelling; for a vacant dwelling, an explicitly reviewed monthly asking rent. Exclude deposits, utilities and one-off charges. Hold a percentage quote when the rent basis is missing or disputed. | Both occupied and vacant managed stock remain billable. The owner must approve the vacant-stock basis; an absent rent is not automatically zero. Non-monthly rents need a separately approved normalization rule. |
| FX source | Use the CBSL indicative USD/LKR spot series, not a bank buy/sell quote. | CBSL describes this series as a transaction-weighted measure using the previous/latest available business day. Its TT series is a different bank-quote measure. [FX1] |
| Observation and lock | Select the latest published CBSL observation available before the pricing version's effective instant; retain the observation date, publication/source evidence, exact rate and approver. Lock that rate to the version. | Quotes and subsequent prorations using that version remain reproducible. The commercial version's FX is not automatically the legally required tax-reporting conversion. |
| Missing rate | Do not activate a new version without a verified observation. Keep an existing approved version unchanged; do not silently use another provider, a guessed rate or a new daily rate. | No invented fallback or automatic repricing. |
| Rounding | Half-up per dwelling, then sum. Preserve the unrounded calculation inputs for a billing dispute. | Avoid a hidden difference between per-dwelling prices and the invoice subtotal. |

Arithmetic illustrations below use **F = 300 solely as a synthetic example**, not a current exchange rate or approved commercial version.

| Monthly rent, LKR | 2% excess, LKR | Proposed monthly charge before tax, USD |
| ---: | ---: | ---: |
| 20,000 | 0 | 5.00 |
| 25,000 | 0 | 5.00 |
| 25,001 | 0.02 | 5.00 |
| 25,075 | 1.50 | 5.01 |
| 50,000 | 500 | 6.67 |
| 100,000 | 1,500 | 10.00 |

Two dwellings at LKR 25,075 would total USD 10.02 under the proposed per-dwelling rule; rounding their combined unrounded amount would instead produce USD 10.01. This is why the aggregation decision must be explicit.

### Publication, restoration and refunds — CM01.4–CM01.7

| Topic | Recommended treatment | Remaining acceptance |
| --- | --- | --- |
| Price version and notice | Freeze the version used for a paid period. Publish new rules for new subscriptions first. Before moving an existing cohort, provide the proposed new price, effective renewal and at least 30 calendar days' notice, subject to applicable law and any required consent. | Owner approves the proposed notice/customer policy; implemented cohort handling and representative provider previews are required. Current `new_subscriptions_only` behavior does not establish migration support. |
| Tax display | Keep a clearly identified pre-tax SaaS subtotal and show the exact applicable tax, invoice issuer, currency and total before confirmation. Apply any required consumer all-in price presentation. | Merchant/customer classification, registration and locally reviewed presentation; do not label a quote “tax-free” merely because sandbox tax is zero. |
| Restoration before paid expiry | No separate reactivation fee. Restore from the confirmed restoration time and reuse still-paid capacity through the governed flow. Disclose a renewal resumption or quantity change before confirmation; charge only the approved incremental amount. | Retain the approved restoration-time/paid-capacity behavior and recorded bounded acceptance. Approve the additional customer wording and remaining states; do not repeat accepted restoration-before-renewal proof. Reversing cancellation alone does not restore ceased inventory. |
| Reactivation after termination versus overdue recovery | No separate reactivation fee or new charge solely for an inactive gap after a subscription has ended. Previously accrued invoices remain subject to the approved correction/refund policy. Use provider-state-appropriate recovery, or an approved new paid period for an ended subscription; confirm payment before paid management resumes. | Owner approves the additional commercial treatment; the ended-subscription path requires engineering and acceptance. An overdue recoverable subscription may retain its original period and valid unpaid invoices. No manual duplicate subscription workaround. |
| Exceptional bulk increases | Introduce no separate fee or immediate-invoice threshold for the initial LK offer. Keep ordinary next-invoice proration and existing supported quantity/batch limits. | Owner may approve “no separate commercial exception”; technical limits are not discount bands or a promise of unlimited scale. |
| Removal/cancellation | Preserve approved renewal reductions and period-end cancellation. There is no automatic current-period reduction credit. | Do not expand that narrow rule into an unconditional no-refund policy. |
| Errors, refunds and disputes | Correct verified duplicate/incorrect SaaS charges and tax errors through the actual provider with an audit trail. Review other requests individually under applicable rights; any goodwill credit needs recorded approval. | Owner approves the customer wording, support authority and policy. Read back actual refund, dispute, invoice and credit behavior before publication. No invented provider fee refund or guaranteed bank-arrival date. |

## 3. Merchant and Sri Lanka tax decision record

### Merchant facts still needed — CM02.1

On 24 November 2026 the owner confirmed that Quixo Inc. (USA) will issue Quixo Homes invoices for the Sri Lanka launch. Live merchant account and payout approval remain unverified. Obtain a single approved merchant profile: confirmed invoice issuer, establishment/residence and operating presence, service/contact address, registration identifiers, intended live account, invoice issuer, authorized signatory, payout readiness and any account restrictions. Store sensitive supporting records in the appropriate restricted system; this document needs verified outcomes and references, not bank credentials or identity documents.

| Collection route | Current evidence and decision |
| --- | --- |
| Direct Quixo SaaS sale with Stripe Billing | Existing sandbox integration is evidence of that bounded integration only. The actual merchant remains responsible for applicable tax obligations; live identity, registration, customer classification and payout evidence are open. |
| Stripe Managed Payments | Still the preferred option to evaluate, not an approved account capability. Stripe lists US businesses among eligible locations and requires eligible direct digital sales; that is not Quixo-specific approval. [ST1] |
| Managed Payments for LK customers | Sri Lanka is absent from the current covered cross-border indirect-tax list. For uncovered countries, Stripe says the seller retains indirect-tax responsibilities; invoices use the seller's tax details. Coverage must be resolved before this route is chosen. [ST2] |
| BN or another customer country | Assess the actual subscriber's location separately from the property's market. A provider coverage entry does not complete regional launch or local legal review. |

### Current official law and provider mismatch — CM02.2

The enacted **VAT Amendment Act No. 14 of 2026**, certified 30 June, replaces the foreign electronic-service commencement date with **1 July 2026**. New section 25L provides thresholds of LKR 60 million over twelve months or LKR 15 million for a quarter, including likely exceedance for the quarterly test. Its customer-location test uses at least two specified indicators. Section 25N excludes collection where the recipient is VAT-registered and requires a simplified statement for those supplies. [LK1]

Stripe's LK page describes a broader business-customer exclusion and a rolling three-month threshold. **That description must be reconciled with the enacted provisions before provider tax classification is accepted.** An app organization or business name alone is insufficient evidence of VAT registration. [ST3] This is a release dependency, not an instruction to override the provider engine or charge tax manually.

The separate SSCL Amendment Act No. 10 of 2026 changes its registration thresholds from 1 July 2026 to LKR 9 million for a quarter or LKR 36 million across four consecutive quarters. This does not establish that SSCL applies to the intended merchant or authorize adding it to customer invoices. [LK2]

For conditional costing, IRD lists the ordinary standard VAT rate as 18% and SSCL as 2.5% of liable ordinary-service turnover. These are separate regimes, not an automatic combined checkout rate. Determine actual liability, exemptions and the correct base first. Use the 2026 Act above for current SSCL thresholds; the overview page still shows the earlier thresholds. [LK5][LK6]

IRD's 3 July notice confirms the enacted digital-service regime and says procedural guidance will follow. Later nonresident-specific implementation guidance was not located in this review; confirm the current registration, statement, payment and invoice procedures for the chosen merchant. [LK3] Gazette 2500/106 sets 1 October 2026 for the prescribed ordinary VAT invoice format; its application to a special nonresident invoice needs separate confirmation. [LK4]

| Business facts | Required determination before activation |
| --- | --- |
| Foreign seller without LK establishment | Confirm the digital-service regime, actual turnover scope, registration/effective date, customer location evidence and VAT-registration validation. Obtain current registration, statement and invoice procedure guidance; the app's own customer count is not necessarily the entity's entire relevant turnover. |
| Sri Lankan seller or operating presence | Determine domestic VAT, SSCL and other entity-specific obligations separately. Do not copy the remote-seller treatment or assume that USD billing creates an export. |
| Customer claims business/VAT status | Verify the tax identity and preserve the classification evidence and date. Resolve missing or contradictory country evidence before a tax quote. Collect only the information needed, using existing provider evidence where suitable. |
| Registration not yet required / exemption claimed | Record the specific basis, turnover evidence, monitoring owner and next review trigger. “Below threshold” is a conclusion requiring facts, not a default from sandbox configuration. |
| Invoice and accounting | Validate issuer identity, registration details, tax treatment, currency/conversion, required invoice fields and correction/credit process against the selected regime. Keep SaaS invoices separate from landlord rental invoices. |

**Open facts:** relevant tax establishments, actual registration and turnover, first subscriber countries and tax status, provider capability and legally reviewed invoice treatment. Tax readiness remains YELLOW; merchant/payout remains RED. No tax registration, `automatic_tax` setting or live transaction was created by this research.

## 4. Privacy, transfers and retention — CM02.4–CM02.5

Gazette Extraordinary **2498/16 of 22 July 2026** appoints **1 January 2027** for PDPA sections 2 and 3 and Parts I and III. The DPA's current notice says Part II rights and Part VII penalties are not yet active. Do not reuse the superseded March 2025 commencement statement or describe every PDPA provision as already effective. [DP1][DP2] Prepare the service's actual practices and contracts before launch; this timetable does not remove current contractual promises or other applicable obligations.

### Roles and provider evidence

The [published privacy source](../marketing/privacy/index.html) names Quixo, Inc. and `support@quixo.online`, describes data categories and requests, but does not settle every entity role, location, transfer safeguard or retention duration. Preserve its accepted publication; substantive additions need verified facts and customer review.

Recommended role mapping for review: Quixo determines purposes for its account/security/subscription operations; each property organization determines its own rental-administration purposes; Quixo processes instructed rental records under an appropriate data-processing arrangement where that reflects the actual relationship. Confirm each activity rather than assuming a single role for the whole product.

For each purpose, identify the lawful ground, necessary versus optional data, consequences of not providing it, recipients and retention trigger. Assess any special-category or child data separately. Check notices where data is collected, including signup; an enquiry-sharing checkbox is not a universal ground for all processing. These are preparation and subsequent UI-review dependencies, not newly observed deployed failures. [DP3]

Assess transfers under section 26 as replaced by the 2025 amendment, including binding/enforceable recipient safeguards through applicable DPA-specified instruments or a valid enumerated exception. Do not assume generic overseas contract clauses or blanket consent suffice. A final applicable replacement transfer instrument was not located in the inspected official material; verify the operative instrument and provider contracts before approval. [DP4]

| Processing | Evidence to obtain before an approved notice/contract |
| --- | --- |
| Azure runtime, SQL and operational logs | [Deployment source](../.github/workflows/deploy-container-apps.yml) and [SQL configuration](../src/api/mssql/config.js) identify the integration. Obtain actual resource/backup regions, contract/DPA, access roles, log contents and retention settings. A runtime region is not proof of every data location. |
| R2 object storage | [Storage integration](../src/api/storage/index.js) identifies the service. Confirm actual buckets, jurisdiction/location settings, backups/replication, provider terms and access/delete behavior. |
| Evia signing and retained artifacts | [Signing source](../src/services/eviaV2SigningService.js) identifies document/signatory processing. Obtain contracted service/entity, locations, subprocessors, retention and transfer terms. Preserve signed artifacts; the deferred audit-provider investigation is not reopened. |
| Outbound email | [Delivery source](../src/api/email/sendGridDelivery.js) identifies SendGrid. Confirm actual account, message/log regions, retention and subprocessors. Tracking controls vary by caller; do not promise all mail is untracked. Do not send a message to prove this inventory. |
| Stripe subscription/payment data | [Provider source](../src/api/managementBilling/stripe.js) identifies the sandbox integration. Verify exact live merchant/provider roles, product route/account terms, hosted-payment and invoice data, and transfer safeguards. |
| Browser storage and session data | [Request context](../src/services/requestContext.js) and [authentication source](../src/api/auth/index.js) identify storage/session mechanisms. Add their purposes and lifetimes to the notice review; session expiry/revocation does not establish deletion of database history. |

### Purpose-based retention and request preparation

Approve a schedule by data class, purpose, start/end trigger, legal hold, responsible actor, storage systems, deletion method and backup expiry. Do not invent a universal retention period.

| Data class | Proposed review criterion |
| --- | --- |
| Account identity and organization memberships | Retain what is needed for verified access and accountable history; resolve the global identity separately from one organization membership. |
| Enquiries/applications and attachments | Set a defined decision/tenancy-related purpose and expiry trigger; evaluate third-party copies and withdrawal requests separately. |
| Signed agreements, rental financials and deposits | Identify legal/accounting/dispute obligations and hold authority. Preserve protected artifacts and authorized access until a reviewed disposal rule exists. |
| SaaS billing and tax evidence | Set periods from the actual merchant's accounting/tax obligations and provider contracts, including corrections and disputes. |
| Maintenance media, notifications and security logs | Minimize personal information and establish justified durations per purpose; security history need not imply permanent retention of message content. |
| Backups | Verify expiry and restoration behavior, deletion reapplication and holds. Do not promise immediate erasure from backups. |

Use the existing [request-handling runbook](QUIXO-STRIPE-B02-B03-READINESS.md#cm025-prepared-request-handling-runbook-operational-proof-pending): receipt → verified identity/scope → retention/hold decision → supported action → readback → accurate response. Remaining proof is a controlled request across relevant stores, with an approved retention/backup decision. No request, deletion or legal approval is invented here.

The [Evia evidence guard](../src/api/storage/eviaEvidenceRetention.js) and [invoice-archive guard](../src/api/storage/invoiceArchiveStoragePolicy.js) protect records from generic deletion. They are not an indefinite-retention policy or a complete privacy erasure/export process. Expiry and orphan-review timers must not be relabeled as approved retention periods.

## 5. Customer wording prepared for review

These paragraphs are a **draft commercial supplement**, not a replacement published contract. Insert the approved seller/address and finalized price/tax/version details before publication. Preserve the existing [terms](../marketing/terms/index.html) until the whole affected customer journey has been reviewed.

> Your organization subscribes to Quixo Homes monthly for each independently rentable dwelling it manages. Vacant dwellings and dwellings hidden from public listings still count. Standard eligible public listing is included and can be turned off without changing the management subscription. There is no trial.

> Before you confirm, we show your subscription price, currency, dwelling quantity, applicable tax, total and renewal information. Ordinary additions of managed dwellings create a prorated adjustment on your next regular invoice. An approved removal reduces your subscription quantity at renewal, with no automatic refund for that reduction during the current period. Stopping management requires the relevant rental, financial, maintenance and reservation obligations to be resolved.

> If you stop managing your final dwelling, your subscription is scheduled to end at the end of the paid period. Cancellation does not end a tenancy or delete historical records. After your paid access ends, management is read-only; access to historical records depends on your verified role and relationship. Subscription recovery remains available.

> If you want to restore management, we show the applicable payment and renewal treatment before you confirm. There is no separate reactivation fee or new charge solely for a period of inactivity after your subscription has ended. Existing unpaid invoices remain subject to review and the applicable correction or refund policy. Where payment is required, paid management resumes only after it is confirmed. The available recovery or activation process depends on the status of your subscription.

> If you believe a SaaS charge or tax amount is incorrect, contact support@quixo.online with the organization and invoice reference. Do not send card details or passwords. We review the charge and explain any correction, credit or refund. Cancellation alone does not determine a separate refund request, and this policy does not limit rights that apply by law.

The restoration paragraph contains a **proposed** policy and cannot be published until approved and supported by the actual flow. Do not add a numerical surcharge, tax assurance, universal refund prohibition, liability cap, governing-law clause or blanket deletion promise without the missing commercial/entity facts and legal review.

## 6. Decisions and evidence needed to close this lane

| Bundle | Decision or evidence | Status |
| --- | --- | --- |
| A — price | Rent basis including vacant stock, CBSL/version-lock choice, half-up per-dwelling rounding, customer notice/cohort policy and tax presentation | Recommendations above; owner approval pending, percentage/FX implementation and acceptance pending |
| B — lifecycle terms | No separate reactivation fee, ended-subscription gap versus overdue-invoice treatment, no exceptional bulk rule, error/refund/support treatment | Recommendations above; owner approval and affected flow/provider acceptance pending |
| C — merchant/tax | Invoice issuer confirmed as Quixo Inc. (USA). Verify the live account, establishment/registration/turnover/customer facts, collection route, tax engine and invoice treatment | Facts and jurisdiction-specific review required; CM02.1 RED, CM02.2 YELLOW |
| D — privacy | Approve actual roles/contact/entity, account-specific provider/transfer evidence, retention/backup schedule and controlled request proof | CM02.4/5 YELLOW |

Documentation completion does not make the commercial decisions approved or LK launch-ready. After these decisions, separately scope the necessary percentage-pricing, customer treatment and request-handling engineering; recheck the current self-handoff and active branches before starting implementation. Keep live charging/full enforcement OFF and retain the owner's other R5 scope decisions.

## Sources checked on 16 November 2026

- **FX1 — CBSL:** [indicative USD/LKR spot methodology](https://www.cbsl.gov.lk/en/rates-and-indicators/exchange-rates/daily-indicative-usd-spot-exchange-rates), [exchange-rate series distinction](https://www.cbsl.gov.lk/en/node/146). No current numeric rate adopted.
- **ST1 — Stripe:** [Managed Payments eligibility](https://docs.stripe.com/payments/managed-payments/eligibility). General eligibility is not account approval.
- **ST2 — Stripe:** [Managed Payments tax coverage and unsupported jurisdictions](https://docs.stripe.com/payments/managed-payments/tax-compliance).
- **ST3 — Stripe:** [LK remote digital-service tax support](https://docs.stripe.com/tax/supported-countries/asia-pacific/collect-tax?tax-jurisdiction-asia-pacific=sri-lanka). Provider wording requires reconciliation with LK1.
- **LK1 — Sri Lanka IRD:** [VAT Amendment Act No. 14 of 2026](https://www.ird.gov.lk/en/publications/Value%20Added%20Tax_Acts/VAT_Act_No_14-2026_E.PDF), sections 2 and 8 / inserted sections 25L–25Q. Enacted law, not the earlier proposed commencement/deferral notices.
- **LK2 — Sri Lanka IRD:** [SSCL Amendment Act No. 10 of 2026](https://www.ird.gov.lk/en/publications/Acts_SSCL/SSCL_Act_No_10-2026_E.pdf), section 2.
- **LK3 — Sri Lanka IRD:** [3 July 2026 implementation notice](https://www.ird.gov.lk/en/Lists/Latest%20News%20%20Notices/Attachments/799/PN_VAT_2026-03_New_E.pdf), section 4. Later specific procedural guidance was not located in this review.
- **LK4 — Sri Lanka IRD:** [Gazette Extraordinary 2500/106](https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2500_106_E.pdf), 6 August 2026; ordinary tax-invoice format commencement amendment.
- **LK5 — Sri Lanka IRD:** [VAT overview](https://www.ird.gov.lk/en/Type%20of%20Taxes/SitePages/Value%20Added%20Tax%20%28VAT%29.aspx), ordinary standard rate; use enacted amendments/current notices for changed provisions.
- **LK6 — Sri Lanka IRD:** [SSCL overview](https://www.ird.gov.lk/en/Type%20of%20Taxes/SitePages/Social%20Security%20Contribution%20Levy%20%28SSCL%29.aspx), ordinary-service rate/base only; its older threshold is superseded by LK2.
- **DP1 — Sri Lanka DPA:** [Gazette Extraordinary 2498/16](https://www.dpa.gov.lk/Gazet/2498-16_E.pdf), 22 July 2026.
- **DP2 — Sri Lanka DPA:** [current data protection statement and commencement disclaimer](https://www.dpa.gov.lk/privacy-notice). Its own operational practices are not a ready-made Quixo policy.
- **DP3 — Sri Lanka DPA:** [Personal Data Protection Act No. 9 of 2022](https://www.dpa.gov.lk/acts/Data%20Protection%20Act%20SL%20-%20English%20%282%29.pdf), sections 5, 9 and 11 and Schedules I, II and V, read with subsequent amendments and commencement orders.
- **DP4 — Sri Lanka DPA:** [Personal Data Protection Amendment Act No. 22 of 2025](https://www.dpa.gov.lk/acts/22-2025_E_251104_201549%20%281%29.pdf), replacement section 26. A draft directive is not a final operative instrument.
