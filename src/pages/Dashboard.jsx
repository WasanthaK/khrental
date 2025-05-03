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
  const [activeSection, setActiveSection] = useState('overview');

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

  // Get icon backgrounds for stat cards
  const getIconBackground = (type) => {
    switch (type) {
      case 'properties': return 'bg-blue-100 text-blue-600';
      case 'rentees': return 'bg-green-100 text-green-600';
      case 'agreements': return 'bg-yellow-100 text-yellow-600';
      case 'maintenance': return 'bg-red-100 text-red-600';
      case 'team': return 'bg-purple-100 text-purple-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  // Get view link styles
  const getLinkStyle = (type) => {
    switch (type) {
      case 'properties': return 'bg-blue-500 hover:bg-blue-600 text-white';
      case 'rentees': return 'bg-green-500 hover:bg-green-600 text-white';
      case 'agreements': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      case 'maintenance': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'team': return 'bg-purple-500 hover:bg-purple-600 text-white';
      default: return 'bg-gray-500 hover:bg-gray-600 text-white';
    }
  };

  // Render a stat card with larger touch targets and better visual hierarchy
  const renderStatCard = (title, value, icon, type, linkPath) => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-4">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`p-3 rounded-full ${getIconBackground(type)}`}>
            {icon}
          </div>
          <div className="ml-4">
            <h2 className="text-gray-600 text-sm font-medium">{title}</h2>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        </div>
        <div className="mt-4">
          <Link 
            to={linkPath} 
            className={`block w-full py-2 px-4 rounded-lg text-center font-medium text-sm ${getLinkStyle(type)}`}
          >
            View {title}
          </Link>
        </div>
      </div>
    </div>
  );

  // Render invoice stat card
  const renderInvoiceStatCard = (title, value, icon, type, linkPath) => (
    <div className={`rounded-xl p-5 ${type === 'pending' ? 'bg-yellow-50' : type === 'overdue' ? 'bg-red-50' : 'bg-green-50'}`}>
      <div className="flex justify-between items-center">
        <div>
          <h3 className={`${type === 'pending' ? 'text-yellow-800' : type === 'overdue' ? 'text-red-800' : 'text-green-800'} text-md font-medium`}>
            {title}
          </h3>
          <p className={`text-3xl font-bold ${type === 'pending' ? 'text-yellow-900' : type === 'overdue' ? 'text-red-900' : 'text-green-900'}`}>
            {value}
          </p>
        </div>
        <div className={type === 'pending' ? 'text-yellow-500' : type === 'overdue' ? 'text-red-500' : 'text-green-500'}>
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <Link 
          to={linkPath} 
          className={`block w-full py-2 px-4 rounded-lg text-center font-medium text-sm ${
            type === 'pending' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 
            type === 'overdue' ? 'bg-red-500 hover:bg-red-600 text-white' : 
            'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          View {title.toLowerCase()}
        </Link>
      </div>
    </div>
  );

  // Render quick action button
  const renderQuickAction = (title, icon, linkPath, bgColor) => (
    <Link
      to={linkPath}
      className={`${bgColor} py-4 px-4 rounded-xl flex flex-col items-center justify-center`}
    >
      <div className="mb-2">
        {icon}
      </div>
      <span className="text-sm font-medium text-center">{title}</span>
    </Link>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-pulse flex flex-col items-center">
          <div className="rounded-full bg-gray-200 h-16 w-16 mb-4"></div>
          <div className="text-xl">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 mx-2 my-4">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-md" role="alert">
          <p className="font-bold">Error</p>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-3 bg-red-500 text-white py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Dashboard tab navigation
  const renderTabNavigation = () => (
    <div className="flex overflow-x-auto space-x-1 mb-4 bg-gray-100 p-1 rounded-lg">
      <button
        onClick={() => setActiveSection('overview')}
        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg ${
          activeSection === 'overview' ? 'bg-white shadow' : 'text-gray-500'
        }`}
      >
        Overview
      </button>
      <button
        onClick={() => setActiveSection('invoices')}
        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg ${
          activeSection === 'invoices' ? 'bg-white shadow' : 'text-gray-500'
        }`}
      >
        Invoices
      </button>
      <button
        onClick={() => setActiveSection('actions')}
        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg ${
          activeSection === 'actions' ? 'bg-white shadow' : 'text-gray-500'
        }`}
      >
        Actions
      </button>
    </div>
  );

  return (
    <div className="pb-20 px-4">
      <h1 className="text-2xl font-bold my-4">Dashboard</h1>
      
      {renderTabNavigation()}
      
      {activeSection === 'overview' && (
        <div className="space-y-0">
          {/* Main Stats - Single column layout for mobile */}
          <div className="flex flex-col">
            {renderStatCard(
              'Properties', 
              stats.properties, 
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>,
              'properties',
              '/dashboard/properties'
            )}
            
            {renderStatCard(
              'Rentees',
              stats.rentees,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>,
              'rentees',
              '/dashboard/rentees'
            )}
            
            {renderStatCard(
              'Agreements',
              stats.agreements,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>,
              'agreements',
              '/dashboard/agreements'
            )}
          </div>
        </div>
      )}
      
      {activeSection === 'invoices' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-3">Invoice Status</h2>
          <div className="space-y-4">
            {renderInvoiceStatCard(
              'Pending',
              stats.invoices.pending,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>,
              'pending',
              '/dashboard/invoices?status=pending'
            )}
            
            {renderInvoiceStatCard(
              'Overdue',
              stats.invoices.overdue,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>,
              'overdue',
              '/dashboard/invoices?status=overdue'
            )}
            
            {renderInvoiceStatCard(
              'Paid',
              stats.invoices.paid,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>,
              'paid',
              '/dashboard/invoices?status=paid'
            )}
          </div>
          
          {/* Recent Invoices - Mobile optimized list */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Recent Invoices</h2>
              <Link to="/dashboard/invoices" className="text-blue-600 text-sm font-medium">
                View all
              </Link>
            </div>
            
            {recentInvoices.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600">No invoices found</p>
                <Link to="/dashboard/invoices/new" className="mt-4 inline-block bg-blue-500 text-white py-2 px-4 rounded-lg text-sm font-medium">
                  Create Invoice
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((invoice) => (
                  <Link to={`/dashboard/invoices/${invoice.id}`} key={invoice.id} className="block">
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 hover:shadow-md transition-shadow">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">#{invoice.id.substring(0, 8)}</span>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500 text-sm">Rentee:</span>
                          <span className="text-sm font-medium">{invoice.renteeName || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-gray-500 text-sm">Amount:</span>
                          <span className="text-sm font-medium">{formatCurrency(invoice.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-gray-500 text-sm">Date:</span>
                          <span className="text-sm">{formatDate(invoice.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {activeSection === 'actions' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-3">Quick Actions</h2>
          
          <div className="grid grid-cols-2 gap-3">
            {renderQuickAction(
              'Add Property',
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>,
              '/dashboard/properties/new',
              'bg-blue-500 text-white'
            )}
            
            {renderQuickAction(
              'Create Invoice',
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>,
              '/dashboard/invoices/new',
              'bg-yellow-500 text-white'
            )}
            
            {renderQuickAction(
              'New Agreement',
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>,
              '/dashboard/agreements/new',
              'bg-green-500 text-white'
            )}
            
            {renderQuickAction(
              'Maintenance',
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>,
              '/dashboard/maintenance/new',
              'bg-red-500 text-white'
            )}
          </div>
          
          <div className="mt-6">
            {renderStatCard(
              'Maintenance',
              stats.maintenanceRequests,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>,
              'maintenance',
              '/dashboard/maintenance'
            )}
            
            {renderStatCard(
              'Team',
              stats.teamMembers,
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>,
              'team',
              '/dashboard/team'
            )}
          </div>
        </div>
      )}
      
      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-4 flex justify-around">
        <button 
          onClick={() => setActiveSection('overview')} 
          className={`flex flex-col items-center ${activeSection === 'overview' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className="text-xs">Overview</span>
        </button>
        
        <button 
          onClick={() => setActiveSection('invoices')} 
          className={`flex flex-col items-center ${activeSection === 'invoices' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs">Invoices</span>
        </button>
        
        <button 
          onClick={() => setActiveSection('actions')} 
          className={`flex flex-col items-center ${activeSection === 'actions' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-xs">Actions</span>
        </button>
      </div>
    </div>
  );
};

export default Dashboard; 