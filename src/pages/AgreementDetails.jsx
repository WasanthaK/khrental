import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, updateData, deleteData, supabase } from '../services/supabaseClient';
import { formatDate } from '../utils/helpers';
import { toast } from 'react-hot-toast';
import SignatureProgressTracker from '../components/ui/SignatureProgressTracker';

const AgreementDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [agreement, setAgreement] = useState(null);
  const [property, setProperty] = useState(null);
  const [rentee, setRentee] = useState(null);
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [viewMode, setViewMode] = useState('document'); // 'document' or 'content'
  const [signatories, setSignatories] = useState([]);
  
  useEffect(() => {
    const fetchAgreementData = async () => {
      try {
        setLoading(true);
        
        // Fetch agreement details with all content fields - avoid fields that might not exist in database
        const { data: agreementData, error: agreementError } = await supabase
          .from('agreements')
          .select('*, property:properties(*), unit:property_units(*), rentee:app_users!agreements_renteeid_fkey(*)')
          .eq('id', id)
          .single();
        
        if (agreementError) {
          console.error('Supabase error fetching agreement:', agreementError);
          setError(`Error loading agreement: ${agreementError.message || 'Unknown error'}`);
          throw agreementError;
        }
        
        if (agreementData) {
          setAgreement(agreementData);
          
          // Debug log for content fields
          console.log('Agreement content fields:', {
            id: agreementData.id,
            hasProcessedContent: !!agreementData.processedcontent,
            hasContent: !!agreementData.content,
            hasTemplateContent: !!agreementData.templatecontent,
            hasDocumentUrl: !!agreementData.documenturl,
            hasPdfUrl: !!agreementData.pdfurl,
            status: agreementData.status
          });
          
          // If there's no PDF URL, default to content view
          if (!agreementData.pdfurl) {
            setViewMode('content');
          }
          
          // Set property from joined data
          if (agreementData.property) {
            setProperty(agreementData.property);
          }
          
          // Set rentee from joined data
          if (agreementData.rentee) {
            setRentee(agreementData.rentee);
          }
          
          // Fetch associated template if needed
          if (agreementData.templateid) {
            const { data: templateData, error: templateError } = await fetchData('agreement_templates', {
              filters: [{ column: 'id', operator: 'eq', value: agreementData.templateid }],
            });
            
            if (templateError) {
              throw templateError;
            }
            
            if (templateData && templateData.length > 0) {
              setTemplate(templateData[0]);
            }
          }

          // Prepare signatories data for the progress tracker
          // This is a simplified approach - in a real app you might fetch actual signatories
          const status = agreementData.signature_status || agreementData.status;
          const signatoryList = [];
          
          // Add landlord
          signatoryList.push({
            id: 'landlord',
            name: 'Property Owner',
            role: 'Landlord',
            completed: status === 'signed' || status === 'completed' || status === 'partially_signed' || status === 'in_progress'
          });
          
          // Add tenant if available
          if (rentee) {
            signatoryList.push({
              id: rentee.id,
              name: rentee.name,
              email: rentee.contact_details?.email,
              role: 'Tenant',
              completed: status === 'signed' || status === 'completed'
            });
          } else {
            // Add generic tenant if rentee data isn't loaded yet
            signatoryList.push({
              id: 'tenant',
              name: 'Tenant',
              role: 'Tenant',
              completed: status === 'signed' || status === 'completed'
            });
          }
          
          setSignatories(signatoryList);
        } else {
          throw new Error('Agreement not found');
        }
      } catch (error) {
        console.error('Error fetching agreement data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAgreementData();
  }, [id]);
  
  const handleDelete = async () => {
    try {
      setLoading(true);
      const { error } = await deleteData('agreements', id);
      
      if (error) {
        throw error;
      }
      
      navigate('/dashboard/agreements');
    } catch (error) {
      console.error('Error deleting agreement:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };
  
  const handleSignAgreement = async () => {
    try {
      setLoading(true);
      
      if (!agreement) {
        toast.error('Agreement data not found');
        return;
      }
      
      // 1. Update agreement status to signed
      const { error: agreementError } = await supabase
        .from('agreements')
        .update({
          status: 'signed',
          signeddate: new Date().toISOString(),
          updatedat: new Date().toISOString(),
        })
        .eq('id', id);
      
      if (agreementError) {
        throw agreementError;
      }
      
      // 2. Mark the property as available
      if (property) {
        const { error: propertyError } = await supabase
          .from('properties')
          .update({
            status: 'available',
            updatedat: new Date().toISOString()
          })
          .eq('id', property.id);
          
        if (propertyError) {
          console.error('Error updating property status:', propertyError);
        }
      }
      
      // 3. Update unit status if unit ID exists
      if (agreement.unitid) {
        const { error: unitError } = await supabase
          .from('property_units')
          .update({
            status: 'occupied',
            updatedat: new Date().toISOString()
          })
          .eq('id', agreement.unitid);
          
        if (unitError) {
          console.error('Error updating unit status:', unitError);
        }
      }
      
      // 4. Add property to rentee's associated properties if not already there
      if (agreement.renteeid && property) {
        // First get the rentee's current associated properties
        const { data: userData, error: userError } = await supabase
          .from('app_users')
          .select('associated_property_ids')
          .eq('id', agreement.renteeid)
          .single();
        
        if (userError) {
          console.error('Error fetching rentee data:', userError);
        } else {
          // Add property to the associated_property_ids array if not already there
          const currentProperties = userData.associated_property_ids || [];
          if (!currentProperties.includes(property.id)) {
            const updatedProperties = [...currentProperties, property.id];
            
            // Update the rentee's record
            const { error: updateError } = await supabase
              .from('app_users')
              .update({
                associated_property_ids: updatedProperties,
                updatedat: new Date().toISOString()
              })
              .eq('id', agreement.renteeid);
            
            if (updateError) {
              console.error('Error updating rentee associated properties:', updateError);
            } else {
              console.log(`Property ${property.id} added to rentee's associated properties`);
            }
          } else {
            console.log('Property already associated with this rentee');
          }
        }
      }
      
      // Show success message and refresh data
      toast.success('Agreement has been marked as signed!');
      fetchAgreementData();
      
    } catch (error) {
      console.error('Error signing agreement:', error);
      toast.error('Failed to sign agreement: ' + error.message);
    } finally {
      setLoading(false);
      setShowSignConfirm(false);
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        <div className="flex justify-start">
          <button
            onClick={() => navigate('/dashboard/agreements')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Agreements
          </button>
        </div>
      </div>
    );
  }
  
  if (!agreement) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-700 p-4 rounded">
          <h2 className="text-lg font-medium mb-2">Agreement Not Found</h2>
          <p>The requested agreement could not be found.</p>
          <button
            onClick={() => navigate('/dashboard/agreements')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Agreements
          </button>
        </div>
      </div>
    );
  }
  
  // Determine status color
  const getStatusColor = () => {
    switch (agreement.status) {
      case 'signed':
        return 'bg-green-100 text-green-800';
      case 'pending_signature':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-blue-100 text-blue-800';
      case 'review':
        return 'bg-indigo-100 text-indigo-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'terminated':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Format status text
  const formatStatus = (status) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with agreement title and status */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {agreement.title || `Agreement #${agreement.id.substring(0, 8)}`}
          </h1>
          <div className="mt-2">
            <span className="text-gray-600">
              {property && rentee && `${property.name} - ${rentee.name}`}
              {property && !rentee && property.name}
              {!property && rentee && rentee.name}
            </span>
          </div>
        </div>

        {/* Use our new SignatureProgressTracker in compact mode */}
        <div className="mt-4 md:mt-0">
          <SignatureProgressTracker 
            status={agreement.signature_status || agreement.status}
            signatories={signatories}
            compact={true}
          />
        </div>
      </div>

      {/* Signature Status Details panel */}
      <div className="mb-8">
        <SignatureProgressTracker 
          status={agreement.signature_status || agreement.status}
          signatories={signatories}
        />
      </div>
      
      {/* Actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        <div className="flex-1"></div>
        <div className="flex flex-wrap gap-3">
          {/* Show sign button only if agreement is not signed */}
          {agreement.status !== 'signed' && agreement.status !== 'completed' && (
            <button
              onClick={() => setShowSignConfirm(true)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Mark as Signed
            </button>
          )}
          
          {/* Only show Edit button if not signed */}
          {agreement.status !== 'signed' && agreement.status !== 'completed' && (
            <Link
              to={`/dashboard/agreements/${id}/edit`}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Edit
            </Link>
          )}
          
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Delete
          </button>
        </div>
      </div>
      
      {/* Agreement details */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column - Details */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Agreement Details</h2>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Created Date</p>
                <p className="font-medium">{formatDate(agreement.createdat)}</p>
              </div>
              
              {agreement.signeddate && (
                <div>
                  <p className="text-sm text-gray-500">Signed Date</p>
                  <p className="font-medium">{formatDate(agreement.signeddate)}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-gray-500">Language</p>
                <p className="font-medium">{agreement.language}</p>
              </div>
              
              {template && (
                <div>
                  <p className="text-sm text-gray-500">Template</p>
                  <p className="font-medium">
                    {template.name || `Template #${template.id.substring(0, 8)}`} (v{template.version})
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Property Information */}
          {property && (
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Property</h2>
                <Link
                  to={`/dashboard/properties/${property.id}`}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  View Property
                </Link>
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{property.name}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Address</p>
                  <p className="font-medium">{property.address}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Unit Configuration</p>
                  <p className="font-medium">{property.unitconfiguration}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Rentee Information */}
          {rentee && (
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Rentee</h2>
                <Link
                  to={`/dashboard/rentees/${rentee.id}`}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  View Rentee
                </Link>
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{rentee.name}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{rentee.contact_details?.email || 'N/A'}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{rentee.contact_details?.phone || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Right column - Agreement Document or Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Agreement Document</h2>
              {agreement.pdfurl && (
                <div className="flex space-x-2">
                  <a
                    href={agreement.pdfurl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-indigo-600 text-white hover:bg-indigo-700 rounded text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View Document
                  </a>
                </div>
              )}
            </div>
            
            {/* Document View - Show iframe if PDF is available, otherwise show content */}
            {agreement.pdfurl ? (
              <div className="relative h-[600px] w-full">
                <iframe
                  src={agreement.pdfurl}
                  className="absolute top-0 left-0 w-full h-full border-0"
                  title="Agreement Document"
                />
              </div>
            ) : agreement.documenturl ? (
              <div className="relative h-[600px] w-full">
                <iframe
                  src={agreement.documenturl}
                  className="absolute top-0 left-0 w-full h-full border-0"
                  title="Agreement Document"
                />
              </div>
            ) : (
              <div className="prose max-w-none">
                {agreement.processedcontent ? (
                  <div dangerouslySetInnerHTML={{ __html: agreement.processedcontent }} />
                ) : agreement.content ? (
                  <div dangerouslySetInnerHTML={{ __html: agreement.content }} />
                ) : agreement.templatecontent ? (
                  <div dangerouslySetInnerHTML={{ __html: agreement.templatecontent }} />
                ) : (
                  <p className="text-gray-500">No document or content available</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this agreement? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Sign Confirmation Modal */}
      {showSignConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Signing</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to mark this agreement as signed? This will:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                <li>Update the agreement status to signed</li>
                <li>Mark the property as available</li>
                <li>Create tenant-property assignment</li>
                <li>Lock the agreement for further editing</li>
              </ul>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowSignConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSignAgreement}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Mark as Signed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgreementDetails; 