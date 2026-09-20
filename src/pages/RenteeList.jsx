import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { mapAppUserToRentee } from '../services/appUserService';
import { fetchRenteeDirectory } from '../services/renteeDirectoryService';
import RenteeCard from '../components/rentees/RenteeCard';

const RenteeList = () => {
  const [rentees, setRentees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  const fetchRentees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load the active tenant-scoped directory directly from the server.
      // This must not silently collapse to an empty list when a valid session
      // is still being restored, and it tolerates older rows whose role is
      // `rentee` even if user_type was stored inconsistently.
      const data = await fetchRenteeDirectory();
      const transformedData = (data || []).map(mapAppUserToRentee);
      setRentees(transformedData);
    } catch (error) {
      console.error('Error fetching tenants:', error.message);
      setError(error.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRentees();
  }, [fetchRentees]);

  const filteredRentees = rentees.filter((rentee) => {
    const matchesSearch =
      rentee.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rentee.contactDetails?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rentee.contactDetails?.phone?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filter === 'all') return matchesSearch;
    if (filter === 'verified' && rentee.idCopyURL) return matchesSearch;
    if (filter === 'unverified' && !rentee.idCopyURL) return matchesSearch;
    if (filter === 'invited' && rentee.invited && !rentee.authId) return matchesSearch;
    if (filter === 'registered' && rentee.authId) return matchesSearch;
    if (filter === 'not_invited' && !rentee.invited) return matchesSearch;

    return false;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <Link
          to="/dashboard/rentees/new"
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
        >
          Add New Tenant
        </Link>
      </div>

      <div className="mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search tenants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Tenants</option>
              <option value="verified">ID Verified</option>
              <option value="unverified">ID Pending</option>
              <option value="invited">Invited</option>
              <option value="registered">Registered</option>
              <option value="not_invited">Not Invited</option>
            </select>
          </div>
          <div>
            <button
              onClick={fetchRentees}
              className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      ) : filteredRentees.length === 0 ? (
        <div className="bg-gray-100 p-6 rounded-lg text-center">
          <p className="text-gray-600">No tenants found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRentees.map((rentee) => (
            <RenteeCard key={rentee.id} rentee={rentee} onStatusChange={fetchRentees} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RenteeList;
