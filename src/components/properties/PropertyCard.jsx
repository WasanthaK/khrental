import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/helpers';
import { DEFAULT_IMAGE } from '../../utils/constants';

const PropertyCard = ({ property }) => {
  const { 
    id, 
    name, 
    address, 
    images, 
    rentalvalues, 
    unitconfiguration, 
    description,
    amenities = [],
    propertytype,
    status
  } = property;
  
  // Use the first image or a placeholder
  const imageUrl = images && images.length > 0 
    ? images[0] 
    : DEFAULT_IMAGE;

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'occupied':
        return 'bg-red-100 text-red-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Display only the first 3 amenities
  const displayedAmenities = amenities.slice(0, 3);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="h-48 overflow-hidden relative">
        <img 
          src={imageUrl} 
          alt={name} 
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = DEFAULT_IMAGE;
          }}
        />
        {status && (
          <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(status)}`}>
            {status}
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{name}</h3>
        <p className="text-sm text-gray-600 mb-2">{address}</p>
        
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-900">
            {formatCurrency(rentalvalues?.rent || 0)}/month
          </span>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {propertytype || unitconfiguration}
          </span>
        </div>
        
        {displayedAmenities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {displayedAmenities.map((amenity, index) => (
              <span key={index} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                {amenity}
              </span>
            ))}
            {amenities.length > 3 && (
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                +{amenities.length - 3} more
              </span>
            )}
          </div>
        )}
        
        <p className="text-sm text-gray-700 mb-3 line-clamp-2">
          {description || 'No description available.'}
        </p>
        
        <Link 
          to={`/dashboard/properties/${id}`}
          className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
        >
          View Details
        </Link>
      </div>
    </div>
  );
};

export default PropertyCard; 