// One canonical source for all country marketing pages. Not runtime-loaded by the website.
// Countries: LK Sri Lanka, BN Brunei Darussalam. No unapproved SaaS prices or checkout.
export const COUNTRY_PAGES = [
  {
    "slug": "lk",
    "code": "LK",
    "name": "Sri Lanka",
    "language": "en-LK",
    "currency": "LKR",
    "heading": "Rental homes, ",
    "emphasis": "less administration.",
    "eyebrow": "For Sri Lankan landlords with 1–10 rental homes",
    "lede": "Whether you manage one rental house or a small portfolio, bring your property details, tenancy records, invoices and maintenance requests into a clearer workspace.",
    "example": "One house, several apartments, or a small mix of rental homes — stay organized without adopting an enterprise-sized system.",
    "contactSubject": "Quixo.Homes Sri Lanka enquiry"
  },
  {
    "slug": "bn",
    "code": "BN",
    "name": "Brunei Darussalam",
    "language": "en-BN",
    "currency": "BND",
    "heading": "Your rental homes, ",
    "emphasis": "one clear workspace.",
    "eyebrow": "For Brunei landlords with 1–10 rental homes",
    "lede": "Managing a few houses or apartments should not mean juggling scattered records. Organize tenancies, invoices, agreements and maintenance activity in one place.",
    "example": "From a single rental house to a small portfolio of apartments, keep the people, payments and day-to-day details easy to find.",
    "contactSubject": "Quixo.Homes Brunei enquiry"
  }
];

function escapeHtml(value) {return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}

export function renderCountryPage(m) {
 const h=escapeHtml;
 const base="https://quixo.homes/"+m.slug+"/";
 const subject=encodeURIComponent(m.contactSubject);
 const nav=COUNTRY_PAGES.map(other=>`<a class="button button-secondary" href="/${h(other.slug)}/"${other.slug===m.slug?' aria-current="page"':''}>${h(other.name)}</a>`).join("\n          ");
 return `<!doctype html>
<html lang="${h(m.language)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#102c31" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="description" content="Quixo.Homes rental management information for individual landlords in ${h(m.name)} with one to ten rentable dwellings. Local subscriptions are not yet available." />
  <meta property="og:title" content="Quixo.Homes ${h(m.name)} — Manage rental homes simply" />
  <meta property="og:description" content="A clear place for properties, tenancies, agreements, invoices and maintenance. Market information only; no local sign-up yet." />
  <meta property="og:type" content="website" />
  <link rel="canonical" href="${base}" />
  <link rel="stylesheet" href="/styles.css" />
  <title>Quixo.Homes ${h(m.name)} — Rental management for small landlords</title>
</head>
<body data-site="quixo-homes-marketing" data-country="${h(m.code)}">
  <a href="#main" class="skip">Skip to content</a>
  <header class="site-header">
    <div class="container nav">
      <a class="brand" href="/" aria-label="Quixo.Homes main site"><span class="brand-mark" aria-hidden="true">⌂</span><span>Quixo<span class="brand-dot">.</span>Homes</span></a>
      <nav class="menu" aria-label="Page navigation">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#contact">Contact</a>
      </nav>
      <a class="nav-link" href="https://app.quixo.homes/login">Existing customer sign in <span aria-hidden="true">↗</span></a>
    </div>
  </header>
  <main id="main">
    <section class="hero container" aria-labelledby="hero-title">
      <div class="hero-text">
        <div class="eyebrow"><span class="dot"></span>${h(m.eyebrow)}</div>
        <h1 id="hero-title">${h(m.heading)}<br /><em>${h(m.emphasis)}</em></h1>
        <p class="hero-lede">${h(m.lede)}</p>
        <div class="buttons">
          <a class="button button-primary" href="mailto:contact@quixo.online?subject=${subject}">Ask about availability <span aria-hidden="true">↗</span></a>
          <a class="button button-secondary" href="https://app.quixo.homes/login">Existing customer sign in <span aria-hidden="true">→</span></a>
        </div>
        <p class="fine">Local subscriptions and public sign-up are not open yet. Contact us for product information; no purchase can be made on this page.</p>
      </div>
      <div class="hero-art" role="img" aria-label="Illustration of a rental management workspace">
        <div class="floating-note note-top">Your homes. One view.</div>
        <div class="workspace">
          <div class="workspace-bar"><span class="mini-brand">Q<span>.</span>Homes</span><span class="bar-dots">● ● ●</span></div>
          <div class="workspace-title">Rental overview <span class="tiny-tag">Workspace</span></div>
          <div class="workspace-cards">
            <div class="workspace-card"><span class="symbol">⌂</span><span>Homes</span><strong>Keep track</strong></div>
            <div class="workspace-card"><span class="symbol">◫</span><span>Tenancies</span><strong>Stay organized</strong></div>
            <div class="workspace-card"><span class="symbol">◎</span><span>Invoices</span><strong>See the detail</strong></div>
          </div>
          <div class="workspace-list"><span>Everyday rental activities</span>
            <div><i class="list-icon blue">✓</i><span>Agreement records</span><span class="pill">Together</span></div>
            <div><i class="list-icon mint">↗</i><span>Invoice information</span><span class="pill">Visible</span></div>
            <div><i class="list-icon peach">◇</i><span>Maintenance requests</span><span class="pill">Tracked</span></div>
          </div>
        </div>
        <div class="floating-note note-bottom">Made for smaller portfolios</div>
      </div>
    </section>
    <section class="credibility" aria-label="Small-landlord overview">
      <div class="container credibility-inner"><strong>ONE CONNECTED WORKSPACE</strong><span>Homes</span><span>Tenancies</span><span>Agreements</span><span>Invoices</span><span>Maintenance</span></div>
    </section>
    <section class="section container" id="features" aria-labelledby="features-title">
      <div class="section-heading">
        <p class="overline">BUILT AROUND YOUR RENTALS</p>
        <h2 id="features-title">The essentials, <br />in one place.</h2>
        <p>${h(m.example)}</p>
      </div>
      <div class="feature-grid">
        <article class="feature"><span class="feature-icon" aria-hidden="true">⌂</span><h3>Properties and units</h3><p>Organize the houses and apartments you manage.</p></article>
        <article class="feature"><span class="feature-icon" aria-hidden="true">✍</span><h3>Agreements and tenants</h3><p>Keep rental relationships and document activity together.</p></article>
        <article class="feature"><span class="feature-icon" aria-hidden="true">▤</span><h3>Invoices and records</h3><p>Follow charges, documents and payment information without scattered spreadsheets.</p></article>
        <article class="feature"><span class="feature-icon" aria-hidden="true">♧</span><h3>Maintenance</h3><p>See requests and everyday property tasks in context.</p></article>
        <article class="feature"><span class="feature-icon" aria-hidden="true">◎</span><h3>Rental overview</h3><p>See what is happening across your small portfolio.</p></article>
        <article class="feature"><span class="feature-icon" aria-hidden="true">◇</span><h3>Tenant information</h3><p>Keep tenancy details connected to the right properties.</p></article>
      </div>
    </section>
    <section id="how-it-works" class="how-section">
      <div class="container how-grid">
        <div><p class="overline">HOW IT WORKS</p><h2>One to ten homes. <br />Fewer moving parts.</h2><p>Quixo.Homes is being prepared for small landlords who want more clarity with less administration.</p></div>
        <ol class="steps">
          <li><span>01</span><div><h3>Bring your rental details together</h3><p>Organize the homes and tenancy records you manage.</p></div></li>
          <li><span>02</span><div><h3>Follow agreements and billing</h3><p>Keep the related records easier to find and review.</p></div></li>
          <li><span>03</span><div><h3>Stay on top of property activity</h3><p>Track ongoing tasks and maintenance information.</p></div></li>
        </ol>
      </div>
    </section>
    <section class="section container" aria-labelledby="country-title">
      <div class="section-heading">
        <p class="overline">COUNTRY EXPERIENCE</p>
        <h2 id="country-title">Choose your market.</h2>
        <p>We are preparing country-specific information for Sri Lanka and Brunei Darussalam. Country-specific pricing and legal terms will be announced only when approved.</p>
      </div>
      <nav class="buttons" aria-label="Choose a country website">
          ${nav}
      </nav>
      <p class="fine">Displayed markets are not evidence of local payment or tax readiness.</p>
    </section>
    <section class="contact container" id="contact" aria-labelledby="contact-title">
      <div class="contact-content">
        <p class="overline">LET'S TALK — ${h(m.name)}</p>
        <h2 id="contact-title">See what Quixo.Homes <br />could simplify.</h2>
        <p>Interested in the ${h(m.name)} experience? Ask about availability and upcoming features. Local subscriptions are not yet available.</p>
        <a class="button button-light" href="mailto:contact@quixo.online?subject=${subject}">Contact Quixo.Homes <span aria-hidden="true">↗</span></a>
      </div>
      <div class="contact-decoration" aria-hidden="true"><span>Q<span class="brand-dot">.</span>H</span></div>
    </section>
  </main>
  <footer class="footer"><div class="container footrow">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">⌂</span><span>Quixo<span class="brand-dot">.</span>Homes</span></a>
    <p>Quixo.Homes ${h(m.name)} — country information preview</p>
    <div><a href="mailto:contact@quixo.online">Contact</a><a href="https://app.quixo.homes/login">Existing customer sign in</a></div>
  </div></footer>
</body>
</html>
`;
}
