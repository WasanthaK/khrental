// B04 S3c2, source-only tenantless seeker landing.
// Deliberately not mounted. Only a future server-verified auth-context
// adapter may supply props after controlled registration acceptance.
import { isVerifiedTenantlessSeeker } from '../utils/seekerLandingPolicy';
import { Link } from 'react-router-dom';
import { isPropertyEnquiriesEnabled } from '../utils/env';

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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm"
        aria-labelledby="seeker-home-heading">
        <p className="text-sm font-semibold text-blue-700">Quixo.Homes</p>
        <h1 id="seeker-home-heading" className="mt-2 text-3xl font-semibold text-slate-900">
          Your seeker account
        </h1>
        <p className="mt-4 text-slate-700">
          Your personal account is ready. You are not currently linked to any rental organization.
        </p>
        {isPropertyEnquiriesEnabled() && <Link to="/enquire" className="inline-block mt-6 text-blue-800 underline">
          My property enquiries and owner replies
        </Link>}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-900">What happens next?</h2>
          <p className="mt-2 text-sm text-slate-600">
            You can join a rental organization after receiving and accepting a valid invitation.
            Property management and subscription billing are separate services.
          </p>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          No properties, leases, invoices or team administration are available until
          the necessary access has been verified.
        </p>
      </section>
    </main>
  );
};

export default SeekerHome;
