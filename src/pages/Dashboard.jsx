import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchData, supabase } from '../services/supabaseClient';
import { formatCurrency, formatDate } from '../utils/helpers';
import { INVOICE_STATUS } from '../utils/constants';

const Dashboard = () => {
  const [stats, setStats] = useState({
    properties: 0,
    rentees: 0,
    agreements: 0,
    maintenanceRequests: 0,
    teamMembers: 0,
    invoices: {
      overdue: 0,
      pending: 0,
      paid: 0
    }
  });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // DEBUG: Check user counts by type directly
        const { data: usersByType, error: usersError } = await supabase
          .from('app_users')
          .select('user_type');
        
        let directRenteeCount = 0;
        
        if (usersByType) {
          // Group by user_type
          const typeCount = {};
          usersByType.forEach(user => {
            const type = user.user_type || 'unknown';
            typeCount[type] = (typeCount[type] || 0) + 1;
          });
          console.log('DEBUG - Users by type:', typeCount);
          console.log('Total users:', usersByType.length);
          
          // Get direct rentee count
          directRenteeCount = usersByType.filter(user => user.user_type === 'rentee').length;
          console.log('Direct rentee count:', directRenteeCount);
        }
        
        // DEBUG: Check invoice counts by status directly
        const { data: invoicesByStatus, error: invoiceStatusError } = await supabase
          .from('invoices')
          .select('status');
          
        let directInvoiceCounts = {
          overdue: 0,
          pending: 0,
          paid: 0
        };
        
        if (invoicesByStatus) {
          // Group by status
          const statusCount = {};
          invoicesByStatus.forEach(invoice => {
            const status = invoice.status || 'unknown';
            statusCount[status] = (statusCount[status] || 0) + 1;
          });
          console.log('DEBUG - Invoices by status:', statusCount);
          console.log('Total invoices:', invoicesByStatus.length);
          
          // Get direct invoice counts
          directInvoiceCounts = {
            overdue: invoicesByStatus.filter(invoice => invoice.status === INVOICE_STATUS.OVERDUE).length,
            pending: invoicesByStatus.filter(invoice => invoice.status === INVOICE_STATUS.PENDING).length,
            paid: invoicesByStatus.filter(invoice => invoice.status === INVOICE_STATUS.PAID).length
          };
          console.log('Direct invoice counts:', directInvoiceCounts);
        }
        
        // Fetch properties count
        let propertiesCount = 0;
        try {
          const { count, error } = await fetchData({
            table: 'properties',
            count: true
          });
          if (!error) {
            propertiesCount = count || 0;
          } else {
            console.error('Error fetching properties count:', error);
          }
        } catch (err) {
          console.error('Exception fetching properties count:', err);
        }
        
        // Fetch rentees count - use direct count from earlier as fallback
        let renteesCount = directRenteeCount;
        try {
          const { count, error } = await fetchData({
            table: 'app_users',
            count: true,
            filters: [{ column: 'user_type', operator: 'eq', value: 'rentee' }]
          });
          if (!error) {
            renteesCount = count || directRenteeCount;
          } else {
            console.error('Error fetching rentees count:', error);
          }
        } catch (err) {
          console.error('Exception fetching rentees count:', err);
        }
        
        // Fetch agreements count
        let agreementsCount = 0;
        try {
          const { count, error } = await fetchData({
            table: 'agreements',
            count: true
          });
          if (!error) {
            agreementsCount = count || 0;
          } else {
            console.error('Error fetching agreements count:', error);
          }
        } catch (err) {
          console.error('Exception fetching agreements count:', err);
        }
        
        // Fetch maintenance requests count
        let maintenanceCount = 0;
        try {
          const { count, error } = await fetchData({
            table: 'maintenance_requests',
            count: true,
            filters: [{ column: 'status', operator: 'eq', value: 'pending' }]
          });
          if (!error) {
            maintenanceCount = count || 0;
          } else {
            console.error('Error fetching maintenance count:', error);
          }
        } catch (err) {
          console.error('Exception fetching maintenance count:', err);
        }
        
        // Fetch team members count
        let teamCount = 0;
        try {
          const { count, error } = await supabase
            .from('app_users')
            .select('*', { count: 'exact', head: true })
            .eq('user_type', 'staff');
            
          if (!error) {
            teamCount = count || 0;
          } else {
            console.error('Error fetching team count:', error);
          }
        } catch (err) {
          console.error('Exception fetching team count:', err);
        }
        
        // Fetch recent invoices
        let recentInvoicesData = [];
        try {
          const { data, error } = await fetchData({
            table: 'invoices',
            order: { column: 'createdAt', ascending: false },
            limit: 5
          });
          if (!error) {
            recentInvoicesData = data || [];
          } else {
            console.error('Error fetching recent invoices:', error);
          }
        } catch (err) {
          console.error('Exception fetching recent invoices:', err);
        }
        
        // Update stats
        setStats({
          properties: propertiesCount,
          rentees: renteesCount,
          agreements: agreementsCount,
          maintenanceRequests: maintenanceCount,
          teamMembers: teamCount,
          invoices: directInvoiceCounts
        });
        
        // Update recent invoices
        setRecentInvoices(recentInvoicesData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case INVOICE_STATUS.PAID:
        return 'bg-green-100 text-green-800';
      case INVOICE_STATUS.PENDING:
        return 'bg-yellow-100 text-yellow-800';
      case INVOICE_STATUS.VERIFICATION_PENDING:
        return 'bg-blue-100 text-blue-800';
      case INVOICE_STATUS.OVERDUE:
        return 'bg-red-100 text-red-800';
      case INVOICE_STATUS.REJECTED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading dashboard data...</div>
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
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-gray-600 text-sm">Properties</h2>
              <p className="text-2xl font-semibold">{stats.properties}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/dashboard/properties" className="text-blue-600 hover:text-blue-800 text-sm">
              View all properties →
            </Link>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-gray-600 text-sm">Rentees</h2>
              <p className="text-2xl font-semibold">{stats.rentees}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/dashboard/rentees" className="text-green-600 hover:text-green-800 text-sm">
              View all rentees →
            </Link>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-gray-600 text-sm">Agreements</h2>
              <p className="text-2xl font-semibold">{stats.agreements}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/dashboard/agreements" className="text-yellow-600 hover:text-yellow-800 text-sm">
              View all agreements →
            </Link>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-gray-600 text-sm">Maintenance Requests</h2>
              <p className="text-2xl font-semibold">{stats.maintenanceRequests}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/dashboard/maintenance" className="text-red-600 hover:text-red-800 text-sm">
              View all requests →
            </Link>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-gray-600 text-sm">Team Members</h2>
              <p className="text-2xl font-semibold">{stats.teamMembers}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/dashboard/team" className="text-purple-600 hover:text-purple-800 text-sm">
              View all members →
            </Link>
          </div>
        </div>
      </div>
      
      {/* Invoice Stats */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Invoice Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-yellow-800 font-medium">Pending</h3>
                <p className="text-2xl font-bold text-yellow-900">{stats.invoices.pending}</p>
              </div>
              <div className="text-yellow-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <Link to="/dashboard/invoices?status=pending" className="text-yellow-700 hover:text-yellow-900 text-sm">
                View pending invoices →
              </Link>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-red-800 font-medium">Overdue</h3>
                <p className="text-2xl font-bold text-red-900">{stats.invoices.overdue}</p>
              </div>
              <div className="text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <Link to="/dashboard/invoices?status=overdue" className="text-red-700 hover:text-red-900 text-sm">
                View overdue invoices →
              </Link>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-blue-800 font-medium">Paid</h3>
                <p className="text-2xl font-bold text-blue-900">{stats.invoices.paid}</p>
              </div>
              <div className="text-blue-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <Link to="/dashboard/invoices?status=paid" className="text-blue-700 hover:text-blue-900 text-sm">
                View paid invoices →
              </Link>
            </div>
          </div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Link
            to="/dashboard/properties/new"
            className="bg-blue-50 hover:bg-blue-100 p-4 rounded-lg text-center"
          >
            <div className="text-blue-600 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span>Add New Property</span>
          </Link>
          
          <Link
            to="/dashboard/invoices/new"
            className="bg-yellow-50 hover:bg-yellow-100 p-4 rounded-lg text-center"
          >
            <div className="text-yellow-600 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span>Generate Invoice</span>
          </Link>
          
          <Link
            to="/dashboard/agreements/new"
            className="bg-green-50 hover:bg-green-100 p-4 rounded-lg text-center"
          >
            <div className="text-green-600 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span>Create Agreement</span>
          </Link>
          
          <Link
            to="/dashboard/utilities"
            className="bg-teal-50 hover:bg-teal-100 p-4 rounded-lg text-center"
          >
            <div className="text-teal-600 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span>Review Utility Readings</span>
          </Link>
          
          <Link
            to="/dashboard/maintenance/new"
            className="bg-red-50 hover:bg-red-100 p-4 rounded-lg text-center"
          >
            <div className="text-red-600 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span>Log Maintenance</span>
          </Link>
        </div>
      </div>
      
      {/* Recent Invoices */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Invoices</h2>
          <Link to="/dashboard/invoices" className="text-blue-600 hover:text-blue-800 text-sm">
            View all invoices →
          </Link>
        </div>
        
        {recentInvoices.length === 0 ? (
          <p className="text-gray-500">No invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rentee
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{invoice.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.renteeName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.propertyName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invoice.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Link to={`/dashboard/invoices/${invoice.id}`} className="text-blue-600 hover:text-blue-900">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 