import React, { useEffect, useState } from 'react';
import { platform as platformClient } from '../../services/platformClient';
import { useAuth } from '../../hooks/useAuth';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import AgreementActions from '../../components/agreements/AgreementActions';
import { findAppUserByAuthId } from '../../services/appUserService';
import { getTenancyExit, respondToTenancyNotice } from '../../services/tenancyExitService';
import { fetchProperty } from '../../services/agreementService';
import { updateMyTenancyBillingDay } from '../../services/platformClient';

const noticeLabel = (noticeType) => noticeType === 'renewal_offer' ? 'Renewal offer' : 'Termination notice';

const getAgreementBillingDay = (agreement) => {
  const fallback = 5;
  let terms = agreement?.terms;
  if (typeof terms === 'string') {
    try {
      terms = JSON.parse(terms);
    } catch (_error) {
      terms = {};
    }
  }
  const value = Number.parseInt(String(terms?.billingDay ?? ''), 10);
  return Number.isInteger(value) && value >= 5 && value <= 28 ? value : fallback;
};


const NoticeCard = ({ notice, working, onRespond }) => (
  <div className="mt-4 border border-blue-200 bg-blue-50 rounded-md p-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-blue-900">{noticeLabel(notice.notice_type)}</p>
        <p className="text-xs text-blue-700 mt-1">
          Notice {notice.notice_date ? format(new Date(notice.notice_date), 'PP') : 'date not set'}
          {notice.effective_date ? ` · Effective ${format(new Date(notice.effective_date), 'PP')}` : ''}
        </p>
      </div>
      <span className="px-2 py-1 rounded-full bg-white text-blue-800 text-xs font-medium capitalize">{notice.status}</span>
    </div>
    {notice.content && <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{notice.content}</p>}
    {notice.response_notes && <p className="text-xs text-gray-600 mt-2">Your note: {notice.response_notes}</p>}
    {notice.status === 'sent' && (
      <div className="flex flex-wrap gap-2 mt-3">
        {notice.notice_type === 'renewal_offer' ? (
          <>
            <button disabled={working} onClick={() => onRespond(notice, 'accepted')} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs disabled:opacity-50">Accept renewal</button>
            <button disabled={working} onClick={() => onRespond(notice, 'declined')} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs disabled:opacity-50">Decline renewal</button>
          </>
        ) : (
          <button disabled={working} onClick={() => onRespond(notice, 'acknowledged')} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs disabled:opacity-50">Acknowledge notice</button>
        )}
      </div>
    )}
  </div>
);

const RenteeAgreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [exitData, setExitData] = useState({});
  const [loading, setLoading] = useState(true);
  const [workingNoticeId, setWorkingNoticeId] = useState(null);
  const [workingBillingAgreementId, setWorkingBillingAgreementId] = useState(null);
  const [billingDays, setBillingDays] = useState({});
  const [error, setError] = useState(null);
  const { user, activeTenantId } = useAuth();

  const loadExitProjection = async (agreementId) => {
    const result = await getTenancyExit(agreementId);
    if (!result.error) {
      setExitData((current) => ({ ...current, [agreementId]: result.data }));
    }
  };

  useEffect(() => {
    const fetchAgreements = async () => {
      try {
        setLoading(true);
        setError(null);

        const appUserResult = await findAppUserByAuthId(user.id);

        if (!appUserResult.success) {
          console.error('Error fetching user:', appUserResult.error);
          throw new Error('Could not fetch user details');
        }

        const appUserData = appUserResult.data;

        if (!appUserData) {
          if (user?.isDevelopmentBypass) {
            console.warn('No app_user found for development bypass auth user. Returning an empty agreement list.');
            setAgreements([]);
            setExitData({});
            return;
          }

          throw new Error('User profile not found');
        }

        const { data: agreementsData, error: agreementsError } = await platformClient
          .from('agreements')
          .select(`
            *,
            property:propertyid (
              id,
              name,
              address,
              propertytype,
              images
            )
          `)
          .eq('renteeid', appUserData.id)
          .order('createdat', { ascending: false });

        if (agreementsError) {
          console.error('Error fetching agreements:', agreementsError);
          throw agreementsError;
        }

        const mappedAgreements = await Promise.all((agreementsData || []).map(async (agreement) => {
          const resolvedProperty = agreement.property || (agreement.propertyid
            ? await fetchProperty(agreement.propertyid).catch((propertyError) => {
                console.warn('Could not resolve agreement property:', propertyError?.message || propertyError);
                return null;
              })
            : null);

          return {
            ...agreement,
            property: resolvedProperty,
            rentee: appUserData
          };
        }));

        setAgreements(mappedAgreements);
        setBillingDays(Object.fromEntries(
          mappedAgreements.map((agreement) => [agreement.id, getAgreementBillingDay(agreement)])
        ));

        const projections = await Promise.all(mappedAgreements.map(async (agreement) => {
          const result = await getTenancyExit(agreement.id);
          return [agreement.id, result.error ? null : result.data];
        }));
        setExitData(Object.fromEntries(projections.filter(([, projection]) => projection)));
      } catch (fetchError) {
        console.error('Error fetching agreements:', fetchError);
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAgreements();
    }
  }, [user?.id, user?.isDevelopmentBypass, activeTenantId]);

  const handleBillingDaySave = async (agreement) => {
    const billingDay = Number.parseInt(String(billingDays[agreement.id] ?? 5), 10);
    setWorkingBillingAgreementId(agreement.id);
    const result = await updateMyTenancyBillingDay(agreement.id, billingDay);
    if (result.error) {
      toast.error(result.error.message || 'Billing day could not be updated');
    } else {
      toast.success(`Billing day updated to day ${billingDay}`);
      setAgreements((current) => current.map((entry) => {
        if (entry.id !== agreement.id) return entry;
        let terms = entry.terms;
        if (typeof terms === 'string') {
          try {
            terms = JSON.parse(terms);
          } catch (_error) {
            terms = {};
          }
        }
        return { ...entry, terms: { ...(terms || {}), billingDay } };
      }));
    }
    setWorkingBillingAgreementId(null);
  };

  const handleNoticeResponse = async (notice, response) => {
    setWorkingNoticeId(notice.id);
    const result = await respondToTenancyNotice(notice.id, { response });
    if (result.error) {
      toast.error(result.error.message || 'Notice response could not be saved');
    } else {
      toast.success(response === 'acknowledged' ? 'Notice acknowledged' : `Renewal ${response}`);
      await loadExitProjection(notice.agreement_id);
    }
    setWorkingNoticeId(null);
  };

  if (loading) {
    return <div className="p-4">Loading agreements...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <div className="text-gray-600">
          Please try refreshing the page. If the problem persists, contact support.
        </div>
      </div>
    );
  }

  if (!agreements.length) {
    return (
      <div className="p-4">
        <div className="text-gray-600">No agreements found.</div>
        <div className="text-sm text-gray-500 mt-2">
          When you have active agreements, they will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">My Agreements</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agreements.map((agreement) => {
          const notices = exitData[agreement.id]?.notices || [];
          return (
            <div
              key={agreement.id}
              className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {agreement.property?.name || 'Unnamed Property'}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {agreement.property?.address || 'No address provided'}
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Start Date:</span>{' '}
                  {agreement.startdate ? format(new Date(agreement.startdate), 'PP') : 'Not set'}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">End Date:</span>{' '}
                  {agreement.enddate ? format(new Date(agreement.enddate), 'PP') : 'Not set'}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Status:</span>{' '}
                  <span className={`capitalize ${
                    agreement.status === 'active' ? 'text-green-600' :
                    agreement.status === 'pending' ? 'text-yellow-600' :
                    'text-gray-600'
                  }`}>
                    {agreement.status || 'Unknown'}
                  </span>
                </p>
              </div>

              {agreement.status === 'active' && (
                <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-3">
                  <label className="block text-sm font-medium text-blue-950">
                    Monthly invoice generation day
                  </label>
                  <p className="mt-1 text-xs text-blue-800">
                    Choose day 5–28 for this property. This applies to future monthly invoice drafts.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={billingDays[agreement.id] ?? getAgreementBillingDay(agreement)}
                      onChange={(event) => setBillingDays((current) => ({
                        ...current,
                        [agreement.id]: Number(event.target.value)
                      }))}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, index) => index + 5).map((day) => (
                        <option key={day} value={day}>Day {day}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={workingBillingAgreementId === agreement.id}
                      onClick={() => handleBillingDaySave(agreement)}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {workingBillingAgreementId === agreement.id ? 'Saving…' : 'Save billing day'}
                    </button>
                  </div>
                </div>
              )}

              {notices.map((notice) => (
                <NoticeCard
                  key={notice.id}
                  notice={notice}
                  working={workingNoticeId === notice.id}
                  onRespond={handleNoticeResponse}
                />
              ))}

              <div className="mt-4">
                <AgreementActions agreement={agreement} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RenteeAgreements;
