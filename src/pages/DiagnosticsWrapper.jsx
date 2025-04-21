import React from 'react';
import ReactDOM from 'react-dom/client';
import EmailDiagnostic from '../components/diagnostics/EmailDiagnostic';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '../theme';
import '../index.css';
import { Container, Typography, Box } from '@mui/material';

// Load environment variables
import '../env-config';

// A standalone diagnostics page that doesn't rely on the router
const DiagnosticsWrapper = () => {
  return (
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
  );
};

// Render directly to the DOM
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DiagnosticsWrapper />
  </React.StrictMode>
);

export default DiagnosticsWrapper; 