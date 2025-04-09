import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '../../utils/helpers';

const InvoiceCard = ({ invoice, property, rentee }) => {
  const { id, status, createdat, totalamount, billingperiod, paymentdate } = invoice;
  
  // Determine status color
  const getStatusColor = () => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'verification_pending':
        return 'bg-blue-100 text-blue-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'rejected':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Invoice #{id.substring(0, 8)}
          </h3>
          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor()}`}>
            {status.replace('_', ' ')}
          </span>
        </div>
        
        <div className="space-y-2 mb-4">
          {property && (
            <p className="text-sm">
              <span className="text-gray-500">Property: </span>
              <span className="text-gray-900">{property.name}</span>
            </p>
          )}
          
          {rentee && (
            <p className="text-sm">
              <span className="text-gray-500">Rentee: </span>
              <span className="text-gray-900">{rentee.name}</span>
            </p>
          )}
          
          <p className="text-sm">
            <span className="text-gray-500">Billing Period: </span>
            <span className="text-gray-900">{billingperiod}</span>
          </p>
          
          <p className="text-sm">
            <span className="text-gray-500">Date: </span>
            <span className="text-gray-900">{formatDate(createdat)}</span>
          </p>
          
          {paymentdate && (
            <p className="text-sm">
              <span className="text-gray-500">Paid on: </span>
              <span className="text-gray-900">{formatDate(paymentdate)}</span>
            </p>
          )}
          
          <p className="text-sm font-medium">
            <span className="text-gray-500">Total: </span>
            <span className="text-gray-900">{formatCurrency(totalamount)}</span>
          </p>
        </div>
        
        <div className="flex justify-between items-center">
          <Link 
            to={`/dashboard/invoices/${id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View Details
          </Link>
          
          {status === 'pending' && (
            <Link 
              to={`/dashboard/invoices/${id}/payment`}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Record Payment
            </Link>
          )}
          
          {status === 'verification_pending' && (
            <Link 
              to={`/dashboard/invoices/${id}/verify`}
              className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
            >
              Verify Payment
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceCard; 