import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchData, insertData, updateData } from '../services/supabaseClient';
import { createTemplateDirectly } from '../services/databaseService';
import { toast } from 'react-hot-toast';
import Tooltip from '../components/common/Tooltip';
import { supabase } from '../services/supabaseClient';
import { STORAGE_BUCKETS } from '../services/fileService';

// UI Components
import RichTextEditor from '../components/common/RichTextEditor';

const AgreementTemplateForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    language: 'English',
    content: '',
    version: '1.0',
  });
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  // Reference to the editor
  const [editorRef, setEditorRef] = useState(null);

  // Add state for expanded sections
  const [expandedSections, setExpandedSections] = useState({
    agreement: true,
    property: false,
    unit: false,
    rentee: false,
    terms: false
  });

  // Define available merge fields
  const mergeFields = {
    agreement: {
      startDate: '{{startDate}}',
      endDate: '{{endDate}}',
      currentDate: '{{currentDate}}',
      agreementId: '{{agreementId}}'
    },
    property: {
      name: '{{propertyName}}',
      address: '{{propertyAddress}}',
      type: '{{propertyType}}',
      squareFeet: '{{propertySquareFeet}}',
      yearBuilt: '{{propertyYearBuilt}}',
      amenities: '{{propertyAmenities}}',
      bankName: '{{propertyBankName}}',
      bankBranch: '{{propertyBankBranch}}',
      bankAccountNumber: '{{propertyBankAccount}}'
    },
    unit: {
      number: '{{unitNumber}}',
      floor: '{{unitFloor}}',
      bedrooms: '{{unitBedrooms}}',
      bathrooms: '{{unitBathrooms}}',
      squareFeet: '{{unitSquareFeet}}',
      description: '{{unitDescription}}',
      bankName: '{{unitBankName}}',
      bankBranch: '{{unitBankBranch}}',
      bankAccountNumber: '{{unitBankAccount}}'
    },
    rentee: {
      name: '{{renteeName}}',
      email: '{{renteeEmail}}',
      phone: '{{renteePhone}}',
      permanentAddress: '{{renteePermanentAddress}}',
      nationalId: '{{renteeNationalId}}',
      id: '{{renteeId}}'
    },
    terms: {
      monthlyRent: '{{monthlyRent}}',
      depositAmount: '{{depositAmount}}',
      paymentDueDay: '{{paymentDueDay}}',
      noticePeriod: '{{noticePeriod}}',
      specialConditions: '{{specialConditions}}',
      utilities: '{{utilities}}',
      parkingSpaces: '{{parkingSpaces}}',
      petPolicy: '{{petPolicy}}',
      maintenanceContact: '{{maintenanceContact}}',
      emergencyContact: '{{emergencyContact}}',
      leaseType: '{{leaseType}}',
      paymentMethods: '{{paymentMethods}}',
      lateFees: '{{lateFees}}',
      insuranceRequirements: '{{insuranceRequirements}}'
    }
  };

  // Fetch template data if in edit mode
  useEffect(() => {
    const fetchTemplateData = async () => {
      if (isEditMode) {
        try {
          setLoading(true);
          const { data, error } = await fetchData('agreement_templates', {
            filters: [{ column: 'id', operator: 'eq', value: id }],
          });
          
          if (error) {
            throw error;
          }
          
          if (data && data.length > 0) {
            const template = data[0];
            setFormData({
              name: template.name || '',
              language: template.language || 'English',
              content: template.content || '',
              version: template.version || '1.0',
             createdat: template.createdat || null,
              updatedat: template.updatedat || null,
            });
          }
        } catch (error) {
          console.error('Error fetching template data:', error.message);
          setError(error.message);
        } finally {
          setLoading(false);
        }
      }
    };
    
    fetchTemplateData();
  }, [id, isEditMode]);
  
  // Handle form input changes
  const handleInputChange = (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const { name, value } = e.target || { name: '', value: '' };
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  // Function to handle rich text editor content change
  const handleEditorContentChange = (content) => {
    setFormData(prev => ({
      ...prev,
      content
    }));
  };

  // Function to insert merge field at cursor position
  const insertMergeField = (field) => {
    if (editorRef) {
      editorRef.commands.insertContent(field);
      editorRef.commands.focus();
    }
  };

  // Add handler for merge field button to prevent form submission
  const handleMergeFieldClick = (e, field, name) => {
    e.preventDefault();
    e.stopPropagation();
    insertMergeField(field);
    toast.success(`${name} field inserted`);
  };

  // Sample data for preview
  const sampleData = {
    agreement: {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      currentDate: new Date().toLocaleDateString(),
      agreementId: 'SAMPLE-001'
    },
    property: {
      name: 'Sample Property',
      address: '123 Main St, Sample City',
      type: 'Apartment',
      squareFeet: '1200',
      yearBuilt: '2020',
      amenities: 'Pool, Gym, Parking',
      bankName: 'Sample Bank',
      bankBranch: 'Main Branch',
      bankAccountNumber: '1234567890'
    },
    unit: {
      number: 'A101',
      floor: '1st',
      bedrooms: '2',
      bathrooms: '2',
      squareFeet: '1000',
      description: 'Spacious corner unit',
      bankName: 'Unit Bank',
      bankBranch: 'Unit Branch',
      bankAccountNumber: '0987654321'
    },
    rentee: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '(555) 123-4567',
      permanentAddress: '456 Other St, Other City',
      nationalId: 'ID12345',
      id: 'RENTEE-001'
    },
    terms: {
      monthlyRent: '$1,500.00',
      depositAmount: '$3,000.00',
      paymentDueDay: '5',
      noticePeriod: '30',
      specialConditions: 'No pets allowed',
      utilities: 'Water, Electricity',
      parkingSpaces: '1',
      petPolicy: 'No pets',
      maintenanceContact: 'Maintenance Dept',
      emergencyContact: 'Emergency Services',
      leaseType: 'Standard',
      paymentMethods: 'Bank Transfer, Check',
      lateFees: '$50.00',
      insuranceRequirements: 'Renter\'s Insurance Required'
    }
  };

  // Function to generate preview with sample data
  const generatePreview = async () => {
    try {
      if (!formData.content) {
        toast.error('Please add some content before previewing');
        return;
      }

      setLoading(true);
      let previewContent = formData.content;

      // Replace all merge fields with sample data
      Object.entries(sampleData).forEach(([category, fields]) => {
        Object.entries(fields).forEach(([field, value]) => {
          const mergeField = `{{${field}}}`;
          previewContent = previewContent.replace(new RegExp(mergeField, 'g'), value);
        });
      });

      // Format the content
      const formattedContent = previewContent
        .replace(/\n/g, '<br/>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\_(.*?)\_/g, '<em>$1</em>');

      setPreviewContent(formattedContent);
      setShowPreview(true);
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      console.log('Template submission started', { 
        formData, 
        isEditMode 
      });
      
      // Validate form data
      if (!formData.name || !formData.content) {
        throw new Error('Please fill in all required fields.');
      }
      
      // Prepare data for submission with correct lowercase column names
      const templateData = {
        name: formData.name,
        language: formData.language,
        content: formData.content,
        version: formData.version,
      };
      
      console.log('Template data prepared:', templateData);
      
      // Generate a unique ID for a new template if we're not in edit mode
      const templateId = isEditMode ? id : crypto.randomUUID();
      console.log('Using template ID:', templateId);
      
      // Save to database
      let result;
      
      if (isEditMode) {
        console.log('Updating existing template with ID:', id);
        result = await updateData('agreement_templates', id, templateData);
      } else {
        // If we're creating a new template, use the generated templateId
        console.log('Creating new template with ID:', templateId);
        
        result = await insertData('agreement_templates', { 
          ...templateData, 
          id: templateId 
        });
      }
      
      console.log('Database operation result:', result);
      
      if (result.error) {
        console.error('Error saving template:', result.error);
        throw new Error(`Failed to save template: ${result.error.message || 'Unknown database error'}`);
      }
      
      // Try to upload the template content as a file only after successful DB save
      if (!result.error) {
        try {
          // Define the file path in storage - use a dedicated templates folder
          const fileName = `template_${formData.name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.html`;
          const templateFolder = `templates/${templateId}`;
          const filePath = `${templateFolder}/${fileName}`;
          
          console.log('Uploading template to storage path:', filePath);
          
          // Create a blob from the template content
          const blob = new Blob([formData.content], { type: 'text/html' });
          
          // Upload to Supabase Storage
          const { data: fileData, error: fileError } = await supabase.storage
            .from(STORAGE_BUCKETS.FILES)
            .upload(filePath, blob, {
              contentType: 'text/html',
              upsert: true
            });
          
          if (fileError) {
            console.error('Error saving template file:', fileError);
            // Don't throw here, just notify user but continue
            toast.error('Note: Template saved but file attachment failed.');
          } else {
            console.log('Template uploaded successfully:', fileData);
            
            // Get the public URL
            const { data: urlData } = supabase.storage
              .from(STORAGE_BUCKETS.FILES)
              .getPublicUrl(filePath);
            
            const publicUrl = urlData.publicUrl;
            console.log('Template public URL generated:', publicUrl);
            
            // Update the template with the file URL
            if (publicUrl) {
              const { error: urlUpdateError } = await updateData('agreement_templates', 
                isEditMode ? id : templateId, 
                { documenturl: publicUrl }
              );
              
              if (urlUpdateError) {
                console.error('Error updating template with document URL:', urlUpdateError);
              }
            }
          }
        } catch (storageError) {
          console.error('Error saving template to storage:', storageError);
          toast.error('Template saved but file attachment failed.');
          // Continue even if file storage fails
        }
      }
      
      toast.success(`Template ${isEditMode ? 'updated' : 'created'} successfully!`);
      
      // Navigate back to templates list
      console.log('Navigation to template list');
      navigate('/dashboard/agreements/templates');
      
    } catch (error) {
      console.error('Error in template creation process:', error);
      setError(error.message || 'An unexpected error occurred');
      toast.error(error.message || 'Failed to save template');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Function to toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading template data...</div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header Section */}
      <div className="mb-8 border-b pb-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? 'Edit Agreement Template' : 'Create New Agreement Template'}
          </h1>
          <button
            type="button"
            onClick={() => navigate('/dashboard/agreements/templates')}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
          >
            <i className="fas fa-arrow-left"></i>
            Back to Templates
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Create or modify agreement templates with dynamic merge fields for property and tenant information.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6" role="alert">
          <div className="flex items-center">
            <i className="fas fa-exclamation-circle text-red-400 mr-3"></i>
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form Section */}
        <div className="lg:col-span-2">
          <form 
            onSubmit={handleSubmit}
            className="agreement-template-form"
          >
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 space-y-6">
                {/* Template Details */}
                <div className="space-y-4">
                  <h2 className="text-lg font-medium text-gray-900">Template Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Template Name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="e.g., Standard Rental Agreement"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Language</label>
                      <select
                        name="language"
                        value={formData.language}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        required
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Template Content */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-medium text-gray-900">Template Content</h2>
                    <Tooltip content="See how your template looks with sample data">
                      <button
                        type="button"
                        onClick={generatePreview}
                        className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <i className="fas fa-eye mr-2"></i>
                        Preview with Sample Data
                      </button>
                    </Tooltip>
                  </div>
                  <RichTextEditor
                    content={formData.content}
                    onChange={handleEditorContentChange}
                    placeholder="Start writing your agreement template..."
                    onEditorReady={setEditorRef}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/agreements/templates')}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {submitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save mr-2"></i>
                      {isEditMode ? 'Update Template' : 'Create Template'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Merge Fields Sidebar - Always Expanded with Collapsible Sections */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Available Merge Fields</h3>
            <div className="space-y-2">
              {Object.entries(mergeFields).map(([category, fields]) => (
                <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection(category)}
                    className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                  >
                    <h4 className="text-sm font-medium text-gray-900 capitalize">
                      {category}
                      <span className="ml-2 text-gray-500 text-xs">
                        ({Object.keys(fields).length} fields)
                      </span>
                    </h4>
                    <i className={`fas fa-chevron-down text-gray-400 transition-transform duration-200 ${
                      expandedSections[category] ? 'transform rotate-180' : ''
                    }`}></i>
                  </button>
                  <div className={`transition-all duration-200 ease-in-out ${
                    expandedSections[category] ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                  }`}>
                    <div className="p-4 space-y-2 bg-white border-t border-gray-200">
                      {Object.entries(fields).map(([name, field]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={(e) => handleMergeFieldClick(e, field, name)}
                          className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between group transition-colors duration-150"
                        >
                          <span className="text-gray-700 capitalize">
                            {name.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <div className="flex items-center space-x-2">
                            <code className="text-gray-400 text-xs group-hover:text-gray-600 transition-colors duration-150">
                              {field}
                            </code>
                            <i className="fas fa-plus text-gray-400 group-hover:text-blue-500 transition-colors duration-150"></i>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-xl font-bold text-gray-900">Template Preview with Sample Data</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
              <div className="prose max-w-none">
                <div dangerouslySetInnerHTML={{ __html: previewContent }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgreementTemplateForm; 