/**
 * Agreement Hook
 * Provides reusable logic for handling agreement data
 */
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-toastify';

/**
 * Hook for loading and managing agreement data
 * @param {string} agreementId - ID of the agreement to load
 * @returns {Object} Agreement data and status
 */
export const useAgreement = (agreementId) => {
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load agreement data
  useEffect(() => {
    if (!agreementId) return;
    
    const fetchAgreement = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data, error } = await supabase
          .from('agreements')
          .select(`
            *,
            property:properties(*),
            unit:property_units(*),
            rentee:app_users(*)
          `)
          .eq('id', agreementId)
          .single();
          
        if (error) throw error;
        
        setAgreement(data);
      } catch (err) {
        console.error('Error loading agreement:', err);
        setError(err.message);
        toast.error('Failed to load agreement');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAgreement();
  }, [agreementId]);
  
  // More functions could be added here
  
  return {
    agreement,
    loading,
    error,
    setAgreement
  };
};

export default useAgreement; 