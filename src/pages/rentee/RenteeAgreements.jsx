import {Link} from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { platform as platformClient } from '../../services/platformClient';
import { useAuth } from '../../hooks/useAuth';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import AgreementActions from '../../components/agreements/AgreementActions';
import { getTenancyExit, respondToTenancyNotice } from '../../services/tenancyExitService';

const noticeLabel = (noticeType) => noticeType === 'renewal_offer' ? 'Renewal offer' : 'Termination notice';

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

        const appUserId = user?.profileId || user?.appUserId || null;
        if (!appUserId) {
          if (user?.isDevelopmentBypass) {
            setAgreements([]);
            setExitData({});
            return;
          }
          throw new Error('User profile not found');
        }

        const appUserData = {
          id: appUserId,
          name: user?.name || user?.email,
          email: user?.email
        };

        const { data: agreementsData, error: agreementsError } = await platformClient
          .from('agreements')
          .select(`
            *,
            properties!propertyid (
              id,
              name,
              address,
              propertytype,
              images
            )
          `)
          .eq('renteeid', appUserId)
          .order('createdat', { ascending: false });

        if (agreementsError) {
          console.error('Error fetching agreements:', agreementsError);
          throw agreementsError;
        }

        const agreements = agreementsData || [];
        const missingPropertyIds = [...new Set(
          agreements
            .filter((agreement) => !agreement.properties && agreement.propertyid)
            .map((agreement) => String(agreement.propertyid))
        )];

        let propertyById = new Map();
        if (missingPropertyIds.length > 0) {
          const { data: propertyData, error: propertyError } = await platformClient
            .from('properties')
            .select('id, name, address, propertytype, images')
            .in('id', missingPropertyIds);

          if (propertyError) {
            console.warn('Could not resolve renter agreement properties through central scope:', propertyError.message);
          } else {
            propertyById = new Map(
              (propertyData || []).map((property) => [String(property.id).toLowerCase(), property])
            );
          }
        }

        const mappedAgreements = agreements.map((agreement) => ({
          ...agreement,
          property: agreement.properties
            || (agreement.propertyid
              ? propertyById.get(String(agreement.propertyid).toLowerCase()) || null
              : null),
          rentee: appUserData
        }));

        setAgreements(mappedAgreements);
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
  }, [user?.id, user?.profileId, user?.isDevelopmentBypass, activeTenantId, user?.appUserId, user?.name, user?.email]);

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
      <Link to="/rental-journey" className="block underline mb-4">My rental offers and enquiry history</Link>
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

              {notices.map((notice) => (
                <NoticeCard
                  key={notice.id}
                  notice={notice}
                  working={workingNoticeId === notice.id}
                  onRespond={handleNoticeResponse}
                />
              ))}

              <div className="mt-4">
                <AgreementActions agreement={agreement} signatureManagementEnabled={false} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RenteeAgreements;
