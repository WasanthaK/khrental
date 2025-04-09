import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import AgreementSummaryCard from '../components/agreements/AgreementSummaryCard';

const AgreementList = () => {
  const navigate = useNavigate();
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdat');
  const [sortOrder, setSortOrder] = useState('desc');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchAgreements();
  }, []);

  const fetchAgreements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('agreements')
        .select(`
          *,
          properties:propertyid(
            id,
            name,
            address,
            images,
            propertytype
          ),
          property_units:unitid(
            id,
            unitnumber,
            floor
          ),
          rentee:renteeid(
            id,
            name,
            email,
            contact_details
          ),
          template:templateid(
            id,
            name
          )
        `)
        .order(sortBy, { ascending: sortOrder === 'asc' });

      if (error) {
        throw error;
      }
      setAgreements(data || []);
    } catch (error) {
      console.error('Error fetching agreements:', error);
      setError(error.message);
      toast.error('Failed to load agreements');
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status) => {
    const statusLabels = {
      draft: 'Draft',
      review: 'In Review',
      created: 'Created',
      pending: 'Pending Signature',
      pending_signature: 'Pending Signature',
      partially_signed: 'Partially Signed',
      pending_activation: 'Pending Activation',
      signed: 'Signed',
      active: 'Active',
      expired: 'Expired',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      terminated: 'Terminated'
    };
    return statusLabels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800 border border-gray-300',
      review: 'bg-blue-100 text-blue-800 border border-blue-300',
      created: 'bg-gray-100 text-gray-800 border border-gray-300',
      pending: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
      pending_signature: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
      partially_signed: 'bg-blue-100 text-blue-800 border border-blue-300',
      pending_activation: 'bg-blue-100 text-blue-800 border border-blue-300',
      signed: 'bg-green-100 text-green-800 border border-green-300',
      active: 'bg-green-100 text-green-800 border border-green-300',
      expired: 'bg-red-100 text-red-800 border border-red-300',
      rejected: 'bg-red-100 text-red-800 border border-red-300',
      cancelled: 'bg-orange-100 text-orange-800 border border-orange-300',
      terminated: 'bg-gray-100 text-gray-800 border border-gray-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border border-gray-300';
  };

  const filteredAgreements = agreements.filter(agreement => {
    const matchesSearch = 
      agreement.properties?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agreement.rentee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agreement.template?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' || 
      agreement.status === statusFilter || 
      agreement.signature_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const openPreview = (url) => {
    setPreviewUrl(url);
    setShowPreview(true);
  };

  const closePreview = () => {
    setShowPreview(false);
    setPreviewUrl(null);
  };

  const handleCancelAgreement = async (agreementId, cancelReason = '') => {
    // Confirmation is handled by the AgreementSummaryCard component for active agreements
    // For pending agreements, we've already confirmed in the card component
    
    try {
      // First, get the agreement details to find the property ID
      const { data: agreementData, error: fetchError } = await supabase
        .from('agreements')
        .select('propertyid, status')
        .eq('id', agreementId)
        .single();
        
      if (fetchError) {
        throw fetchError;
      }
      
      // Update the agreement to cancelled status
      const { data, error } = await supabase
        .from('agreements')
        .update({
          status: 'cancelled',
          cancellation_reason: cancelReason,
          updatedat: new Date().toISOString()
        })
        .eq('id', agreementId);
        
      if (error) {
        throw error;
      }
      
      // If we have a property ID and the agreement was active, update property status to available
      if (agreementData.propertyid && 
          (agreementData.status === 'active' || 
           agreementData.status === 'signed' || 
           agreementData.status === 'completed')) {
        
        const { error: propertyError } = await supabase
          .from('properties')
          .update({
            status: 'available',
            updatedat: new Date().toISOString()
          })
          .eq('id', agreementData.propertyid);
          
        if (propertyError) {
          console.error('Error updating property status:', propertyError);
          toast.error('Agreement cancelled but property status update failed');
        } else {
          toast.success('Agreement cancelled and property set as available');
        }
      } else {
        toast.success('Agreement cancelled successfully');
      }
      
      // Update the local state to reflect the change
      setAgreements(prevAgreements => 
        prevAgreements.map(agreement => 
          agreement.id === agreementId 
            ? { ...agreement, status: 'cancelled', cancellation_reason: cancelReason } 
            : agreement
        )
      );
    } catch (error) {
      console.error('Error cancelling agreement:', error);
      toast.error('Failed to cancel agreement');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Agreements</h1>
          <button
            onClick={() => navigate('/dashboard/agreements/new')}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create New Agreement
          </button>
        </div>

        {/* Filters and Search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-lg shadow-sm">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              id="search"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Search by property, rentee, or template..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              id="status"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="pending_signature">Pending Signature</option>
              <option value="partially_signed">Partially Signed</option>
              <option value="signed">Signed</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="terminated">Terminated</option>
              <option value="signing_initiated">Signing Initiated</option>
              <option value="signing_complete">Signing Complete</option>
              <option value="signed_by_landlord">Signed by Landlord</option>
              <option value="signed_by_tenant">Signed by Tenant</option>
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              id="sort"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order);
              }}
            >
              <option value="createdat-desc">Newest First</option>
              <option value="createdat-asc">Oldest First</option>
              <option value="startdate-desc">Start Date (Latest)</option>
              <option value="startdate-asc">Start Date (Earliest)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Document Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl mx-4 w-full max-w-6xl h-5/6 flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium">Agreement Document</h3>
              <button 
                onClick={closePreview}
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-1 bg-gray-100">
              <iframe 
                src={previewUrl} 
                className="w-full h-full border-0 rounded"
                title="Agreement Preview"
              />
            </div>
            <div className="p-4 border-t flex justify-end">
              <a 
                href={previewUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Agreements List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-blue-500 hover:bg-blue-400 transition ease-in-out duration-150 cursor-not-allowed">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading agreements...
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-red-500">
            Error: {error}
          </div>
        </div>
      ) : filteredAgreements.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No agreements found</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new agreement.</p>
          <div className="mt-6">
            <button
              onClick={() => navigate('/dashboard/agreements/new')}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Create New Agreement
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredAgreements.map((agreement) => {
            // Prepare signatory data for each agreement
            let signatoryData = [];
            const status = agreement.status || '';
            const signatureStatus = agreement.signature_status || '';
            
            // If we have signatories_status data, use it for more accurate information
            if (agreement.signatories_status) {
              try {
                const signatories = typeof agreement.signatories_status === 'string'
                  ? JSON.parse(agreement.signatories_status)
                  : agreement.signatories_status;
                
                // Map the signatories data to our format
                signatoryData = signatories.map(sig => ({
                  id: sig.reference || sig.email || sig.type,
                  name: sig.name || (sig.type === 'landlord' ? 'Property Owner' : 'Tenant'),
                  email: sig.email,
                  type: sig.type,
                  completed: sig.status === 'completed',
                  signedAt: sig.signed_at || sig.signedAt
                }));
              } catch (e) {
                console.error('Error parsing signatories_status:', e);
                // Fall back to default logic below
              }
            }
            
            // If we don't have signatories_status or parsing failed, use default logic
            if (signatoryData.length === 0) {
              // Add landlord - only mark as signed if specifically mentioned in signature_status
              const landlordSigned = 
                signatureStatus.includes('landlord') || 
                signatureStatus === 'signing_complete' || 
                signatureStatus === 'signed' ||
                status === 'signed' || 
                status === 'completed' ||
                status === 'active';
                
              signatoryData.push({
                id: 'landlord',
                name: 'Property Owner',
                type: 'landlord',
                completed: landlordSigned
              });
              
              // Add tenant - only mark as signed if specifically mentioned in signature_status
              if (agreement.rentee) {
                const tenantSigned = 
                  signatureStatus.includes('tenant') || 
                  signatureStatus === 'signing_complete' || 
                  signatureStatus === 'signed' ||
                  status === 'signed' || 
                  status === 'completed' ||
                  status === 'active';
                  
                signatoryData.push({
                  id: agreement.rentee.id,
                  name: agreement.rentee.name,
                  email: agreement.rentee.email,
                  type: 'tenant',
                  completed: tenantSigned
                });
              }
            }
            
            return (
              <AgreementSummaryCard
                key={agreement.id}
                agreement={agreement}
                property={agreement.properties}
                rentee={agreement.rentee}
                signatories={signatoryData}
                onViewClick={() => navigate(`/dashboard/agreements/${agreement.id}`)}
                onCancelClick={() => handleCancelAgreement(agreement.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgreementList; 