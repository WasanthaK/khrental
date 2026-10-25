# Quixo.Homes R4 shared website — unpublished source preview

Owner-approved visual direction, isolated source-only prototype in `marketing/r4-preview/`, **not the currently published website**. The exact owner-supplied mockup ZIP and its logo/media **are not in this public repository**. Accordingly, property image panels and logo treatment in this source scaffold are explicit placeholders; the previously supplied private offline ZIP retains the owner-approved visual imagery and corrected private SVG.

Use `node marketing/r4-preview/build.mjs --check` to verify byte-for-byte generated pages, or run without `--check` to regenerate draft pages. The ten HTML pages are generated from one shared template with verified LK/BN locale and currency labels and five route types per market.

Static preview paths: `r4-preview/lk/`, `r4-preview/lk/search/`, `r4-preview/lk/property/`, `r4-preview/lk/owners/`, `r4-preview/lk/how-it-works/`, and their `bn` equivalents. All pages are `noindex,nofollow` and show mock data only. The typed form controls are disabled, viewing enquiry button cannot submit, there is no registration/checkout API, and there is no production listing projection or tenant data access.

The legacy `marketing/index.html`, `marketing/lk/index.html`, `marketing/bn/index.html` have **not been replaced**. Publishing requires independent authorization, full visual browser/mobile/accessibility QA, real licensed imagery and exact approved logo, safe listing projection and feature-release gates. Do not merge `marketing/**` from this branch to `main` without a dedicated production publication decision; the existing main-branch marketing workflow automatically deploys `marketing/**`.
