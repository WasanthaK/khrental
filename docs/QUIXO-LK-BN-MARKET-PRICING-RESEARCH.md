# Quixo.Homes LK/BN small-landlord launch — market and price discovery

**Research date:** 2026-10-25  
**Status:** RESEARCH / HYPOTHESES ONLY — NO COUNTRY PRICES, LAUNCH, TAX OR STRIPE CHANGES APPROVED  
**Scope:** Sri Lanka (LK), then Brunei Darussalam (BN); individually owned 1–10 rentable dwellings. Marketing preview branch `r4/lk-bn-marketing-drafts-20261025`.

## Canonical decisions that remain fixed

- One global application, shared frontend codebase and authenticated identity; country pages intended as `https://quixo.homes/lk/` and `https://quixo.homes/bn/`. Existing deployment at `app.quixo.homes` is shared and gated.
- Subscription quantity is independently rentable dwellings, including managed vacant ones per the already approved B03 rules. No property-valuation or percentage-of-rent fee.
- USD **$5 per dwelling per month**, monthly only, no trial, is the **currently approved worldwide baseline**; any LK/BN country price is **undecided** and needs explicit new owner approval and vetted Stripe Product/Price entries.
- Property-country, organization billing country, transaction currency and customer tax residence must stay independent. Do not derive billable amount, authority or jurisdiction from page URL or IP.
- No fresh signup, paid account, payment, Stripe product/price, subscription, tax claim or regulatory launch is authorized by country-page drafting.

## Sri Lanka: observable advertised competitors, not directly interchangeable

| Publisher | Advertised offering checked 2026-10-25 | Key caveat |
| --- | --- | --- |
| [Neski pricing](https://www.neski.lk/pricing) | **LKR 999 per month**, Mini up to **10 units** | Includes payment/rent tracking; feature depth and advertised offer need independent due diligence; shows a free-trial CTA, not Quixo policy |
| [RentGuard pricing](https://rentguard.app/) | **LKR 1,700 per month** listed for Standard up to **10 properties**, with other term prices on page | Property counting and term discounts may differ from independent dwelling counting; verify actual checkout |
| [Highriser360](https://www.highriser360.com/) | Promotional Starter **LKR 765 per active contract per month** for 1–9 contracts | Charges active contracts, unlike Quixo's managed-dwelling rule (which includes vacant units); shows promotional/annual language |
| [PropMint LK](https://propmint.online/lk) | **LKR 3,500 per month** Starter, up to 20 units | Advertised different allowance/features; independent SaaS adoption not proven |

**Implication:** Sri Lankan offers for small portfolios span flat portfolio plans and per-active-contract plans. The flat up-to-ten offerings create a high total-price comparison hurdle for a purely linear $5 per unit model at 5–10 dwellings. **This is competitive positioning evidence, not permission to change the canonical billing model.**

**Recommended price-discovery exercise:** conduct 10–15 interviews with landlords across 1, 2–3 and 5–10 independently rentable dwellings, representing both occupied and vacant stock. Test willingness to pay for actual full-stack value (agreements, invoice records, tenant views, maintenance and reliable audit history), not property valuations. Ask what local alternative they use and actual total monthly SaaS spend. Present the published baseline and at least one prospective **local-currency offer defined only in a research interview**, never on live marketing pages; choose an approved Stripe recurring amount only after transaction-fee, tax and support-cost analysis. A monthly per-organization minimum or portfolio cap could mitigate transaction economics but would be a **new commercial decision**, not something to implement silently.

## Brunei: market evidence is thinner

- [Excel View Brunei residential listings](https://excelviewbrunei.com/) show illustrative advertised house rents around **BND 950–1,800/month**, depending on property. These are **asking rents, not signed rents or SaaS willingness-to-pay**.
- [Bruworld via Brunei Property Portal](https://bruneiproperty.com.bn/node/46?filter=rent) displays late-September 2026 apartment rental listings at around **BND 1,500 and 1,800/month** (example homes only).
- The search did **not** identify a well-verified Brunei-local direct SaaS competitor publicly displaying per-dwelling subscription prices. **Do not misread “BD” on Mullak+ as Brunei dollars**: [Mullak+](https://mullakplus.com/) explicitly operates in **Bahrain**, where BD is Bahraini dinar, not BND.
- International/region-targeted ERP listings may offer custom enterprise pricing or trials but do not establish demand among 1–10-dwelling Brunei landlords.

**Recommendation:** interview at least 6–10 local landlords or letting professionals before selecting BND price points. Validate whether private landlords outsource rent collection, which language(s) they expect for support and contracts, need for property tax/fee workflows, and preference for monthly per-home pricing versus one small portfolio subscription. Do not assert country-specific legal clauses or localized payment capability before separate review.

## Currency, Stripe and regulatory go/no-go

- [Stripe currencies](https://docs.stripe.com/currencies) lists **LKR and BND** among card presentment currencies; this is **not** proof that Quixo Inc.'s connected account, desired payment methods, Stripe Managed Payments arrangements or subscriptions support the precise market flow.
- [Stripe recurring-customer currency rules](https://support.stripe.com/questions/set-or-change-currency-for-an-invoice-or-customer-in-stripe-billing) constrain currency changes once subscriptions exist. Regional pricing must use stable assigned Stripe Price IDs and a governed no-silent-migration policy.
- Stripe Managed Payments merchant-of-record eligibility, **LK and BN** tax coverage, Stripe account onboarding, fee stack and payment availability remain **B02 OPEN**. [Stripe tax coverage caveats](https://support.stripe.com/questions/block-payments-from-tax-unsupported-countries-using-radar) expressly retain merchant liability in uncovered jurisdictions.
- Country privacy review is also needed: [Brunei AITI PDPO 2025](https://www.aiti.gov.bn/reference-documents/list-of-legislations/) and regulator [January 2026 event](https://www.aiti.gov.bn/news/2025/inaugural-pdp-conference-advances-trust-accountability-and-digital-growth-in-the-nation/); [Sri Lanka PDPA current commencement discussion](https://www.ft.lk/it-telecom-tech/Industry-leaders-sound-alarm-on-data-subject-requests-under-PDPA/50-796556) references a **1 January 2027 staged date** following 2026 gazette/amendments. Verify directly with the applicable authoritative gazette/legal advisers, especially cross-border tenant data processing; earlier 2025 Sri Lankan DPA notice predates amendments and is not adequate current legal advice.

## Website draft review and decisions

- Exact shared generator parity for **both** `marketing/lk/index.html` and `marketing/bn/index.html` **PASSED** using the GitHub branch source evaluated in a sandboxed JS environment, compared byte-for-byte against GitHub files (2026-10-25). Static guard checks also verified `noindex,nofollow`, matching country metadata/canonical targets, shared stylesheet and absence of active signup/checkout/price CTAs.
- **NOT YET VALIDATED:** real mobile/browser layout, screen-reader keyboard navigation, completed local translations (both current drafts are in English), native local legal terminology, and independent public routes. `noindex` means these are *not* public search launch versions. Existing marketing Azure Static Web Apps workflow **automatically publishes on main changes to `marketing/**`**; keep branch unmerged until explicit publication approval.
- No product release for LK/BN should be inferred from static marketing copy. Reword/remove copy that implies live payment collection or local regulatory compliance if not verified.

## Decision gates — no default values invented

1. **Owner:** is Quixo a premium full-workflow provider with justified higher value than local low-cost competitors, or an affordability-first small-landlord tool? This materially affects regional pricing and whether the existing strictly linear per-dwelling model needs a separately approved entry minimum/portfolio tier.
2. **Research:** verified 1-, 3-, 5-, 10-dwelling affordability for LK and BN, compared on **total monthly cost**, not just per-unit sticker price.
3. **Finance:** quantify Stripe domestic/international card, currency conversion, fixed-fee, support and tax liabilities for a single dwelling at any proposed price.
4. **Owner:** approve exact LK/BN price and currency or retain USD $5 global baseline explicitly; Price entries only via Stripe after B02 acceptance.
5. **Release:** approve languages/legal copy, SEO `hreflang`/indexability, real browser accessibility, country pages publication, and public registration/paid entitlements as **separate** go/no-go decisions.

**Current recommendation:** prepare and privately preview **both** sites; **do not publish** these pages as a regional launch or choose prices from rental asking values. Research LK affordability before pricing, and use a separate BN discovery cohort rather than importing LK economics.
