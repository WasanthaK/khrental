import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchData } from '../services/supabaseClient';
import InvoiceCard from '../components/invoices/InvoiceCard';
import { INVOICE_STATUS } from '../utils/constants';
import { supabase } from '../services/supabaseClient';

const InvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [properties, setProperties] = useState([]);
  const [rentees, setRentees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        
        // Fetch invoices
        const { data: invoicesData, error: invoicesError } = await fetchData('invoices');
        
        if (invoicesError) {
          throw invoicesError;
        }
        
        setInvoices(invoicesData || []);
        
        // Fetch properties for reference
        const { data: propertiesData, error: propertiesError } = await fetchData('properties');
        
        if (propertiesError) {
          throw propertiesError;
        }
        
        setProperties(propertiesData || []);
        
        // Fetch rentees from app_users table
        const { data: appUsersData, error: appUsersError } = await supabase
          .from('app_users')
          .select('*')
          .eq('user_type', 'rentee');
        
        if (appUsersError) {
          throw appUsersError;
        }
        
        setRentees(appUsersData || []);
      } catch (error) {
        console.error('Error fetching invoices:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInvoices();
  }, []);

  // Filter and search invoices
  const filteredInvoices = invoices.filter(invoice => {
    // Get associated property and rentee for search
    const property = properties.find(p => p.id === invoice.propertyid);
    const rentee = rentees.find(r => r.id === invoice.renteeid);
    
    const matchesSearch = 
      invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.billingperiod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (property && property.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (rentee && rentee.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Status filter
    if (filter !== 'all' && invoice.status !== filter) {
      return false;
    }
    
    // Date filter
    if (dateFilter !== 'all') {
      const invoiceDate = new Date(invoice.createdat);
      const now = new Date();
      
      if (dateFilter === 'this_month') {
        const isThisMonth = 
          invoiceDate.getMonth() === now.getMonth() && 
          invoiceDate.getFullYear() === now.getFullYear();
        if (!isThisMonth) return false;
      } else if (dateFilter === 'last_month') {
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const isLastMonth = 
          invoiceDate.getMonth() === lastMonth && 
          invoiceDate.getFullYear() === lastMonthYear;
        if (!isLastMonth) return false;
      } else if (dateFilter === 'this_year') {
        const isThisYear = invoiceDate.getFullYear() === now.getFullYear();
        if (!isThisYear) return false;
      }
    }
    
    return matchesSearch;
  });
  
  // Sort invoices
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    if (sortBy === 'date_desc') {
      return new Date(b.createdat) - new Date(a.createdat);
    } else if (sortBy === 'date_asc') {
      return new Date(a.createdat) - new Date(b.createdat);
    } else if (sortBy === 'amount_desc') {
      return b.totalAmount - a.totalAmount;
    } else if (sortBy === 'amount_asc') {
      return a.totalAmount - b.totalAmount;
    }
    return 0;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading invoices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Link
          to="/dashboard/invoices/new"
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Create Invoice
        </Link>
      </div>
      
      {/* Search and Filter */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              id="search"
              placeholder="Search by ID, property, or rentee"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div>
            <label htmlFor="filter" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="filter"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value={INVOICE_STATUS.PENDING}>Pending</option>
              <option value={INVOICE_STATUS.VERIFICATION_PENDING}>Verification Pending</option>
              <option value={INVOICE_STATUS.PAID}>Paid</option>
              <option value={INVOICE_STATUS.OVERDUE}>Overdue</option>
              <option value={INVOICE_STATUS.REJECTED}>Rejected</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="dateFilter" className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <select
              id="dateFilter"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              id="sortBy"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Amount (Highest First)</option>
              <option value="amount_asc">Amount (Lowest First)</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Invoice Grid */}
      {sortedInvoices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedInvoices.map(invoice => {
            const property = properties.find(p => p.id === invoice.propertyid);
            const rentee = rentees.find(r => r.id === invoice.renteeid);
            
            return (
              <InvoiceCard 
                key={invoice.id} 
                invoice={invoice} 
                property={property}
                rentee={rentee}
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-50 p-6 rounded-lg text-center">
          <p className="text-gray-600">No invoices found. {searchTerm && 'Try adjusting your search.'}</p>
        </div>
      )}
    </div>
  );
};

export default InvoiceList; 