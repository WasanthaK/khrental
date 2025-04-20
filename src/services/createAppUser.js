import { supabase } from './supabaseClient';

/**
 * Helper to ensure valid timestamps on records
 */
export const ensureValidTimestamps = (record) => {
  if (!record) { return record; }
  
  const now = new Date().toISOString();
  return {
    ...record,
    createdat: record.createdat || now,
    updatedat: record.updatedat || record.createdat || now
  };
};

/**
 * Create a new app user (staff or rentee) without sending welcome emails
 * This is a simplified version that doesn't trigger failed email notifications
 * 
 * @param {Object} userData - User data
 * @param {string} userType - 'staff' or 'rentee'
 * @returns {Promise<Object>} - Result of the creation
 */
export const createAppUser = async (userData, userType) => {
  if (!userData) {
    return { success: false, error: 'No user data provided' };
  }

  try {
    // Format data for insertion
    const now = new Date().toISOString();
    const dataToInsert = {
      ...userData,
      user_type: userType,
      createdat: now,
      updatedat: now,
      // Extract email from contact_details if not directly provided
      email: userData.email || (userData.contact_details && userData.contact_details.email) || (userData.contactDetails && userData.contactDetails.email)
    };

    // Validate email
    if (!dataToInsert.email) {
      return { success: false, error: 'Email is required' };
    }

    const { data, error } = await supabase
      .from('app_users')
      .insert(dataToInsert)
      .select('*')
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: ensureValidTimestamps(data) };
  } catch (error) {
    console.error('Error in createAppUser:', error);
    return { success: false, error: error.message };
  }
}; 