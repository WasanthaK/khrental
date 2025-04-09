import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchData, deleteData } from '../services/supabaseClient';
import { formatDate } from '../utils/helpers';

const CameraList = () => {
  const [cameras, setCameras] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  // Fetch cameras and properties
  useEffect(() => {
    const fetchCamerasAndProperties = async () => {
      try {
        setLoading(true);
        
        // Fetch cameras
        const { data: camerasData, error: camerasError } = await fetchData('cameras', {
          order: { column: 'createdat', ascending: false }
        });
        
        if (camerasError) {
          throw camerasError;
        }
        
        // Fetch properties for joining
        const { data: propertiesData, error: propertiesError } = await fetchData('properties');
        
        if (propertiesError) {
          throw propertiesError;
        }
        
        // Map properties by ID for easy lookup
        const propertiesMap = {};
        propertiesData.forEach(property => {
          propertiesMap[property.id] = property;
        });
        
        setProperties(propertiesMap);
        setCameras(camerasData || []);
      } catch (error) {
        console.error('Error fetching cameras:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCamerasAndProperties();
  }, []);

  // Handle camera deletion
  const handleDeleteCamera = async (cameraId) => {
    try {
      const { error } = await deleteData('cameras', cameraId);
      
      if (error) {
        throw error;
      }
      
      // Remove the camera from state
      setCameras(cameras.filter(camera => camera.id !== cameraId));
      setDeleteConfirmation(null);
    } catch (error) {
      console.error('Error deleting camera:', error.message);
      setError(`Failed to delete camera: ${error.message}`);
    }
  };

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading cameras...</div>
      </div>
    );
  }

  // Render camera card for mobile view
  const renderCameraCard = (camera) => (
    <div key={camera.id} className="bg-white rounded-lg shadow-md p-4 mb-4">
      <div className="flex flex-col">
        <div className="mb-3">
          <h3 className="font-medium text-gray-900">{camera.locationdescription}</h3>
          <p className="text-sm text-gray-600">Property: {properties[camera.propertyid]?.name || 'Unknown'}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="text-xs text-gray-500">Type</p>
            <p className="text-sm">{camera.cameratype}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(camera.status)}`}>
              {camera.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Data Package</p>
            <p className="text-sm">{camera.datapackageinfo?.phoneNumber || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Installed</p>
            <p className="text-sm">{formatDate(camera.createdat)}</p>
          </div>
        </div>
        
        <div className="flex justify-between mt-2 pt-2 border-t border-gray-100">
          <Link
            to={`/dashboard/cameras/${camera.id}`}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            View
          </Link>
          <Link
            to={`/dashboard/cameras/edit/${camera.id}`}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Edit
          </Link>
          <button
            onClick={() => setDeleteConfirmation(camera.id)}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-semibold">Surveillance Cameras</h1>
        <Link
          to="/dashboard/cameras/new"
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add New Camera
        </Link>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6 text-sm" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      
      {cameras.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-500 mb-4">No cameras found.</p>
          <Link
            to="/dashboard/cameras/new"
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add Your First Camera
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile view */}
          <div className="block sm:hidden">
            {cameras.map(camera => renderCameraCard(camera))}
          </div>
          
          {/* Desktop view */}
          <div className="hidden sm:block bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Package
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Installed
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cameras.map((camera) => (
                    <tr key={camera.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {camera.locationdescription}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {properties[camera.propertyid]?.name || 'Unknown Property'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {camera.cameratype}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(camera.status)}`}>
                          {camera.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div>
                          {camera.datapackageinfo?.phoneNumber || 'N/A'}
                        </div>
                        {camera.datapackageinfo?.renewalDate && (
                          <div className="text-xs text-gray-400">
                            Renewal: {formatDate(camera.datapackageinfo.renewalDate)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(camera.createdat)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/dashboard/cameras/${camera.id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </Link>
                          <Link
                            to={`/dashboard/cameras/edit/${camera.id}`}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => setDeleteConfirmation(camera.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-3 sm:mb-4">Confirm Deletion</h3>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to delete this camera? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteCamera(deleteConfirmation)}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
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

export default CameraList; 