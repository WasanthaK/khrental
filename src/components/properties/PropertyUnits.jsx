import { useState, useEffect } from 'react';
import { fetchData, deleteData } from '../../services/supabaseClient';
import PropertyUnitForm from './PropertyUnitForm';

const PropertyUnits = ({ propertyId, propertyType }) => {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  
  // Only show units section for apartment type properties
  const isApartmentComplex = propertyType === 'apartment';
  
  // Fetch units for this property
  useEffect(() => {
    const fetchUnits = async () => {
      if (!propertyId || !isApartmentComplex) {
        return;
      }
      try {
        setLoading(true);
        const { data, error } = await fetchData('property_units', {
          filters: [{ column: 'propertyid', operator: 'eq', value: propertyId }],
          order: { column: 'unitnumber', ascending: true }
        });
        
        if (error) {
          throw error;
        }
        
        setUnits(data || []);
      } catch (error) {
        console.error('Error fetching property units:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUnits();
  }, [propertyId, isApartmentComplex]);
  
  // Handle unit save (add or update)
  const handleUnitSave = (savedUnit) => {
    if (editingUnit) {
      // Update existing unit in the list
      setUnits(prev => prev.map(unit => 
        unit.id === editingUnit.id ? savedUnit : unit
      ));
      setEditingUnit(null);
    } else {
      // Add new unit to the list
      setUnits(prev => [...prev, savedUnit]);
      setShowAddForm(false);
    }
  };
  
  // Handle unit delete
  const handleDeleteUnit = async (unitId) => {
    try {
      const { error } = await deleteData('property_units', unitId);
      
      if (error) {
        throw error;
      }
      
      // Remove unit from the list
      setUnits(prev => prev.filter(unit => unit.id !== unitId));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting unit:', error.message);
      setError(error.message);
    }
  };
  
  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'occupied':
        return 'bg-blue-100 text-blue-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      case 'reserved':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  if (!isApartmentComplex) {
    return null;
  }
  
  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Property Units</h2>
        {!showAddForm && !editingUnit && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add Unit
          </button>
        )}
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}
      
      {loading ? (
        <div className="text-center py-4">Loading units...</div>
      ) : (
        <>
          {/* Add/Edit Form */}
          {(showAddForm || editingUnit) && (
            <div className="mb-6">
              <PropertyUnitForm
                propertyId={propertyId}
                unit={editingUnit}
                onSave={handleUnitSave}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingUnit(null);
                }}
              />
            </div>
          )}
          
          {/* Units List */}
          {units.length > 0 ? (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {units.map(unit => (
                  <li key={unit.id}>
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <p className="text-lg font-medium text-blue-600 truncate">
                            Unit {unit.unitnumber}
                          </p>
                          <span className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(unit.status)}`}>
                            {unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setEditingUnit(unit)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(unit.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 sm:flex sm:justify-between">
                        <div className="sm:flex">
                          {unit.floor && (
                            <p className="flex items-center text-sm text-gray-500 mr-6">
                              Floor: {unit.floor}
                            </p>
                          )}
                          {unit.bedrooms && (
                            <p className="flex items-center text-sm text-gray-500 mr-6">
                              {unit.bedrooms} {unit.bedrooms === 1 ? 'Bedroom' : 'Bedrooms'}
                            </p>
                          )}
                          {unit.bathrooms && (
                            <p className="flex items-center text-sm text-gray-500 mr-6">
                              {unit.bathrooms} {unit.bathrooms === 1 ? 'Bathroom' : 'Bathrooms'}
                            </p>
                          )}
                          {unit.squarefeet && (
                            <p className="flex items-center text-sm text-gray-500">
                              {unit.squarefeet} sq ft
                            </p>
                          )}
                        </div>
                        {unit.rentalvalue && (
                          <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                            Rental Value: Rs. {unit.rentalvalue.toLocaleString()}
                          </p>
                        )}
                      </div>
                      {unit.description && (
                        <p className="mt-2 text-sm text-gray-500">
                          {unit.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-center py-4 bg-gray-50 rounded-md">
              No units added yet. Click "Add Unit" to create your first unit.
            </div>
          )}
        </>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-4">Confirm Delete</h3>
            <p className="mb-4">Are you sure you want to delete this unit? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteUnit(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
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

export default PropertyUnits; 