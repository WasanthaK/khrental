import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const Dashboard = () => {
  const [userCounts, setUserCounts] = useState({});
  const [invoiceCounts, setInvoiceCounts] = useState({});

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        // Load user counts
        const { data: users } = await supabase
          .from('users')
          .select('role')
          .eq('is_active', true);

        const userCounts = users?.reduce((acc, user) => {
          acc[user.role] = (acc[user.role] || 0) + 1;
          return acc;
        }, {});

        setUserCounts(userCounts || {});

        // Load invoice counts
        const { data: invoices } = await supabase
          .from('invoices')
          .select('status');

        const invoiceCounts = invoices?.reduce((acc, invoice) => {
          acc[invoice.status] = (acc[invoice.status] || 0) + 1;
          return acc;
        }, {});

        setInvoiceCounts(invoiceCounts || {});
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      }
    };

    loadDashboardData();
  }, []);

  return (
    <div>
      {/* Render your component content here */}
    </div>
  );
};

export default Dashboard; 