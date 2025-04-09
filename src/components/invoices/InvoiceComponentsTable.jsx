import { formatCurrency } from '../../utils/helpers';

const InvoiceComponentsTable = ({ components }) => {
  // Convert components object to array for easier rendering
  const componentItems = Object.entries(components || {}).map(([key, value]) => ({
    name: key,
    amount: value,
  }));
  
  // Calculate total
  const total = componentItems.reduce((sum, item) => sum + item.amount, 0);
  
  // Format component name for display
  const formatComponentName = (name) => {
    return name
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
      .replace(/_/g, ' '); // Replace underscores with spaces
  };
  
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Item
            </th>
            <th scope="col" className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {componentItems.map((item) => (
            <tr key={item.name}>
              <td className="px-3 sm:px-6 py-2 sm:py-4 text-sm text-gray-900 break-words">
                {formatComponentName(item.name)}
              </td>
              <td className="px-3 sm:px-6 py-2 sm:py-4 text-sm text-gray-900 text-right">
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50">
            <td className="px-3 sm:px-6 py-2 sm:py-4 text-sm font-medium text-gray-900">
              Total
            </td>
            <td className="px-3 sm:px-6 py-2 sm:py-4 text-sm font-medium text-gray-900 text-right">
              {formatCurrency(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default InvoiceComponentsTable; 