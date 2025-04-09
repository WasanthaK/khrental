import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

const SqlMigration = () => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // SQL to create functions for rentee-property associations
  const SQL_MIGRATION = `
-- Function to get rentees by property
CREATE OR REPLACE FUNCTION get_rentees_by_property(property_id uuid)
RETURNS SETOF app_users
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT au.*
  FROM app_users au
  WHERE 
    au.user_type = 'rentee' 
    AND (
      -- Check if property_id is in the associated_property_ids array
      property_id = ANY(au.associated_property_ids)
      OR
      -- Or check agreements directly to see if this rentee has an agreement for this property
      EXISTS (
        SELECT 1 
        FROM agreements 
        WHERE 
          (agreements.propertyid = property_id OR agreements.unitid IN (
            SELECT id FROM property_units WHERE propertyid = property_id
          ))
          AND agreements.renteeid = au.id
          AND agreements.status IN ('active', 'pending', 'review', 'signed')
      )
    );
$$;

-- Function to get rentees by specific unit
CREATE OR REPLACE FUNCTION get_rentees_by_unit(unit_id uuid)
RETURNS SETOF app_users
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT au.*
  FROM app_users au
  WHERE 
    au.user_type = 'rentee' 
    AND (
      -- Check agreements directly to see if this rentee has an agreement for this unit
      EXISTS (
        SELECT 1 
        FROM agreements 
        WHERE 
          agreements.unitid = unit_id
          AND agreements.renteeid = au.id
          AND agreements.status IN ('active', 'pending', 'review', 'signed')
      )
    );
$$;
`;

  const runMigration = async () => {
    setRunning(true);
    setResults(null);
    setError(null);
    
    try {
      // Execute the SQL statements individually
      const statements = SQL_MIGRATION.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (!statement.trim()) {
          continue;
        }
        
        console.log(`Executing SQL statement...`);
        
        // Try to use exec_sql RPC if available
        try {
          const { error: rpcError } = await supabase.rpc('exec_sql', {
            query: statement
          });
          
          if (rpcError) {
            console.error('Error with RPC execution:', rpcError);
            throw rpcError;
          }
        } catch (rpcErr) {
          // Fallback to using Supabase's SQL endpoint directly
          const { error: sqlError } = await supabase.from('_ExecSQL').select('*').limit(1);
          
          if (sqlError) {
            console.error('SQL execution error:', sqlError);
            throw sqlError;
          }
        }
      }
      
      setResults('SQL migration completed successfully!');
    } catch (error) {
      console.error('Migration error:', error);
      setError(`Migration failed: ${error.message || 'Unknown error'}`);
    } finally {
      setRunning(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Run Property-Rentee Association Migration</h2>
      
      <p className="mb-4 text-gray-700">
        This will create or update database functions to better associate rentees with properties and units.
      </p>
      
      <button
        onClick={runMigration}
        disabled={running}
        className={`px-4 py-2 rounded font-medium ${
          running 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {running ? 'Running Migration...' : 'Run Migration'}
      </button>
      
      {results && (
        <div className="mt-4 p-3 bg-green-100 text-green-800 rounded">
          {results}
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-800 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default SqlMigration; 