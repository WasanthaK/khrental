# Sri Lanka R5 commercial decision packet

**For Wasantha, Finance, the merchant account holder and the privacy owner · 27 November 2026**

Rows 29 and 36 record the approved base fee and reactivation terms. Return the five remaining decisions together. Each responsible role can approve its own line by reference to an existing restricted record. If a provider or adviser is still reviewing a decision, give the pending reference and the responsible role so engineering can continue. Keep account identifiers, bank information, customer records, credentials and identity documents in their existing restricted systems.

## Reply form

| Row | Responsible role | Reply |
|---|---|---|
| 29 | Product owner / country admin | The owner approved **Rs 1,500 per managed dwelling per month** on 27 November. The country admin sets the effective date at publication. |
| 34 | Finance or tax adviser | Signed LK platform-fee tax instruction **ref ___**, **effective ___**, approved by **___**. The rule sheet below is completed in that record. |
| 36 | Product owner | Wasantha Weerakoone approved §36 as written on 28 November 2026. |
| 38 | Finance and product owner | **Approve §38**, including the correction authority and price notice, or give edits **___**. Approvers and date or decision reference **___**. |
| 40 | Merchant account holder | Provider approval **ref ___** covers Quixo Inc. (USA), live LKR collection and settlement to approved receiving route **redacted ref ___**. Account holder and verification date **___**. Alternatively, outstanding provider decision and holder **___**. |
| 41 | Privacy owner | Approved LK processing facts, provider/transfer record and customer notice text **ref ___**, approved by **___**, date **___**. Required notice edits or approval of existing text **___**. |
| 42 | Privacy owner | Approved retention, hold and backup schedule **ref ___**, approved by **___**, date **___**. Exceptions for the controlled test request or reference to those exceptions **___**. |

### 29. Local price

The country admin maintains the LKR table. Each independently rentable managed dwelling incurs the local monthly base. For occupied dwellings add 2% of agreed monthly rent above Rs 25,000. Round each line once to the nearest cent, half up, then sum. A vacant dwelling costs **Rs 1,500** per month. A dwelling rented for Rs 100,000 costs **Rs 3,000** per month. The two together cost **Rs 4,500** before applicable taxes. The issuer is Quixo Inc. (USA), with a draft LK assignment. The approved defaults remain in the [country decision record](R5-LK-COMMERCIAL-READINESS-20261116.md#sri-lanka-base-fee-approved-on-27-november-2026).

### 34. Finance rule sheet

Scope is Quixo's monthly platform fee sold to an LK subscriber. Finance can supply a signed schedule with multiple treatments where customer status or effective dates differ.

| Treatment | Return in the signed instruction |
|---|---|
| VAT | Applies, exempt or outside scope and why. Specify seller establishment and registration basis, relevant subscriber classification and evidence, taxable fee basis, rate or fixed amount when applicable, inclusive or additional treatment, invoice fields and effective date. |
| Withholding | Applies or inapplicable and why. Identify withholding party, fee basis, rate or amount, whether deducted at settlement, gross invoice and net cash presentation, certificate or other reconciliation evidence and effective date. |
| Other treatment relevant to this sale | If the adviser identifies a levy, duty or reverse charge, identify who bears it and how to show, accrue or remit it. Supply an explicit inapplicability decision for VAT or withholding wherever either is disabled. |

The adviser chooses the registrations, rates and accounting treatment. Engineering will apply the signed version to a sandbox invoice, compare enabled and disabled outcomes, and read back the original invoice after a later rule change.

### 36. Approved reactivation wording

> If you restore a dwelling during an already paid period, we reuse any remaining paid capacity. We show any additional charge and the renewal quantity before you confirm. Management resumes from the confirmed restoration time. There is no separate reactivation fee.
>
> After a subscription has ended, a new paid period can start once payment is confirmed. We charge nothing for the inactive gap. Valid invoices accrued before the subscription ended remain payable and can be disputed through support. If your subscription is overdue and can still be recovered, we show what you owe and restore paid management once the required payment is confirmed. Your authorized property history remains available.

### 38. Proposed customer wording and support authority

> An approved removal reduces your dwelling count at the next renewal. Your current paid period continues at the agreed price, without an automatic credit for the removal. When you stop managing your last dwelling, your subscription ends at the end of the paid period. Your tenancy agreements continue and you retain access to historical records according to your role.
>
> For a duplicate charge, incorrect amount or tax error, contact support@quixo.online with your organization and invoice reference. We check the invoice, explain the outcome and arrange any correction, credit or refund through the original payment provider. We review other requests individually under your applicable rights.

Under the proposed correction process, support receives the case. Finance verifies the originating invoice, issuer and collector account and authorizes the correction or goodwill credit. Record the disposition, amount, currency, reason and provider correction reference against the original invoice. Support gives the customer the outcome.

The proposed purchase notice reads “Price version [published LK version], effective [date and time]. Monthly fee [LKR amount] for [dwelling count]. Applicable tax [amount and treatment]. Total [LKR total]. Next renewal [date]. Issued by Quixo Inc. (USA).” Fill these fields from the dated country record and actual purchase. Under the proposal, a paid period keeps its price. Apply a new version to new subscriptions first. Before changing an existing customer's renewal, give the new price and renewal date at least 30 calendar days in advance, subject to the applicable notice and consent requirements.

### 40. Merchant and payout capability

Stripe sandbox is the current collection route. The requested live capability is LKR collection for Quixo Inc. (USA) and payout to the receiving account approved for that live account. The account holder should verify settlement currency, effective date, route and relevant restrictions against the provider record. A redacted attestation can reference more than one provider record if collection and payout were approved separately.

### 41. Privacy facts and proposed notice edits

The published notice names Quixo, Inc. as software provider and gives **support@quixo.online** as the privacy contact. Its purposes include sign-in, subscription administration, security, rental enquiries, agreements and rental administration. For review, Quixo determines account, billing and security purposes. Property organizations determine their rental purposes, with Quixo processing rental information under applicable instructions. Confirm roles, ground for each purpose, necessary versus optional data, recipients and the relevant contracts. [Published notice source](../marketing/privacy/index.html)

| Processing | Integration identified in the code | Account-specific facts the privacy owner supplies |
|---|---|---|
| Service, SQL, logs and backups | Microsoft Azure | Resource, log and backup regions, support access, provider agreement and transfer safeguard |
| Uploaded files | Cloudflare R2 | Bucket and replication locations, access and transfer terms |
| Agreements and signing evidence | Evia | Contracting entity, processing locations, subprocessors and transfer terms |
| Notifications | SendGrid | Message and log locations, tracking settings and transfer terms |
| Platform billing | Stripe | Merchant and service roles, hosted payment and invoice data locations, provider and transfer terms |
| Device and session storage | Browser storage and app sessions | Purposes, lifetimes and server-side recipients |

The proposed LK notice addition reads “Quixo, Inc. handles account access, subscription billing and service security on [approved grounds]. Your property organization directs rental administration under [confirmed arrangement]. We use [approved services] for hosting, storage, signing, email and billing. Relevant information is processed in [verified locations], with [approved transfer arrangements]. Contact support@quixo.online for a request concerning Quixo Homes and identify the relevant organization.” The privacy owner can approve different wording or reference a reviewed notice covering these facts. Publish edits only with verified fields.

### 42. Retention schedule and controlled request

The entries below identify the trigger to review. The privacy owner supplies the approved duration, hold authority, responsible custodian and disposal method for each class in the referenced schedule. A blank duration requires a decision.

| Data class | Proposed trigger or distinction | Approved period or policy reference |
|---|---|---|
| Account and organization memberships | Account closure and end of each membership can occur separately | ___ |
| Enquiries, applications and attachments | Withdrawal, decision or transition to tenancy. Identify copies already shared | ___ |
| Signed agreements, rent financials and deposits | Tenancy or settlement ends, subject to applicable recordkeeping and active disputes | ___ |
| Quixo platform invoices, credits and tax evidence | Invoice, correction or fiscal period closes. Identify accounting and dispute holds | ___ |
| Maintenance records and media | Request closes or related dispute is resolved | ___ |
| Notifications and security logs | Delivery or security event. Distinguish message content from audit history | ___ |
| Backups and replicas | Snapshot creation, expiry rotation and restore. Record how approved deletions are reapplied, including hold release | ___ |

For row 43, QA will submit a controlled access request for a synthetic renter's own enquiry through the existing request channel. Verify identity and organization scope, retrieve the permitted record, apply the approved retention and disclosure exceptions, read back the outcome and capture a redacted completion reference. The privacy owner can identify a suitable existing test record and any applicable exception in the same reply. [Request runbook](QUIXO-STRIPE-B02-B03-READINESS.md#cm025-prepared-request-handling-runbook-operational-proof-pending)

## Access delegates if needed

Use an existing assignee or authorized operator where available. If one of the following lacks a holder, include the holder's role or internal reference once with the commercial reply. For row 01, the release operator handles the **merged** `verify-deployed-paid-inventory.yml` on `main` in the protected `Production` environment for the Stripe sandbox case `cessation-response-loss`, using the build and original operation UUID recorded in [checklist row 01](R5-LK-CLOSURE.md#billing-recovery-inventory-and-enforcement). Two submissions have no matching run ID. The operator should first reconcile the existing attempt and its cleanup using the protected workflow history. An existing platform admin can operate LK sandbox publication, issuer and collector setup for 02/31–33. A controlled QA mailbox holder can correlate one send and receipt for 25. An existing disposable owner-workspace holder can perform the credential sign-in for 26 through its approved channel. [Operator instructions](R5-COPILOT-HANDOFF.md#first-engineering-change)

The release owner reviews the scoped launch separately after rows 01–43 pass. [Closure checklist](R5-LK-CLOSURE.md)
