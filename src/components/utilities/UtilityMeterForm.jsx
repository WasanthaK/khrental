import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  Alert,
  Snackbar
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FiDroplet, FiZap, FiCalendar, FiUpload, FiSave } from 'react-icons/fi';
import { supabase } from '../../services/supabaseClient';
import { UTILITY_TYPES } from '../../utils/constants';
import ImageUploader from '../common/ImageUploader';

/**
 * Reusable component for submitting utility meter readings
 * @param {object} props 
 * @param {string} props.propertyId - ID of the property (required)
 * @param {string} props.unitId - ID of the unit (optional, only for apartments)
 * @param {string} props.renteeId - ID of the rentee (required)
 * @param {function} props.onSubmitSuccess - Callback function on successful submission
 * @param {function} props.onCancel - Callback function on cancel
 * @param {object} props.previousReadings - Previous readings data (optional)
 */
const UtilityMeterForm = ({
  propertyId,
  unitId,
  renteeId,
  onSubmitSuccess,
  onCancel,
  previousReadings
}) => {
  const theme = useTheme();
  
  const [formData, setFormData] = useState({
    utilityType: '',
    currentReading: '',
    readingDate: new Date().toISOString().split('T')[0],
    photoUrl: null
  });
  
  const [previousReading, setPreviousReading] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [alert, setAlert] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  
  useEffect(() => {
    // Reset previous reading when utility type changes
    if (formData.utilityType && previousReadings) {
      const lastReading = previousReadings.find(
        reading => reading.utilitytype === formData.utilityType
      );
      
      setPreviousReading(lastReading || null);
    } else {
      setPreviousReading(null);
    }
  }, [formData.utilityType, previousReadings]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field if it exists
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };
  
  const handleImageUpload = async (file) => {
    if (!file) {
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Generate a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `utility_readings/${fileName}`;
      
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            setUploadProgress(progress);
          }
        });
      
      if (error) {
        throw error;
      }
      
      // Get public URL for the file
      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);
      
      setFormData(prev => ({
        ...prev,
        photoUrl: urlData.publicUrl
      }));
      
      setIsUploading(false);
      setUploadProgress(0);
    } catch (error) {
      console.error('Error uploading image:', error);
      showAlert('Failed to upload image', 'error');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.utilityType) {
      newErrors.utilityType = 'Utility type is required';
    }
    
    if (!formData.currentReading) {
      newErrors.currentReading = 'Current reading is required';
    } else if (isNaN(formData.currentReading) || parseFloat(formData.currentReading) <= 0) {
      newErrors.currentReading = 'Reading must be a positive number';
    } else if (previousReading && parseFloat(formData.currentReading) < parseFloat(previousReading.currentreading)) {
      newErrors.currentReading = 'Current reading cannot be less than the previous reading';
    }
    
    if (!formData.readingDate) {
      newErrors.readingDate = 'Reading date is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateForm()) {
      showAlert('Please fix the errors before submitting', 'error');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prepare data for submission
      const readingData = {
        renteeid: renteeId,
        propertyid: propertyId,
        unitid: unitId || null,
        utilitytype: formData.utilityType,
        previousreading: previousReading ? previousReading.currentreading : null,
        currentreading: parseFloat(formData.currentReading),
        readingdate: new Date(formData.readingDate).toISOString(),
        photourl: formData.photoUrl,
        status: 'pending'
      };
      
      // Submit to Supabase
      const { data, error } = await supabase
        .from('utility_readings')
        .insert(readingData)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      showAlert('Reading submitted successfully', 'success');
      
      // Call callback function if provided
      if (onSubmitSuccess) {
        onSubmitSuccess(data);
      }
      
      // Reset form
      setFormData({
        utilityType: '',
        currentReading: '',
        readingDate: new Date().toISOString().split('T')[0],
        photoUrl: null
      });
    } catch (error) {
      console.error('Error submitting reading:', error);
      showAlert('Failed to submit reading', 'error');
    } finally {
      setIsSubmitting(false);
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
  
  const getUtilityIcon = (type) => {
    if (type === UTILITY_TYPES.ELECTRICITY) {
      return <FiZap />;
    } else if (type === UTILITY_TYPES.WATER) {
      return <FiDroplet />;
    }
    return null;
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" gutterBottom>
        Submit Utility Reading
      </Typography>
      
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl 
              fullWidth 
              error={!!errors.utilityType}
              variant="outlined"
            >
              <InputLabel id="utility-type-label">Utility Type</InputLabel>
              <Select
                labelId="utility-type-label"
                id="utilityType"
                name="utilityType"
                value={formData.utilityType}
                onChange={handleInputChange}
                label="Utility Type"
                startAdornment={
                  formData.utilityType ? (
                    <InputAdornment position="start">
                      {getUtilityIcon(formData.utilityType)}
                    </InputAdornment>
                  ) : null
                }
                disabled={isSubmitting}
              >
                <MenuItem value={UTILITY_TYPES.ELECTRICITY}>Electricity</MenuItem>
                <MenuItem value={UTILITY_TYPES.WATER}>Water</MenuItem>
              </Select>
              {errors.utilityType && <FormHelperText>{errors.utilityType}</FormHelperText>}
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Reading Date"
              name="readingDate"
              type="date"
              value={formData.readingDate}
              onChange={handleInputChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <FiCalendar />
                  </InputAdornment>
                )
              }}
              InputLabelProps={{
                shrink: true
              }}
              error={!!errors.readingDate}
              helperText={errors.readingDate}
              disabled={isSubmitting}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Current Reading"
              name="currentReading"
              type="number"
              value={formData.currentReading}
              onChange={handleInputChange}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    {formData.utilityType === UTILITY_TYPES.ELECTRICITY ? 'kWh' : 'm³'}
                  </InputAdornment>
                )
              }}
              error={!!errors.currentReading}
              helperText={errors.currentReading}
              disabled={isSubmitting}
            />
            
            {previousReading && (
              <FormHelperText>
                Previous reading: {previousReading.currentreading} {' '}
                {previousReading.utilitytype === UTILITY_TYPES.ELECTRICITY ? 'kWh' : 'm³'} 
                {' on '} 
                {new Date(previousReading.readingdate).toLocaleDateString()}
              </FormHelperText>
            )}
          </Grid>
          
          <Grid item xs={12}>
            <Typography variant="subtitle1" gutterBottom>
              Upload Meter Reading Photo
            </Typography>
            
            <ImageUploader
              currentImage={formData.photoUrl}
              onImageSelected={handleImageUpload}
              disabled={isSubmitting || isUploading}
              uploadProgress={uploadProgress}
              isUploading={isUploading}
            />
            
            {errors.photoUrl && (
              <FormHelperText error>{errors.photoUrl}</FormHelperText>
            )}
          </Grid>
          
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isSubmitting || isUploading}
                startIcon={isSubmitting ? <CircularProgress size={20} /> : <FiSave />}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Reading'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </form>
      
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
    </Paper>
  );
};

export default UtilityMeterForm; 