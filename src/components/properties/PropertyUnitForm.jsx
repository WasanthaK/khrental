import { useState } from 'react';
import { insertData, updateData } from '../../services/supabaseClient';
import FormInput from '../ui/FormInput';
import FormTextarea from '../ui/FormTextarea';

const PropertyUnitForm = ({ 
  propertyId, 
  unit = null, 
  onSave, 
  onCancel 
}) => {
  const isEditMode = !!unit;
  
  // Initial form data
  const initialFormData = {
    unitnumber: unit?.unitnumber || '',
    floor: unit?.floor || '',
    bedrooms: unit?.bedrooms || '',
    bathrooms: unit?.bathrooms || '',
    bank_name: unit?.bank_name || '',
    bank_branch: unit?.bank_branch || '',
    bank_account_number: unit?.bank_account_number || '',
    rentalvalues: unit?.rentalvalues || { rent: '', deposit: '' },
    squarefeet: unit?.squarefeet || '',
    status: unit?.status || 'available',
    description: unit?.description || ''
  };
  
  // Form state
  const [formData, setFormData] = useState(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle rental values change
  const handleRentalValueChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      rentalvalues: {
        ...prev.rentalvalues,
        [name.replace('rentalvalues_', '')]: value
      }
    }));
  };
  
  // Handle status change
  const handleStatusChange = (e) => {
    setFormData(prev => ({
      ...prev,
      status: e.target.value
    }));
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate required fields
      if (!formData.unitnumber) {
        throw new Error('Unit number is required');
      }
      
      // Process form data
      const processedData = {
        ...formData,
        propertyid: propertyId,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : null,
        bathrooms: formData.bathrooms ? parseInt(formData.bathrooms, 10) : null,
        rentalvalues: {
          rent: formData.rentalvalues.rent ? parseFloat(formData.rentalvalues.rent) : 0,
          deposit: formData.rentalvalues.deposit ? parseFloat(formData.rentalvalues.deposit) : 0
        },
        squarefeet: formData.squarefeet ? parseFloat(formData.squarefeet) : null,
      };
      
      let result;
      
      if (isEditMode) {
        result = await updateData('property_units', unit.id, processedData);
      } else {
        result = await insertData('property_units', processedData);
      }
      
      if (result.error) {
        throw result.error;
      }
      
      // Call the onSave callback with the saved unit
      if (onSave) {
        onSave(result.data?.[0] || processedData);
      }
      
    } catch (error) {
      console.error('Error saving unit:', error.message);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-medium mb-4">
        {isEditMode ? 'Edit Unit' : 'Add New Unit'}
      </h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            label="Unit Number"
            id="unitnumber"
            name="unitnumber"
            value={formData.unitnumber}
            onChange={handleInputChange}
            placeholder="e.g., A1, 101"
            required
          />
          
          <FormInput
            label="Floor"
            id="floor"
            name="floor"
            value={formData.floor}
            onChange={handleInputChange}
            placeholder="e.g., Ground, 1st"
          />
          
          <FormInput
            label="Bedrooms"
            id="bedrooms"
            name="bedrooms"
            type="number"
            value={formData.bedrooms}
            onChange={handleInputChange}
            placeholder="e.g., 2"
          />
          
          <FormInput
            label="Bathrooms"
            id="bathrooms"
            name="bathrooms"
            type="number"
            value={formData.bathrooms}
            onChange={handleInputChange}
            placeholder="e.g., 1"
          />
          
          <FormInput
            label="Rent Amount"
            id="rentalvalues_rent"
            name="rentalvalues_rent"
            type="number"
            value={formData.rentalvalues.rent}
            onChange={handleRentalValueChange}
            placeholder="e.g., 50000"
          />
          
          <FormInput
            label="Deposit Amount"
            id="rentalvalues_deposit"
            name="rentalvalues_deposit"
            type="number"
            value={formData.rentalvalues.deposit}
            onChange={handleRentalValueChange}
            placeholder="e.g., 100000"
          />
          
          <FormInput
            label="Square Feet"
            id="squarefeet"
            name="squarefeet"
            type="number"
            value={formData.squarefeet}
            onChange={handleInputChange}
            placeholder="e.g., 800"
          />
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleStatusChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Under Maintenance</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>

          {/* Banking Details Section */}
          <div className="col-span-2">
            <h3 className="text-md font-medium mb-4 mt-4">Banking Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                label="Bank Name"
                id="bank_name"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleInputChange}
                placeholder="e.g., Commercial Bank"
                required
              />
              
              <FormInput
                label="Bank Branch"
                id="bank_branch"
                name="bank_branch"
                value={formData.bank_branch}
                onChange={handleInputChange}
                placeholder="e.g., Athurugiriya"
                required
              />
              
              <FormInput
                label="Account Number"
                id="bank_account_number"
                name="bank_account_number"
                value={formData.bank_account_number}
                onChange={handleInputChange}
                placeholder="e.g., 1234567890"
                required
              />
            </div>
          </div>
        </div>
        
        <FormTextarea
          label="Description"
          id="description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          placeholder="Additional details about the unit"
          rows={3}
        />
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : isEditMode ? 'Update Unit' : 'Add Unit'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PropertyUnitForm; 