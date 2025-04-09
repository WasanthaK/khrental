import React, { useState, useEffect } from 'react';
import { 
  Alert, Box, Button, Checkbox, CircularProgress, Container, 
  FormControl, FormControlLabel, Grid, InputLabel, MenuItem, 
  Paper, Select, Snackbar, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Typography 
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FiDollarSign, FiFilter, FiFileText, FiCheckSquare, FiAlertTriangle } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { fetchReadingsForInvoice, markAsInvoiced } from '../services/utilityBillingService';
import { UTILITY_TYPES } from '../utils/constants';

const UtilityBillingInvoice = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  
  const [billingData, setBillingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState([]);
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
    
    try {
      const { data, error } = await fetchReadingsForInvoice({
        month: filter.month,
        year: filter.year
      });
      
      if (error) throw error;
      
      setBillingData(data || []);
      setSelectedItems([]);
    } catch (error) {
      console.error('Error loading billing data:', error);
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
  
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedItems(billingData.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };
  
  const handleSelectItem = (id) => {
    setSelectedItems(prev => {
      if (prev.includes(id)) {
        return prev.filter(itemId => itemId !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  const handleCreateInvoice = async () => {
    if (selectedItems.length === 0) {
      showAlert('Please select at least one billing record', 'warning');
      return;
    }
    
    try {
      // In a real application, you would integrate with the invoice service
      // For now, we'll just simulate creating an invoice with a mock ID
      const mockInvoiceId = `INV-${Date.now()}`;
      
      const { data, error } = await markAsInvoiced(selectedItems, mockInvoiceId);
      
      if (error) throw error;
      
      showAlert(`Successfully created invoice: ${mockInvoiceId}`, 'success');
      loadBillingData(); // Refresh the list
    } catch (error) {
      console.error('Error creating invoice:', error);
      showAlert('Failed to create invoice', 'error');
    }
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
  
  const calculateTotal = () => {
    let total = 0;
    
    billingData.forEach(item => {
      if (selectedItems.includes(item.id)) {
        total += parseFloat(item.amount);
      }
    });
    
    return total;
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
          View approved utility readings that are ready to be invoiced. Select items to include in an invoice.
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
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : billingData.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6">No billing data found</Typography>
            <Typography variant="body2" color="textSecondary">
              There are no approved utility readings ready for invoicing in the selected period.
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedItems.length === billingData.length && billingData.length > 0}
                    indeterminate={selectedItems.length > 0 && selectedItems.length < billingData.length}
                    onChange={handleSelectAll}
                  />
                }
                label="Select All"
              />
              
              <Box>
                <Typography variant="h6" sx={{ display: 'inline-block', mr: 2 }}>
                  Total Selected: {formatCurrency(calculateTotal())}
                </Typography>
                
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleCreateInvoice}
                  disabled={selectedItems.length === 0}
                  startIcon={<FiFileText />}
                >
                  Create Invoice
                </Button>
              </Box>
            </Box>
            
            {Object.entries(groupByRentee()).map(([renteeId, data]) => (
              <Paper key={renteeId} sx={{ mb: 3, p: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="h6">
                  {data.rentee?.name} - {data.property?.name}
                </Typography>
                
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox />
                        </TableCell>
                        <TableCell>Utility</TableCell>
                        <TableCell>Reading Date</TableCell>
                        <TableCell>Consumption</TableCell>
                        <TableCell>Rate</TableCell>
                        <TableCell>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.readings.map((item) => (
                        <TableRow 
                          key={item.id}
                          hover
                          selected={selectedItems.includes(item.id)}
                          onClick={() => handleSelectItem(item.id)}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onChange={() => {}}
                            />
                          </TableCell>
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
                      <TableRow>
                        <TableCell colSpan={5} align="right">
                          <Typography variant="subtitle1">Total</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="subtitle1">
                            {formatCurrency(data.readings.reduce((sum, item) => 
                              sum + (selectedItems.includes(item.id) ? parseFloat(item.amount) : 0), 0)
                            )}
                          </Typography>
                        </TableCell>
                      </TableRow>
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