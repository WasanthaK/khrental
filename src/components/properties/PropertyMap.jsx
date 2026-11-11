import React from 'react';

const PropertyMap = ({ address, coordinates, onCoordinatesChange, readOnly = false }) => {
  const effectiveCoordinates=coordinates;
  const hasCoordinates=Number.isFinite(coordinates?.lat)&&Number.isFinite(coordinates?.lng);
  const mapUrl=hasCoordinates
    ? `https://maps.google.com/maps?q=${coordinates.lat},${coordinates.lng}&z=15&output=embed`
    : address ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed` : '';

  // Handle manual coordinate input
  const handleCoordinateChange = (e) => {
    const { name, value } = e.target;
    const newCoordinates = { 
      ...(effectiveCoordinates || {}), 
      [name]: value === '' ? null : Number(value)
    };
    if(typeof onCoordinatesChange==='function'){onCoordinatesChange(newCoordinates);}
  };

  // If read-only, just display the map
  if (readOnly) {
    return (
      <div className="space-y-2">
        {mapUrl ? (
          <div className="border border-gray-300 rounded-lg overflow-hidden h-64">
            <iframe
              title="Property Location"
              src={mapUrl}
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
              allowFullScreen=""
              aria-hidden="false"
              tabIndex="0"
            ></iframe>
          </div>
        ) : (
          <div className="border border-gray-300 rounded-lg flex items-center justify-center h-64 bg-gray-100">
            <p className="text-gray-500">No location information available</p>
          </div>
        )}
        
        {effectiveCoordinates && Number.isFinite(effectiveCoordinates.lat) && Number.isFinite(effectiveCoordinates.lng) && (
          <p className="text-sm text-gray-600">
            Coordinates: {effectiveCoordinates.lat.toFixed(6)}, {effectiveCoordinates.lng.toFixed(6)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Map Display */}
      {mapUrl ? (
        <div className="border border-gray-300 rounded-lg overflow-hidden h-64">
          <iframe
            title="Property Location"
            src={mapUrl}
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0 }}
            allowFullScreen=""
            aria-hidden="false"
            tabIndex="0"
          ></iframe>
        </div>
      ) : (
        <div className="border border-gray-300 rounded-lg flex items-center justify-center h-64 bg-gray-100">
          <p className="text-gray-500">Enter address or coordinates to display map</p>
        </div>
      )}
      
      {/* Manual Coordinate Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="lat" className="block text-sm font-medium text-gray-700 mb-1">
            Latitude
          </label>
          <input
            type="number"
            id="lat"
            name="lat"
            value={effectiveCoordinates?.lat ?? ''}
            min={-90}
            max={90}
            onChange={handleCoordinateChange}
            step="0.000001"
            placeholder="e.g., 6.9271"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="lng" className="block text-sm font-medium text-gray-700 mb-1">
            Longitude
          </label>
          <input
            type="number"
            id="lng"
            name="lng"
            value={effectiveCoordinates?.lng ?? ''}
            min={-180}
            max={180}
            onChange={handleCoordinateChange}
            step="0.000001"
            placeholder="e.g., 79.8612"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <p className="text-sm text-gray-500">
        Coordinates are optional. Enter both latitude and longitude from a verified map location. The address preview does not save coordinates.
      </p>
    </div>
  );
};

export default PropertyMap;
