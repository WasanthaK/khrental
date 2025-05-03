import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchData, deleteData } from '../services/supabaseClient';
import { formatDate } from '../utils/helpers';
import { toast } from 'react-hot-toast';

const AgreementTemplateList = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [viewMode, setViewMode] = useState('table');
  const navigate = useNavigate();
  const location = useLocation();

  // Check for error message passed from route navigation
  useEffect(() => {
    if (location.state?.error) {
      setError(location.state.error);
      toast.error(location.state.error);
      // Clear error from location state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // Set view mode based on screen width
  useEffect(() => {
    const handleResize = () => {
      setViewMode(window.innerWidth < 768 ? 'card' : 'table');
    };
    
    // Set initial value
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const { data, error } = await fetchData('agreement_templates');
        
        if (error) {
          throw error;
        }
        
        setTemplates(data || []);
      } catch (error) {
        console.error('Error fetching templates:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);

  // Filter and search templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = 
      template.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.content?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filter === 'all') return matchesSearch;
    
    // Add more filters as needed
    if (filter === 'english') return matchesSearch && template.language === 'English';
    if (filter === 'sinhala') return matchesSearch && template.language === 'Sinhala';
    
    return matchesSearch;
  });

  const handleDeleteClick = (template) => {
    setTemplateToDelete(template);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) {
      return;
    }
    
    try {
      setLoading(true);
      const { error } = await deleteData('agreement_templates', templateToDelete.id);
      
      if (error) {
        throw error;
      }
      
      // Remove the deleted template from the state
      setTemplates(templates.filter(t => t.id !== templateToDelete.id));
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
      toast.success("Template deleted successfully");
    } catch (error) {
      console.error('Error deleting template:', error.message);
      setError(error.message);
      toast.error(`Failed to delete template: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Agreement Templates</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              console.log('Navigating to template creation form');
              navigate('/dashboard/agreements/templates/new');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Template
          </button>
          <div className="flex items-center ml-auto sm:ml-0">
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded ${viewMode === 'card' ? 'bg-gray-200' : 'bg-white'}`}
              title="Card View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded ${viewMode === 'table' ? 'bg-gray-200' : 'bg-white'}`}
              title="Table View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Search and Filter */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              id="search"
              placeholder="Search by name or content"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="md:w-48">
            <label htmlFor="filter" className="block text-sm font-medium text-gray-700 mb-1">
              Filter
            </label>
            <select
              id="filter"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Templates</option>
              <option value="english">English</option>
              <option value="sinhala">Sinhala</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Templates - Table View for desktop */}
      {filteredTemplates.length > 0 ? (
        <>
          {viewMode === 'table' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Language
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Version
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTemplates.map((template) => (
                      <tr key={template.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {template.name || `Template #${template.id.substring(0, 8)}`}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{template.language}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">v{template.version}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{formatDate(template.createdat)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-3">
                            <Link
                              to={`/dashboard/agreements/templates/${template.id}`}
                              className="text-blue-600 hover:text-blue-900"
                              onClick={(e) => {
                                const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                                if (!uuidV4Regex.test(template.id)) {
                                  e.preventDefault();
                                  toast.error(`Invalid template ID format: ${template.id}. Expected a valid UUID v4.`);
                                }
                              }}
                            >
                              View
                            </Link>
                            <Link
                              to={`/dashboard/agreements/templates/${template.id}/edit`}
                              className="text-indigo-600 hover:text-indigo-900"
                              onClick={(e) => {
                                const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                                if (!uuidV4Regex.test(template.id)) {
                                  e.preventDefault();
                                  toast.error(`Invalid template ID format: ${template.id}. Expected a valid UUID v4.`);
                                }
                              }}
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDeleteClick(template)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Card View for mobile */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <div key={template.id} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="p-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {template.name || `Template #${template.id.substring(0, 8)}`}
                    </h3>
                    <div className="flex justify-between items-center mb-3">
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {template.language}
                      </span>
                      <span className="text-xs text-gray-500">v{template.version}</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      Created: {formatDate(template.createdat)}
                    </p>
                    <div className="flex justify-between border-t pt-4">
                      <Link
                        to={`/dashboard/agreements/templates/${template.id}`}
                        className="text-blue-600 hover:text-blue-900 text-sm"
                      >
                        View
                      </Link>
                      <Link
                        to={`/dashboard/agreements/templates/${template.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900 text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDeleteClick(template)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-gray-50 p-6 rounded-lg text-center">
          <p className="text-gray-600">No templates found. {searchTerm && 'Try adjusting your search.'}</p>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && templateToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete the template "{templateToDelete.name || `Template #${templateToDelete.id.substring(0, 8)}`}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setTemplateToDelete(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgreementTemplateList; 