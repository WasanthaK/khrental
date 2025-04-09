import { useState, useEffect } from 'react';
import { fetchData } from '../../services/supabaseClient';

const AgreementTemplateSelector = ({ value, onChange, selectedTemplate, language = 'English', error }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [templateError, setTemplateError] = useState(null);
  
  // Use either value or selectedTemplate prop (for backward compatibility)
  const selectedValue = value || selectedTemplate || '';
  
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const { data, error } = await fetchData('agreement_templates', {
          filters: [{ column: 'language', operator: 'eq', value: language }],
        });
        
        if (error) {
          throw error;
        }
        
        setTemplates(data || []);
        
        // If we have templates and a selected value, make sure it loads properly
        if (data && data.length > 0 && selectedValue) {
          console.log('Template selector found selected template:', selectedValue);
          // Trigger onChange to load the template content
          const template = data.find(t => t.id === selectedValue);
          if (template) {
            console.log('Found matching template:', template.name);
          }
        }
      } catch (error) {
        console.error('Error fetching agreement templates:', error.message);
        setTemplateError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTemplates();
  }, [language, selectedValue]);
  
  if (loading) {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Agreement Template
        </label>
        <div className="animate-pulse bg-gray-200 h-10 rounded"></div>
      </div>
    );
  }
  
  if (templateError) {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Agreement Template
        </label>
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded">
          Error loading templates: {templateError}
        </div>
      </div>
    );
  }
  
  return (
    <div className="mb-4">
      <label htmlFor="template" className="block text-sm font-medium text-gray-700 mb-1">
        Agreement Template <span className="text-red-500">*</span>
      </label>
      <select
        id="template"
        value={selectedValue}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border ${
          error ? 'border-red-500' : 'border-gray-300'
        } rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
        required
      >
        <option value="">Select a template</option>
        {templates.map(template => (
          <option key={template.id} value={template.id}>
            {template.name || `Template #${template.id.substring(0, 8)}`} (v{template.version})
          </option>
        ))}
      </select>
      {templates.length === 0 && (
        <p className="mt-1 text-sm text-yellow-600">
          No templates available. Please create a template first.
        </p>
      )}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default AgreementTemplateSelector; 