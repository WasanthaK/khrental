import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-hot-toast';

const SimpleTemplateForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tableStatus, setTableStatus] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    language: 'English',
    content: 'Sample content'
  });

  // Check if the table exists on component mount
  useEffect(() => {
    const checkTable = async () => {
      try {
        console.log('Checking agreement_templates table');
        const { data, error } = await supabase
          .from('agreement_templates')
          .select('id, name')
          .limit(1);
        
        if (error) {
          console.error('Table check error:', error);
          setTableStatus({
            exists: false,
            error: error.message
          });
        } else {
          console.log('Table exists, sample data:', data);
          setTableStatus({
            exists: true,
            sampleData: data
          });
        }
      } catch (err) {
        console.error('Exception checking table:', err);
        setTableStatus({
          exists: false,
          error: err.message
        });
      }
    };
    
    checkTable();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      console.log('Submitting simple template form:', formData);
      
      if (!formData.name) {
        toast.error('Template name is required');
        return;
      }
      
      // Generate UUID using a more compatible approach
      const id = self.crypto?.randomUUID ? 
        self.crypto.randomUUID() : 
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0, 
                v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      
      console.log('Generated ID:', id);
      
      // Add timestamps
      const now = new Date().toISOString();
      
      // Simple direct insert - avoiding any complex logic
      const { data, error } = await supabase
        .from('agreement_templates')
        .insert({
          id,
          name: formData.name,
          language: formData.language || 'English',
          content: formData.content || 'Sample content',
          version: '1.0',
          createdat: now,
          updatedat: now
        });
      
      console.log('Insert result:', { data, error });
      
      if (error) {
        console.error('Error saving template:', error);
        toast.error(error.message || 'Failed to create template');
      } else {
        toast.success('Template created successfully!');
        navigate('/dashboard/agreements/templates');
      }
    } catch (err) {
      console.error('Exception while saving template:', err);
      toast.error(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Add direct API call method
  const handleDirectApiSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('Using direct API call');
      
      if (!formData.name) {
        toast.error('Template name is required');
        return;
      }
      
      // Generate UUID
      const id = self.crypto?.randomUUID ? 
        self.crypto.randomUUID() : 
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0, 
                v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      
      // Add timestamps
      const now = new Date().toISOString();
      
      // Prepare data
      const payload = {
        id,
        name: formData.name,
        language: formData.language || 'English',
        content: formData.content || 'Sample content',
        version: '1.0',
        createdat: now,
        updatedat: now
      };
      
      // Direct POST to the API
      const response = await fetch(
        'https://enadocapp.supabase.co/rest/v1/agreement_templates', 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(payload)
        }
      );
      
      console.log('API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      toast.success('Template created via direct API!');
      navigate('/dashboard/agreements/templates');
    } catch (err) {
      console.error('Direct API error:', err);
      toast.error(err.message || 'Direct API failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded shadow-md mt-10">
      <h1 className="text-xl font-bold mb-6">Simple Template Form (Debug)</h1>
      
      {/* Display table status */}
      <div className="mb-6 p-4 border rounded">
        <h2 className="font-bold mb-2">Database Status:</h2>
        {tableStatus === null ? (
          <p className="text-gray-500">Checking database...</p>
        ) : tableStatus.exists ? (
          <div className="text-green-600">
            <p>✅ Table exists</p>
            <p className="text-xs mt-1">Sample data count: {tableStatus.sampleData?.length || 0}</p>
          </div>
        ) : (
          <div className="text-red-600">
            <p>❌ Table error</p>
            <p className="text-xs mt-1">{tableStatus.error}</p>
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Template Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Language</label>
          <select
            name="language"
            value={formData.language}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="English">English</option>
            <option value="Sinhala">Sinhala</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-4 mt-6">
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => navigate('/dashboard/agreements/templates')}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              Cancel
            </button>
            
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Template'}
            </button>
          </div>
          
          <button
            type="button"
            onClick={handleDirectApiSubmit}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Try Direct API'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SimpleTemplateForm; 