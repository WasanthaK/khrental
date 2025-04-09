import React from 'react';
import PropTypes from 'prop-types';

/**
 * A responsive table component that transforms into cards on mobile
 * 
 * @param {Object} props
 * @param {Array} props.columns - Array of column definitions with { id, header, accessor, className }
 * @param {Array} props.data - Array of data objects
 * @param {Function} props.onRowClick - Function to call when a row is clicked (optional)
 * @param {Function} props.keyExtractor - Function to extract a unique key from a row (defaults to index)
 * @param {React.ReactNode} props.emptyState - Component to show when there's no data
 * @param {string} props.className - Additional class for the table container
 */
const ResponsiveTable = ({
  columns,
  data,
  onRowClick,
  keyExtractor = (_, index) => index,
  emptyState,
  className = ''
}) => {
  if (!data || data.length === 0) {
    return emptyState || (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop view - regular table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id || column.accessor}
                  scope="col"
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.className || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row, i) => (
              <tr 
                key={keyExtractor(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
              >
                {columns.map((column) => (
                  <td
                    key={`${keyExtractor(row, i)}-${column.id || column.accessor}`}
                    className={`px-6 py-4 text-sm text-gray-500 ${column.className || ''}`}
                  >
                    {typeof column.accessor === 'function'
                      ? column.accessor(row)
                      : row[column.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view - card format */}
      <div className="md:hidden space-y-4">
        {data.map((row, i) => (
          <div
            key={keyExtractor(row, i)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm ${
              onRowClick ? 'cursor-pointer active:bg-gray-50' : ''
            }`}
          >
            <div className="p-4 space-y-3">
              {columns.map((column) => (
                <div key={`${keyExtractor(row, i)}-${column.id || column.accessor}`} className="flex py-1">
                  <div className="text-xs font-medium text-gray-500 uppercase w-1/3">
                    {column.header}
                  </div>
                  <div className="text-sm text-gray-900 w-2/3">
                    {typeof column.accessor === 'function'
                      ? column.accessor(row)
                      : row[column.accessor]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Badge component for status indicators in tables
export const StatusBadge = ({ status, color = 'gray' }) => {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-blue-100 text-blue-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    purple: 'bg-purple-100 text-purple-800',
    pink: 'bg-pink-100 text-pink-800'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses[color]}`}>
      {status}
    </span>
  );
};

// Card formatter for mobile view transformations
export const mobileCardFormatter = (header, value) => (
  <div className="flex justify-between py-2 border-b border-gray-100 last:border-b-0">
    <span className="font-medium text-gray-500">{header}</span>
    <span>{value}</span>
  </div>
);

ResponsiveTable.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      header: PropTypes.node.isRequired,
      accessor: PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
      className: PropTypes.string
    })
  ).isRequired,
  data: PropTypes.array.isRequired,
  onRowClick: PropTypes.func,
  keyExtractor: PropTypes.func,
  emptyState: PropTypes.node,
  className: PropTypes.string
};

StatusBadge.propTypes = {
  status: PropTypes.node.isRequired,
  color: PropTypes.oneOf(['gray', 'green', 'red', 'yellow', 'blue', 'indigo', 'purple', 'pink'])
};

export default ResponsiveTable; 