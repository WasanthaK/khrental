import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import { Card, Row, Col, Button, Table, Badge, Alert } from 'react-bootstrap';
import { getAppBaseUrl, ENV } from '../utils/env';

/**
 * Debug page for authentication issues
 */
const AuthDebug = () => {
  const { user, loading } = useAuth();
  const [session, setSession] = useState(null);
  const [envVars, setEnvVars] = useState({});
  const [authSettings, setAuthSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get current session
    const getCurrentSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error getting session:', error);
        setError(error.message);
      } else {
        setSession(data.session);
      }
    };

    // Get environment variables
    const getEnvVars = () => {
      const env = {
        // Check different ways env vars might be accessed
        windowEnv: window._env_ || {},
        importMetaEnv: typeof import.meta !== 'undefined' ? import.meta.env || {} : {},
        processEnv: typeof process !== 'undefined' ? process.env || {} : {},
      };

      // Collect auth-related environment variables
      const authEnv = {
        SUPABASE_URL: getEnvValue('SUPABASE_URL', env),
        SUPABASE_ANON_KEY: getEnvValue('SUPABASE_ANON_KEY', env)?.substring(0, 10) + '...',
        SITE_URL: getEnvValue('SITE_URL', env),
        APP_URL: getEnvValue('APP_URL', env),
        API_URL: getEnvValue('API_URL', env),
        NODE_ENV: getEnvValue('NODE_ENV', env),
        BASE_URL: getEnvValue('BASE_URL', env),
        PUBLIC_URL: getEnvValue('PUBLIC_URL', env),
      };

      setEnvVars(authEnv);
    };

    getCurrentSession();
    getEnvVars();
  }, []);

  // Helper to get env value from different possible sources
  const getEnvValue = (key, env) => {
    return env.windowEnv[key] || 
           env.importMetaEnv[key] || 
           env.importMetaEnv[`VITE_${key}`] || 
           env.processEnv[key] || 
           env.processEnv[`REACT_APP_${key}`] || 
           null;
  };

  const testRedirect = () => {
    window.location.href = supabase.auth.getUrl().redirectTo('/');
  };

  const logoutAndRedirect = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="container my-4">
      <h1>Authentication Debug</h1>
      
      {error && <Alert variant="danger">{error}</Alert>}
      
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <h5>Auth Status</h5>
            </Card.Header>
            <Card.Body>
              <p>
                <strong>Auth State:</strong>{' '}
                {loading ? (
                  <Badge bg="secondary">Loading...</Badge>
                ) : user ? (
                  <Badge bg="success">Authenticated</Badge>
                ) : (
                  <Badge bg="danger">Not Authenticated</Badge>
                )}
              </p>
              {user && (
                <>
                  <p><strong>User ID:</strong> {user.id}</p>
                  <p><strong>Email:</strong> {user.email}</p>
                  <p><strong>Role:</strong> {user.role || 'N/A'}</p>
                </>
              )}
              <div className="mt-3">
                <Button variant="outline-primary" size="sm" className="me-2" onClick={testRedirect}>
                  Test Redirect
                </Button>
                <Button variant="outline-danger" size="sm" onClick={logoutAndRedirect}>
                  Logout
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <h5>Environment Variables</h5>
            </Card.Header>
            <Card.Body>
              <Table striped bordered hover size="sm">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(envVars).map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{value || <em>not set</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card>
            <Card.Header>
              <h5>Session Information</h5>
            </Card.Header>
            <Card.Body>
              {session ? (
                <>
                  <p><strong>Access Token:</strong> {session.access_token.substring(0, 15)}...</p>
                  <p><strong>Refresh Token:</strong> {session.refresh_token?.substring(0, 15)}...</p>
                  <p><strong>Expires At:</strong> {new Date(session.expires_at * 1000).toLocaleString()}</p>
                  
                  <div className="mt-3">
                    <h6>User Info from Session:</h6>
                    <pre className="bg-light p-2">
                      {JSON.stringify(session.user, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <p>No active session found.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="mt-4 text-center">
        <p>
          <small className="text-muted">
            Current URL: {window.location.href}
          </small>
        </p>
      </div>
    </div>
  );
};

export default AuthDebug; 