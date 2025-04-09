import { useState, useEffect } from 'react';

const COMMON_AMENITIES = [
  'Air Conditioning',
  'Balcony',
  'Elevator',
  'Gym',
  'Parking',
  'Pool',
  'Security',
  'WiFi',
  'Laundry',
  'Garden',
  'Playground',
  'CCTV',
  'Backup Generator',
  'Water Tank',
];

const PropertyAmenities = ({ selectedAmenities = [], onChange }) => {
  // Initialize with the selectedAmenities prop
  const [amenities, setAmenities] = useState(selectedAmenities || []);
  const [customAmenity, setCustomAmenity] = useState('');
  
  // Update local state when selectedAmenities prop changes
  useEffect(() => {
    // Only update if the arrays are different
    const areArraysEqual = (arr1, arr2) => {
      if (arr1?.length !== arr2?.length) {
        return false;
      }
      return arr1?.every((item, index) => item === arr2[index]);
    };

    if (!areArraysEqual(selectedAmenities, amenities)) {
      setAmenities(selectedAmenities || []);
    }
  }, [selectedAmenities]);
  
  // Toggle amenity selection
  const toggleAmenity = (amenity) => {
    const updatedAmenities = amenities.includes(amenity)
      ? amenities.filter(a => a !== amenity)
      : [...amenities, amenity];
    
    setAmenities(updatedAmenities);
    if (onChange) {
      onChange(updatedAmenities);
    }
  };
  
  // Add custom amenity
  const handleAddCustomAmenity = () => {
    if (customAmenity.trim() && !amenities.includes(customAmenity.trim())) {
      const updatedAmenities = [...amenities, customAmenity.trim()];
      setAmenities(updatedAmenities);
      if (onChange) {
        onChange(updatedAmenities);
      }
      setCustomAmenity('');
    }
  };
  
  // Handle custom amenity input
  const handleCustomAmenityChange = (e) => {
    setCustomAmenity(e.target.value);
  };
  
  // Handle custom amenity input keypress
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomAmenity();
    }
  };
  
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {COMMON_AMENITIES.map(amenity => (
          <div key={amenity} className="flex items-center">
            <input
              type="checkbox"
              id={`amenity-${amenity}`}
              checked={amenities.includes(amenity)}
              onChange={() => toggleAmenity(amenity)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor={`amenity-${amenity}`} className="ml-2 block text-sm text-gray-700">
              {amenity}
            </label>
          </div>
        ))}
      </div>
      
      {/* Custom amenity input */}
      <div className="flex mt-2">
        <input
          type="text"
          value={customAmenity}
          onChange={handleCustomAmenityChange}
          onKeyPress={handleKeyPress}
          placeholder="Add custom amenity"
          className="flex-grow rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleAddCustomAmenity}
          className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700"
        >
          Add
        </button>
      </div>
      
      {/* Selected custom amenities */}
      {amenities.filter(a => !COMMON_AMENITIES.includes(a)).length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Custom Amenities:</p>
          <div className="flex flex-wrap gap-2">
            {amenities.filter(a => !COMMON_AMENITIES.includes(a)).map(amenity => (
              <span 
                key={amenity} 
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {amenity}
                <button
                  type="button"
                  onClick={() => toggleAmenity(amenity)}
                  className="ml-1.5 h-4 w-4 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-600 focus:outline-none"
                >
                  <span className="sr-only">Remove</span>
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyAmenities; 