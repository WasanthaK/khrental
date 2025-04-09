import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, deleteData } from '../services/supabaseClient';
import { formatDate } from '../utils/helpers';

const CameraDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State
  const [camera, setCamera] = useState(null);
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Fetch camera data
  useEffect(() => {
    const fetchCameraData = async () => {
      try {
        setLoading(true);
        
        // Fetch camera data
        const { data: cameraData, error: cameraError } = await fetchData('cameras', {
          filters: [{ column: 'id', operator: 'eq', value: id }]
        });
        
        if (cameraError) {
          throw cameraError;
        }
        
        if (!cameraData || cameraData.length === 0) {
          throw new Error('Camera not found');
        }
        
        const cameraDetails = cameraData[0];
        setCamera(cameraDetails);
        
        // Fetch property data
        if (cameraDetails.propertyid) {
          const { data: propertyData, error: propertyError } = await fetchData({
            table: 'properties',
            filters: [{ column: 'id', operator: 'eq', value: cameraDetails.propertyid }]
          });
          
          if (propertyError) {
            throw propertyError;
          }
          
          if (propertyData && propertyData.length > 0) {
            setProperty(propertyData[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching camera data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCameraData();
  }, [id]);
  
  // Handle camera deletion
  const handleDeleteCamera = async () => {
    try {
      setLoading(true);
      
      const { error: deleteError } = await deleteData('cameras', id);
      
      if (deleteError) {
        throw deleteError;
      }
      
      // Navigate back to camera list
      navigate('/dashboard/cameras');
      
    } catch (error) {
      console.error('Error deleting camera:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
    }
  };
  
  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading camera details...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }
  
  if (!camera) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Not Found!</strong>
        <span className="block sm:inline"> Camera not found.</span>
      </div>
    );
  }
  
  return (
    <div className="px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-semibold">Camera Details</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/dashboard/cameras/edit/${id}`}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
      
      {/* Camera Details */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Basic Information */}
        <div className="p-4 sm:p-6 border-b">
          <h2 className="text-lg font-medium mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Location</p>
              <p className="font-medium break-words">{camera.locationdescription}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Property</p>
              <p className="font-medium break-words">{property?.name || 'Unknown Property'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Camera Type</p>
              <p className="font-medium">{camera.cameratype || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(camera.status)}`}>
                {camera.status || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Installation Details */}
        <div className="p-4 sm:p-6 border-b">
          <h2 className="text-lg font-medium mb-3">Installation Details</h2>
          <p className="whitespace-pre-wrap text-sm">
            {camera.installationdetails || 'No installation details provided.'}
          </p>
        </div>
        
        {/* Data Package Information */}
        <div className="p-4 sm:p-6 border-b">
          <h2 className="text-lg font-medium mb-3">Data Package Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Phone Number</p>
              <p className="font-medium">
                {camera.datapackageinfo?.phoneNumber || 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Renewal Date</p>
              <p className="font-medium">
                {camera.datapackageinfo?.renewalDate 
                  ? formatDate(camera.datapackageinfo.renewalDate)
                  : 'Not specified'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-gray-500">Plan Details</p>
              <p className="font-medium whitespace-pre-wrap text-sm">
                {camera.datapackageinfo?.planDetails || 'No plan details provided.'}
              </p>
            </div>
          </div>
        </div>
        
        {/* Metadata */}
        <div className="p-4 sm:p-6 bg-gray-50">
          <h2 className="text-lg font-medium mb-3">System Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Created At</p>
              <p className="font-medium">{camera.createdat ? formatDate(camera.createdat) : 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="font-medium">{camera.updatedat ? formatDate(camera.updatedat) : 'Unknown'}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Back Button */}
      <div className="mt-4 sm:mt-6">
        <button
          onClick={() => navigate('/dashboard/cameras')}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Back to Camera List
        </button>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-3">Confirm Deletion</h3>
            <p className="mb-4 text-sm">
              Are you sure you want to delete this camera? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCamera}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraDetails; 