import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { sendInvitation } from '../../services/invitation';

/**
 * Debug component to test various invitation methods
 */
const InvitationTest = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [userType, setUserType] = useState('rentee');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState('standard'); // standard or direct
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');
    setError('');
    
    try {
      // First, create a user record
      const { data: newUser, error: createError } = await supabase
        .from('app_users')
        .insert({
          email: email.toLowerCase(),
          name: name,
          user_type: userType,
          invited: false,
          createdat: new Date().toISOString(),
          updatedat: new Date().toISOString()
        })
        .select();
      
      if (createError) {
        throw new Error(`Error creating user: ${createError.message}`);
      }
      
      setStatus(`Created app_user with ID: ${newUser[0].id}`);
      
      // Now send the invitation
      if (method === 'standard') {
        // Use the standard invitation service
        const result = await sendInvitation(
          email,
          name,
          userType,
          newUser[0].id
        );
        
        if (!result.success) {
          throw new Error(`Invitation failed: ${result.error}`);
        }
        
        setStatus(prev => `${prev}\nSent invitation via standard method. ${result.message}`);
      } else if (method === 'direct') {
        // Use direct Supabase auth method
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            data: {
              name,
              role: userType === 'staff' ? 'staff' : 'rentee',
              user_type: userType,
              app_user_id: newUser[0].id
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?type=invite&userId=${newUser[0].id}`
          }
        });
        
        if (otpError) {
          throw new Error(`Direct invitation failed: ${otpError.message}`);
        }
        
        setStatus(prev => `${prev}\nSent invitation via direct Supabase method.`);
      }
      
    } catch (error) {
      console.error('Invitation test error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ 
      maxWidth: '600px', 
      margin: '0 auto', 
      padding: '20px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px'
    }}>
      <h2>Invitation Test Tool</h2>
      <p>Use this tool to test the invitation process</p>
      
      <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email:</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid #ddd' 
            }}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Name:</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid #ddd' 
            }}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>User Type:</label>
          <select
            value={userType}
            onChange={e => setUserType(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid #ddd' 
            }}
          >
            <option value="rentee">Rentee</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Method:</label>
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid #ddd' 
            }}
          >
            <option value="standard">Standard (Invitation Service)</option>
            <option value="direct">Direct (Supabase Auth)</option>
          </select>
        </div>
        
        <button 
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 15px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </form>
      
      {status && (
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          backgroundColor: '#e6f7e6', 
          borderRadius: '4px',
          whiteSpace: 'pre-line'
        }}>
          <strong>Status:</strong>
          <div>{status}</div>
        </div>
      )}
      
      {error && (
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          backgroundColor: '#ffeeee', 
          borderRadius: '4px' 
        }}>
          <strong>Error:</strong>
          <div>{error}</div>
        </div>
      )}
    </div>
  );
};

export default InvitationTest; 