import React, { useState, useEffect } from 'react';
import { 
  Alert, Box, Button, CircularProgress, Container,
  FormControl, InputLabel, MenuItem, Paper, Select, Snackbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FiFilter, FiFileText } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { fetchReadingsForInvoice } from '../services/utilityBillingService';
import { useAuth } from '../hooks/useAuth';
import { hasPermission, PERMISSIONS } from '../utils/accessPolicy.js';
import { UTILITY_TYPES } from '../utils/constants';

const UtilityBillingInvoice = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, membership } = useAuth();
  const canManageInvoices = hasPermission(
    { user, membership: membership || user?.membership || null },
    PERMISSIONS.INVOICES_MANAGE
  );
  
  const [billingData, setBillingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState({
    month: new Date().toLocaleString('default', { month: 'long' }),
    year: new Date().getFullYear()
  });
  const [alert, setAlert] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  
  useEffect(() => {
    loadBillingData();
  }, [filter]);
  
  const loadBillingData = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const { data, error } = await fetchReadingsForInvoice({
        month: filter.month,
        year: filter.year
      });
      
      if (error) throw error;
      
      setBillingData(data || []);
    } catch (error) {
      console.error('Error loading billing data:', error);
      setBillingData([]);
      setLoadError(true);
      showAlert('Failed to load billing data', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilter(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const showAlert = (message, severity = 'info') => {
    setAlert({
      open: true,
      message,
      severity
    });
  };
  
  const handleAlertClose = () => {
    setAlert(prev => ({
      ...prev,
      open: false
    }));
  };
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };
  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  const groupByRentee = () => {
    const grouped = {};
    
    billingData.forEach(item => {
      if (!grouped[item.rentee_id]) {
        grouped[item.rentee_id] = {
          rentee: item.utility_readings?.app_users,
          property: item.utility_readings?.properties,
          readings: []
        };
      }
      
      grouped[item.rentee_id].readings.push(item);
    });
    
    return grouped;
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Utility Billing for Invoicing
        </Typography>
        <Typography variant="body1" paragraph>
          Review utility readings awaiting billing. This screen does not create or issue invoices.
        </Typography>
        
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
          <FiFilter style={{ marginRight: 8 }} />
          <FormControl variant="outlined" size="small" sx={{ minWidth: 150, mr: 2 }}>
            <InputLabel id="month-label">Month</InputLabel>
            <Select
              labelId="month-label"
              id="month"
              name="month"
              value={filter.month}
              onChange={handleFilterChange}
              label="Month"
            >
              {months.map(month => (
                <MenuItem key={month} value={month}>{month}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl variant="outlined" size="small" sx={{ minWidth: 100, mr: 2 }}>
            <InputLabel id="year-label">Year</InputLabel>
            <Select
              labelId="year-label"
              id="year"
              name="year"
              value={filter.year}
              onChange={handleFilterChange}
              label="Year"
            >
              {years.map(year => (
                <MenuItem key={year} value={year}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        
        <Alert severity="info" sx={{ mb: 2 }}>
          Read-only utility billing preview. Amounts shown here are not final invoice charges.
          Invoice creation and reading linkage are handled by the monthly billing lifecycle.
        </Alert>
        {canManageInvoices && (
          <Button
            variant="outlined"
            startIcon={<FiFileText />}
            onClick={() => navigate('/dashboard/invoices/batch-generate')}
            sx={{ mb: 3 }}
          >
            Open Monthly Invoice Generation
          </Button>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : loadError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            Utility billing data could not be loaded. No invoice has been created.
          </Alert>
        ) : billingData.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6">No billing data found</Typography>
            <Typography variant="body2" color="textSecondary">
              There are no approved utility readings ready for invoicing in the selected period.
            </Typography>
          </Box>
        ) : (
          <>
            {Object.entries(groupByRentee()).map(([renteeId, data]) => (
              <Paper key={renteeId} sx={{ mb: 3, p: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="h6">
                  {data.rentee?.name} - {data.property?.name}
                </Typography>
                
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Utility</TableCell>
                        <TableCell>Reading Date</TableCell>
                        <TableCell>Consumption</TableCell>
                        <TableCell>Rate</TableCell>
                        <TableCell>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.readings.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.utility_type === UTILITY_TYPES.ELECTRICITY ? 
                              'Electricity' : item.utility_type === UTILITY_TYPES.WATER ? 
                              'Water' : item.utility_type}
                          </TableCell>
                          <TableCell>{formatDate(item.utility_readings?.readingdate)}</TableCell>
                          <TableCell>{item.consumption} {item.utility_type === UTILITY_TYPES.ELECTRICITY ? 'kWh' : 'm³'}</TableCell>
                          <TableCell>{formatCurrency(item.rate)} per {item.utility_type === UTILITY_TYPES.ELECTRICITY ? 'kWh' : 'm³'}</TableCell>
                          <TableCell>{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            ))}
          </>
        )}
      </Paper>
      
      <Snackbar
        open={alert.open}
        autoHideDuration={6000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleAlertClose} severity={alert.severity}>
          {alert.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default UtilityBillingInvoice; 