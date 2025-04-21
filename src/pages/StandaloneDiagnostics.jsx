import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { testEmailConfiguration } from '../services/directEmailService';
import { inviteUser } from '../services/invitationService';
import { getAppBaseUrl } from '../utils/env';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import '../index.css';
import { Container, Typography, Box, Button, TextField, Radio, RadioGroup, FormControlLabel, Paper, CircularProgress, Alert } from '@mui/material';

// Load environment variables
import '../env-config';

// Create a simple theme instead of importing one
const theme = createTheme({
  palette: {
    primary: {
      main: '#3f51b5',
    },
    secondary: {
      main: '#f50057',
    },
  },
});

// A standalone version of the email diagnostic component
const StandaloneDiagnostic = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [testType, setTestType] = useState('config');
  
  const runConfigTest = async () => {
    setLoading(true);
    setResults(null);
    
    try {
      const configResults = await testEmailConfiguration();
      console.log('Config test results:', configResults);
      setResults({
        type: 'config',
        data: configResults
      });
    } catch (error) {
      console.error('Config test error:', error);
      setResults({
        type: 'config',
        error: error.message,
        stack: error.stack
      });
    } finally {
      setLoading(false);
    }
  };

  const runInviteTest = async () => {
    if (!inviteEmail) {
      setResults({
        type: 'invite',
        error: 'Email is required'
      });
      return;
    }

    setLoading(true);
    setResults(null);
    
    try {
      // Create a test user just for diagnostic purposes
      const testUser = {
        id: `test_${Date.now()}`,
        email: inviteEmail,
        name: inviteName || 'Test User',
        role: 'staff'
      };
      
      const baseUrl = getAppBaseUrl();
      console.log('Base URL for invitation test:', baseUrl);

      const inviteResult = await inviteUser(testUser, false);
      console.log('Invite test results:', inviteResult);
      
      setResults({
        type: 'invite',
        data: inviteResult,
        user: testUser,
        baseUrl
      });
    } catch (error) {
      console.error('Invite test error:', error);
      setResults({
        type: 'invite',
        error: error.message,
        stack: error.stack
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRunTest = async () => {
    if (testType === 'config') {
      await runConfigTest();
    } else {
      await runInviteTest();
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <Paper sx={{ p: 4 }} elevation={2}>
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Email Diagnostics
          </Typography>
          <Typography variant="body1">
            Use this tool to test the email configuration and invitation system.
          </Typography>
        </Box>
        
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" mb={1}>
            Test Type:
          </Typography>
          <RadioGroup
            row
            value={testType}
            onChange={(e) => setTestType(e.target.value)}
          >
            <FormControlLabel value="config" control={<Radio />} label="Configuration Test" />
            <FormControlLabel value="invite" control={<Radio />} label="Invitation Test" />
          </RadioGroup>
        </Box>
        
        {testType === 'invite' && (
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              margin="normal"
              variant="outlined"
              placeholder="Enter email for test invitation"
            />
            <TextField
              fullWidth
              label="Name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              margin="normal"
              variant="outlined"
              placeholder="Enter name for test invitation"
            />
          </Box>
        )}
        
        <Button
          variant="contained"
          color="primary"
          onClick={handleRunTest}
          disabled={loading}
          startIcon={loading && <CircularProgress size={20} color="inherit" />}
        >
          {loading ? 'Running Test...' : 'Run Test'}
        </Button>
        
        {results && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Test Results:
            </Typography>
            
            {results.error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="subtitle1">Error: {results.error}</Typography>
                {results.stack && (
                  <Box component="pre" sx={{ mt: 1, fontSize: '0.75rem', overflowX: 'auto' }}>
                    {results.stack}
                  </Box>
                )}
              </Alert>
            ) : (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Test completed successfully!
                </Alert>
                
                {results.type === 'config' && results.data && (
                  <Box component="pre" sx={{ 
                    p: 2, 
                    bgcolor: 'grey.100', 
                    borderRadius: 1,
                    overflowX: 'auto',
                    fontSize: '0.875rem'
                  }}>
                    {JSON.stringify(results.data, null, 2)}
                  </Box>
                )}
                
                {results.type === 'invite' && results.data && (
                  <Box>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      Invitation sent to: <strong>{results.user?.email}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      Check your email for the invitation. It may take a few minutes to arrive.
                    </Typography>
                    <Box component="pre" sx={{ 
                      p: 2, 
                      bgcolor: 'grey.100', 
                      borderRadius: 1,
                      overflowX: 'auto',
                      fontSize: '0.875rem'
                    }}>
                      {JSON.stringify(results.data, null, 2)}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Container>
  );
};

// Render directly to the DOM
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <StandaloneDiagnostic />
    </ThemeProvider>
  </React.StrictMode>
);

export default StandaloneDiagnostic; 