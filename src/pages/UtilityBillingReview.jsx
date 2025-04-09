import React, { useState, useEffect } from 'react';
import { Box, Button, Card, CardContent, CircularProgress, Container, Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Alert, Chip, Tooltip, IconButton, TextField } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FiCheckCircle, FiXCircle, FiFilter, FiImage, FiDollarSign, FiActivity, FiHelpCircle, FiEdit, FiSave } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { fetchReadings, approveReading, rejectReading, fetchReadingById, calculateUtilityAmount, updateReadingValue } from '../services/utilityBillingService';
import { UTILITY_TYPES } from '../utils/constants';
import ImageViewer from '../components/common/ImageViewer';

const UtilityBillingReview = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // Default to pending
  const [utilityTypeFilter, setUtilityTypeFilter] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [alert, setAlert] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  
  // New state for editing functionality
  const [editingReading, setEditingReading] = useState(null);
  const [editedValue, setEditedValue] = useState('');
  const [editingField, setEditingField] = useState(null); // Track which field is being edited
  const [editedPreviousValue, setEditedPreviousValue] = useState('');
  
  useEffect(() => {
    loadReadings();
  }, [filter, utilityTypeFilter]);
  
  const loadReadings = async () => {
    try {
      setLoading(true);
      
      let statusFilter = null;
      let billingStatusFilter = null;
      
      // Set filters based on selected filter
      if (filter === 'pending') {
        statusFilter = 'pending';
      } else if (filter === 'approved') {
        statusFilter = 'approved';
      } else if (filter === 'completed') {
        billingStatusFilter = 'pending_invoice';
      } else if (filter === 'rejected') {
        // For rejected, we need to check both status and billing_status columns,
        // but let's focus on billing_status since that's where we're storing it
        billingStatusFilter = 'rejected';
      } else if (filter === 'billed') {
        billingStatusFilter = 'invoiced';
      }
      
      const options = {
        status: statusFilter,
        billingStatus: billingStatusFilter,
        utilityType: utilityTypeFilter || undefined
      };
      
      console.log('Fetching readings with options:', options);
      
      const { data, error } = await fetchReadings(options);
      
      if (error) {
        throw error;
      }
      
      // Additional client-side filtering for effective_status in billing_data
      let filteredData = data;
      
      if (filter === 'rejected' && data) {
        // Also include readings where billing_data.effective_status is 'rejected'
        filteredData = data.filter(reading => 
          reading.billing_status === 'rejected' || 
          reading.billing_data?.effective_status === 'rejected' ||
          reading.status === 'rejected'
        );
      }
      
      setReadings(filteredData || []);
      
    } catch (error) {
      console.error('Error loading readings:', error);
      showAlert('Failed to load readings', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    if (name === 'status') {
      setFilter(value);
    } else if (name === 'utilityType') {
      setUtilityTypeFilter(value);
    }
  };
  
  const handleViewImage = (imageUrl) => {
    setSelectedImage(imageUrl);
    setShowImageViewer(true);
  };
  
  const closeImageViewer = () => {
    setShowImageViewer(false);
    setSelectedImage(null);
  };
  
  const handleApprove = async (reading) => {
    try {
      console.log('Approving reading:', reading.id, reading);
      const { data, error } = await approveReading(reading);
      
      console.log('Approval response:', data, error);
      
      if (error) {
        throw error;
      }
      
      // Verify the status change by fetching the reading directly
      const { data: updatedReading, error: fetchError } = await fetchReadingById(reading.id);
      
      if (fetchError) {
        throw fetchError;
      }
      
      // Check if the status has changed to approved/completed/verified
      if (updatedReading && ['approved', 'completed', 'verified'].includes(updatedReading.status)) {
        console.log('Status successfully changed to:', updatedReading.status);
        showAlert(`Reading approved successfully (status: ${updatedReading.status})`, 'success');
      } else if (updatedReading && updatedReading.status === 'pending' && 
                (updatedReading.billing_data || updatedReading.calculatedbill)) {
        // Fallback worked - data was processed but status wasn't changed
        console.log('Status unchanged but billing data processed');
        showAlert('Reading processed successfully using fallback method', 'success');
      } else {
        console.error('Status did not change as expected:', updatedReading?.status);
        showAlert('Warning: Reading may not have been properly processed', 'warning');
      }
      
      // Force a reload to ensure we get the latest data
      await loadReadings();
    } catch (error) {
      console.error('Error approving reading:', error);
      showAlert('Failed to approve reading: ' + (error.message || 'Unknown error'), 'error');
    }
  };
  
  const handleReject = async (reading, reason) => {
    try {
      console.log('Rejecting reading:', reading.id, reason);
      const { data, error } = await rejectReading(reading, reason);
      
      console.log('Rejection response:', data, error);
      
      if (error) {
        throw error;
      }
      
      // Verify the status change by fetching the reading directly
      const { data: updatedReading, error: fetchError } = await fetchReadingById(reading.id);
      
      if (fetchError) {
        console.warn('Could not verify status update:', fetchError);
      } else {
        console.log('Reading after rejection:', updatedReading);
        
        // Check if the status has changed to rejected
        if (updatedReading && (updatedReading.status === 'rejected' || updatedReading.billing_status === 'rejected')) {
          console.log('Status successfully changed to rejected');
          showAlert('Reading rejected successfully', 'success');
          
          // Update the local state to reflect the rejection
          // This will hide the action buttons
          setReadings(prevReadings => 
            prevReadings.map(r => 
              r.id === reading.id 
                ? { ...r, status: 'rejected', billing_status: 'rejected', rejection_reason: reason }
                : r
            )
          );
        } else if (updatedReading && updatedReading.rejection_reason) {
          // Fallback worked - rejection reason was recorded but status wasn't changed
          console.log('Status unchanged but rejection reason recorded');
          showAlert('Reading rejection processed successfully', 'success');
          
          // Still update local state with the rejection data
          setReadings(prevReadings => 
            prevReadings.map(r => 
              r.id === reading.id 
                ? { ...r, billing_data: { ...r.billing_data, effective_status: 'rejected' }, rejection_reason: reason }
                : r
            )
          );
        } else {
          console.error('Status did not change as expected:', updatedReading?.status);
          showAlert('Warning: Reading may not have been properly rejected', 'warning');
        }
      }
      
      // Force a reload to ensure we get the latest data
      await loadReadings();
    } catch (error) {
      console.error('Error rejecting reading:', error);
      showAlert('Failed to reject reading: ' + (error.message || 'Unknown error'), 'error');
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
  
  const calculateConsumption = (reading) => {
    return reading.currentreading - (reading.previousreading || 0);
  };
  
  const formatCurrency = (amount) => {
    // Format with Sri Lankan Rupee symbol
    try {
      return new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      // Fallback formatting if Intl support is limited
      return `LKR ${Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }
  };
  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  // Get status chip color and label
  const getStatusChip = (reading) => {
    if (!reading) {
      return (
        <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
          Unknown
        </span>
      );
    }
    
    // First check if billing_status is 'rejected'
    if (reading.billing_status === 'rejected') {
      return (
        <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
          Rejected
        </span>
      );
    }
    
    // Check for effective_status in billing_data
    const effectiveStatus = reading.billing_data?.effective_status;
    
    if (effectiveStatus === 'rejected') {
      return (
        <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
          Rejected
        </span>
      );
    } else if (effectiveStatus === 'approved') {
      return (
        <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
          Approved
        </span>
      );
    } else if (effectiveStatus === 'pending_invoice') {
      return (
        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
          Pending Invoice
        </span>
      );
    } else if (effectiveStatus === 'invoiced' || reading.billing_status === 'invoiced') {
      return (
        <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-medium">
          Invoiced
        </span>
      );
    }
    
    // If effective_status isn't set, fall back to the actual status
    switch (reading.status) {
      case 'pending':
        return (
          <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
            Approved
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
            Processed
          </span>
        );
      case 'verified':
        return (
          <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium">
            Verified
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
            Rejected
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
            {reading.status || "Unknown"}
          </span>
        );
    }
  };
  
  // Function to start editing a reading
  const handleStartEdit = (reading, field = 'current') => {
    setEditingReading(reading.id);
    setEditingField(field);
    
    if (field === 'previous') {
      setEditedPreviousValue((reading.previousreading || 0).toString());
    } else {
      setEditedValue(reading.currentreading.toString());
    }
  };
  
  // Function to cancel editing
  const handleCancelEdit = () => {
    setEditingReading(null);
    setEditingField(null);
    setEditedValue('');
    setEditedPreviousValue('');
  };
  
  // Function to save edited reading
  const handleSaveEdit = async (readingId) => {
    try {
      const readingToUpdate = readings.find(r => r.id === readingId);
      if (!readingToUpdate) {
        return;
      }
      
      if (editingField === 'previous') {
        // Validate the new previous reading value
        const numValue = parseFloat(editedPreviousValue);
        if (isNaN(numValue)) {
          showAlert('Please enter a valid number', 'error');
          return;
        }
        
        // Make sure the previous reading is less than current reading
        if (numValue >= readingToUpdate.currentreading) {
          showAlert('Previous reading must be less than current reading', 'error');
          return;
        }
        
        // Update the previous reading value
        const { data, error } = await updateReadingValue(readingId, readingToUpdate.currentreading, numValue);
        
        if (error) {
          throw error;
        }
      } else {
        // Validate the new current reading value
        const numValue = parseFloat(editedValue);
        if (isNaN(numValue)) {
          showAlert('Please enter a valid number', 'error');
          return;
        }
        
        // Make sure the new value is at least greater than the previous reading
        if (numValue <= readingToUpdate.previousreading) {
          showAlert('Current reading must be greater than previous reading', 'error');
          return;
        }
        
        // Update the current reading value
        const { data, error } = await updateReadingValue(readingId, numValue, readingToUpdate.previousreading);
        
        if (error) {
          throw error;
        }
      }
      
      // Reset editing state
      setEditingReading(null);
      setEditingField(null);
      setEditedValue('');
      setEditedPreviousValue('');
      
      // Reload the readings
      await loadReadings();
      
      showAlert('Reading updated successfully', 'success');
    } catch (error) {
      console.error('Error updating reading:', error);
      showAlert('Failed to update reading: ' + (error.message || 'Unknown error'), 'error');
    }
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Utility Readings Review
        </Typography>
        
        {/* Filter controls in a card at the top */}
        <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
          <CardContent sx={{ p: 1 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <FiFilter style={{ marginRight: 8 }} /> Filters
            </Typography>
            
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4} md={3}>
                <FormControl variant="outlined" size="small" fullWidth>
                  <InputLabel id="status-label">Status</InputLabel>
                  <Select
                    labelId="status-label"
                    id="status"
                    name="status"
                    value={filter}
                    onChange={handleFilterChange}
                    label="Status"
                  >
                    <MenuItem value="pending">Pending Review</MenuItem>
                    <MenuItem value="approved">Approved</MenuItem>
                    <MenuItem value="completed">Processed</MenuItem>
                    <MenuItem value="rejected">Rejected</MenuItem>
                    <MenuItem value="billed">Invoiced</MenuItem>
                    <MenuItem value="all">All Readings</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={4} md={3}>
                <FormControl variant="outlined" size="small" fullWidth>
                  <InputLabel id="utility-type-label">Utility Type</InputLabel>
                  <Select
                    labelId="utility-type-label"
                    id="utility-type"
                    name="utilityType"
                    value={utilityTypeFilter}
                    onChange={handleFilterChange}
                    label="Utility Type"
                  >
                    <MenuItem value="">All Types</MenuItem>
                    <MenuItem value={UTILITY_TYPES.ELECTRICITY}>Electricity</MenuItem>
                    <MenuItem value={UTILITY_TYPES.WATER}>Water</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={4} md={2}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={loadReadings}
                  startIcon={<FiActivity />}
                >
                  Refresh
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : readings.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6">No readings found</Typography>
            <Typography variant="body2" color="textSecondary">
              {filter === 'pending' 
                ? 'No pending readings require your attention.'
                : filter === 'completed'
                  ? 'No approved or processed readings found.'
                  : filter === 'rejected'
                    ? 'No rejected readings found.'
                    : filter === 'billed'
                      ? 'No invoiced readings found.'
                      : 'No readings match your current filters.'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            {readings.map((reading) => (
              <Paper 
                key={reading.id} 
                elevation={1} 
                sx={{ 
                  mb: 2, 
                  overflow: 'hidden',
                  '&:hover': { 
                    boxShadow: 3 
                  }
                }}
              >
                {/* Utility Information Header */}
                <Box 
                  sx={{ 
                    p: 1.5, 
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                    {getStatusChip(reading)}
                    
                    <Typography variant="subtitle1" sx={{ mx: 2, fontWeight: 'bold' }}>
                      {reading.utilitytype === UTILITY_TYPES.ELECTRICITY ? 
                        'Electricity' : reading.utilitytype === UTILITY_TYPES.WATER ? 
                        'Water' : reading.utilitytype}
                    </Typography>
                    
                    <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                    
                    <Tooltip title="Property">
                      <Typography variant="body2" sx={{ mx: 1 }}>
                        {reading.properties?.name || "Unknown Property"}
                      </Typography>
                    </Tooltip>
                    
                    <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                    
                    <Tooltip title="Tenant">
                      <Typography variant="body2" sx={{ mx: 1 }}>
                        {reading.app_users?.name || "Unknown Tenant"}
                      </Typography>
                    </Tooltip>
                  </Box>
                  
                  {/* Action buttons */}
                  {(!reading.billing_data?.effective_status ||
                    (reading.billing_data?.effective_status !== 'approved' && 
                     reading.billing_data?.effective_status !== 'rejected' && 
                     reading.billing_data?.effective_status !== 'pending_invoice' && 
                     reading.billing_data?.effective_status !== 'invoiced')) && 
                   reading.status !== 'approved' && 
                   reading.status !== 'rejected' && 
                   reading.billing_status !== 'rejected' && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => handleApprove(reading)}
                        startIcon={<FiCheckCircle />}
                        disabled={editingReading === reading.id}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => handleReject(reading, prompt('Please provide a reason for rejection:'))}
                        startIcon={<FiXCircle />}
                        disabled={editingReading === reading.id}
                      >
                        Reject
                      </Button>
                    </Box>
                  )}
                  
                  <Typography variant="body2" color="textSecondary">
                    {formatDate(reading.readingdate)}
                  </Typography>
                </Box>
                
                {/* Reading Details */}
                <Grid container spacing={2} p={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Previous Reading
                    </Typography>
                    {editingReading === reading.id && editingField === 'previous' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                          size="small"
                          value={editedPreviousValue}
                          onChange={(e) => setEditedPreviousValue(e.target.value)}
                          type="number"
                          InputProps={{ 
                            inputProps: { 
                              max: reading.currentreading - 0.01, 
                              step: 'any' 
                            },
                            sx: { 
                              bgcolor: 'background.paper', 
                              width: '80px',
                              '& input': {
                                padding: '8px'
                              }
                            }
                          }}
                        />
                        <IconButton 
                          color="primary" 
                          size="small" 
                          onClick={() => handleSaveEdit(reading.id)}
                          title="Save"
                        >
                          <FiSave />
                        </IconButton>
                        <IconButton 
                          color="default" 
                          size="small" 
                          onClick={handleCancelEdit}
                          title="Cancel"
                        >
                          <FiXCircle />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h6">{reading.previousreading || 0}</Typography>
                        {reading.status === 'pending' && editingReading !== reading.id && (
                          <IconButton 
                            color="primary" 
                            size="small" 
                            onClick={() => handleStartEdit(reading, 'previous')}
                            title="Edit previous reading"
                            sx={{ ml: 1 }}
                          >
                            <FiEdit size={14} />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Current Reading
                    </Typography>
                    {editingReading === reading.id && editingField === 'current' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                          size="small"
                          value={editedValue}
                          onChange={(e) => setEditedValue(e.target.value)}
                          type="number"
                          InputProps={{ 
                            inputProps: { 
                              min: reading.previousreading || 0, 
                              step: 'any' 
                            },
                            sx: { 
                              bgcolor: 'background.paper', 
                              width: '80px',
                              '& input': {
                                padding: '8px'
                              }
                            }
                          }}
                        />
                        <IconButton 
                          color="primary" 
                          size="small" 
                          onClick={() => handleSaveEdit(reading.id)}
                          title="Save"
                        >
                          <FiSave />
                        </IconButton>
                        <IconButton 
                          color="default" 
                          size="small" 
                          onClick={handleCancelEdit}
                          title="Cancel"
                        >
                          <FiXCircle />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h6">{reading.currentreading}</Typography>
                        {reading.status === 'pending' && editingReading !== reading.id && (
                          <IconButton 
                            color="primary" 
                            size="small" 
                            onClick={() => handleStartEdit(reading, 'current')}
                            title="Edit current reading"
                            sx={{ ml: 1 }}
                          >
                            <FiEdit size={14} />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={2}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Consumption
                    </Typography>
                    <Typography variant="h6">
                      {calculateConsumption(reading).toFixed(2)} {reading.utilitytype === UTILITY_TYPES.ELECTRICITY ? 'kWh' : 'm³'}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={2}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Amount
                    </Typography>
                    <Typography variant="h6">
                      {formatCurrency(calculateUtilityAmount(reading))}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={2}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Photo
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {reading.photourl ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleViewImage(reading.photourl)}
                          startIcon={<FiImage />}
                        >
                          View
                        </Button>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          No photo
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>
      
      {showImageViewer && (
        <ImageViewer 
          imageUrl={selectedImage} 
          open={showImageViewer} 
          onClose={closeImageViewer} 
        />
      )}
      
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

export default UtilityBillingReview; 