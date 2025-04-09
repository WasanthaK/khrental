import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { format } from "date-fns";
import AgreementActions from "../../components/agreements/AgreementActions";

const RenteeAgreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchAgreements = async () => {
      try {
        setLoading(true);
        setError(null);

        // First get the app_user details for the current auth user
        const { data: appUserData, error: appUserError } = await supabase
          .from('app_users')
          .select('*')
          .eq('auth_id', user.id)
          .single();

        if (appUserError) {
          console.error('Error fetching user:', appUserError);
          throw new Error('Could not fetch user details');
        }

        if (!appUserData) {
          throw new Error('User profile not found');
        }

        // Now fetch agreements using the app_user id
        const { data: agreementsData, error: agreementsError } = await supabase
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

        // Map the agreements with property data
        const mappedAgreements = agreementsData.map(agreement => ({
          ...agreement,
          property: agreement.property,
          rentee: appUserData
        }));

        setAgreements(mappedAgreements || []);
      } catch (error) {
        console.error('Error fetching agreements:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAgreements();
    }
  }, [user]);

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
        {agreements.map((agreement) => (
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

            <div className="mt-4">
              <AgreementActions agreement={agreement} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RenteeAgreements; 