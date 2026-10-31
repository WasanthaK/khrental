import { isVerifiedTenantlessSeeker } from '../utils/seekerLandingPolicy';
import { Link } from 'react-router-dom';
import { isPropertyEnquiriesEnabled } from '../utils/env';
import SeekerLayout from '../components/layouts/SeekerLayout';

const SeekerHome = ({
  user = null,
  membership,
  memberships,
  tenantContextVerified = false
}) => {
  const allowed = isVerifiedTenantlessSeeker({
    user, membership, memberships, tenantContextVerified
  });

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <section aria-labelledby="seeker-unavailable-heading"
          className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Quixo.Homes</p>
          <h1 id="seeker-unavailable-heading" className="mt-2 text-2xl font-semibold text-slate-900">
            Account context unavailable
          </h1>
          <p className="mt-4 text-slate-600">
            We could not confirm your account permissions. Sign in again to continue.
          </p>
        </section>
      </main>
    );
  }

  return <SeekerLayout active="home">
    <section className="seeker-hero" aria-labelledby="seeker-home-heading">
      <div>
        <p className="seeker-kicker">Your home search</p>
        <h1 id="seeker-home-heading">Your next move starts here.</h1>
        <p>Find a place you love, ask the owner a question and keep your rental plans together.</p>
        <a className="seeker-button seeker-button-light" href="#browse-rentals">Find a rental <span aria-hidden="true">&nbsp;→</span></a>
      </div>
      <div className="seeker-hero-note">
        <h2>Already found a place?</h2>
        <p>Open the property listing and choose “Express your interest” to contact its owner. Your replies and next steps will appear here.</p>
        {isPropertyEnquiriesEnabled() && <Link className="seeker-button seeker-button-secondary" to="/enquire">View my enquiries</Link>}
      </div>
    </section>
    <section id="browse-rentals" className="seeker-section" aria-labelledby="browse-heading">
      <div className="seeker-card"><h2>Have a property to rent?</h2><p>Use your existing account to add and manage your property.</p><Link className="seeker-button" to="/owner-start">List/manage my property</Link></div>
      <div className="seeker-section-heading"><div><p className="seeker-kicker">Start exploring</p><h2 id="browse-heading">Where would you like to rent?</h2></div></div>
      <div className="seeker-grid">
        {[['Sri Lanka','LK','lk'],['Brunei','BN','bn']].map(([name,code,path])=><article key={code} className="seeker-card seeker-market">
          <div><p className="seeker-kicker">{code}</p><h3>{name}</h3><p>Explore available homes and spaces.</p></div>
          <a className="seeker-button" href={'https://quixo.homes/'+path+'/search/'}>Browse {name}</a>
        </article>)}
      </div>
    </section>
    {isPropertyEnquiriesEnabled() && <section className="seeker-section" aria-labelledby="keep-moving-heading">
      <h2 id="keep-moving-heading">Pick up where you left off</h2>
      <div className="seeker-grid">
        <article className="seeker-card"><p className="seeker-kicker">Conversations & viewings</p><h3>My enquiries</h3><p>Read owner replies, arrange a viewing and follow your applications.</p><Link className="seeker-text-link" to="/enquire">Open my enquiries →</Link></article>
        <article className="seeker-card"><p className="seeker-kicker">Your next chapter</p><h3>Offers & agreements</h3><p>Review rental terms and follow the next steps when an owner makes you an offer.</p><Link className="seeker-text-link" to="/rental-journey">View offers & agreements →</Link></article>
      </div>
    </section>}
    <section className="seeker-section" aria-labelledby="search-steps-heading">
      <h2 id="search-steps-heading">From finding a place to moving in</h2>
      <div className="seeker-steps">
        <div><span className="seeker-step-number">01 · EXPLORE</span><h3>Find your place</h3><p>Browse rentals and check the details that matter to you.</p></div>
        <div><span className="seeker-step-number">02 · CONNECT</span><h3>Talk to the owner</h3><p>Send an enquiry, arrange a viewing and apply when you’re ready.</p></div>
        <div><span className="seeker-step-number">03 · AGREE</span><h3>Plan your move</h3><p>If the owner offers you the rental, review the terms and follow your agreement steps.</p></div>
      </div>
    </section>
  </SeekerLayout>;
};

export default SeekerHome;
