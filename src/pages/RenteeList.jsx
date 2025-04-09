import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import RenteeCard from '../components/rentees/RenteeCard';
import { toast } from 'react-toastify';

const RenteeList = () => {
  const [rentees, setRentees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  
  // Function to fetch rentees from app_users table
  const fetchRentees = useCallback(async () => {
    try {
      console.log('Fetching rentees from app_users table...');
      setLoading(true);
      setError(null);
      
      // Fetch rentees from app_users table
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('user_type', 'rentee');
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Fetched data from app_users:', data);
      
      // Transform the data to the expected format
      const transformedData = (data || []).map(rentee => ({
        id: rentee.id,
        name: rentee.name,
        contactDetails: rentee.contact_details || {},
        idCopyURL: rentee.id_copy_url,
        registrationDate: rentee.created_at,
        associatedPropertyIds: rentee.associated_property_ids || [],
        invited: rentee.invited,
        authId: rentee.auth_id,
        createdAt: rentee.created_at || new Date().toISOString(),
        updatedAt: rentee.updated_at || rentee.created_at || new Date().toISOString()
      }));
      
      console.log('Transformed data from app_users:', transformedData);
      setRentees(transformedData);
    } catch (error) {
      console.error('Error fetching rentees:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch rentees on mount
  useEffect(() => {
    fetchRentees();
  }, [fetchRentees]);

  // Filter and search rentees
  const filteredRentees = rentees.filter(rentee => {
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

  console.log('Filtered rentees:', filteredRentees);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Rentees</h1>
        <Link
          to="/dashboard/rentees/new"
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
        >
          Add New Rentee
        </Link>
      </div>
      
      <div className="mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search rentees..."
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
              <option value="all">All Rentees</option>
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
          <p className="text-gray-600">No rentees found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRentees.map(rentee => (
            <RenteeCard key={rentee.id} rentee={rentee} onStatusChange={fetchRentees} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RenteeList; 