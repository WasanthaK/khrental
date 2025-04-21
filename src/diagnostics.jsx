import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { SnackbarProvider } from './contexts/SnackbarContext';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import EmailDiagnostic from './components/diagnostics/EmailDiagnostic';
import './index.css';
import { Container, Typography, Box } from '@mui/material';

// Load environment variables
import './env-config';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Email Diagnostics
          </Typography>
          <Typography variant="body1">
            Use this tool to test the email configuration and invitation system.
          </Typography>
        </Box>
        <EmailDiagnostic />
      </Container>
    </ThemeProvider>
  </React.StrictMode>
); 