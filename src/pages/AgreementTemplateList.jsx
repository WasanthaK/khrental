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
    if (!templateToDelete) return;
    
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
    } catch (error) {
      console.error('Error deleting template:', error.message);
      setError(error.message);
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Agreement Templates</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              console.log('Navigating to template creation form');
              navigate('/dashboard/agreements/templates/new');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Template
          </button>
          <a 
            href="/dashboard/agreements/templates/new"
            target="_self"
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded flex items-center"
          >
            Direct Link
          </a>
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
      
      {/* Templates Table */}
      {filteredTemplates.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
                          // Specific validation for Version 4 UUIDs generated by PostgreSQL's gen_random_uuid()
                          // Version 4 UUIDs have the form: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
                          // where x is any hexadecimal digit and y is one of 8, 9, a, or b
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
                          // Specific validation for Version 4 UUIDs generated by PostgreSQL's gen_random_uuid()
                          // Version 4 UUIDs have the form: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
                          // where x is any hexadecimal digit and y is one of 8, 9, a, or b
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