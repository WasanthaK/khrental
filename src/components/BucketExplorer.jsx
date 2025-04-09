import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';

const BucketExplorer = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [files, setFiles] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [fileSizeLimit, setFileSizeLimit] = useState(50); // Default 50MB
  
  // Test section states
  const [testFile, setTestFile] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState(null);

  // Load buckets when user is authenticated
  useEffect(() => {
    if (user) {
      loadBuckets();
    } else {
      setBuckets([]);
      setSelectedBucket(null);
      setFiles([]);
    }
  }, [user]);

  // Load files when bucket is selected
  useEffect(() => {
    if (selectedBucket && user) {
      loadFiles(selectedBucket);
    }
  }, [selectedBucket, user]);

  const loadBuckets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No auth session found');
      }

      const { data: buckets, error } = await supabase.storage.listBuckets();
      
      if (error) {
        throw error;
      }

      console.log('Loaded buckets:', buckets);
      setBuckets(buckets || []);
      
      // Auto-select first bucket if available
      if (buckets && buckets.length > 0 && !selectedBucket) {
        setSelectedBucket(buckets[0].name);
      }
    } catch (err) {
      console.error('Error loading buckets:', err);
      setError(err.message);
      setBuckets([]);
    } finally {
      setLoading(false);
    }
  };

  const createBucket = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      // Create the bucket
      const { data: bucket, error: createError } = await supabase.storage.createBucket(newBucketName, {
        public: isPublic,
        fileSizeLimit: fileSizeLimit * 1024 * 1024, // Convert MB to bytes
      });

      if (createError) {
        throw createError;
      }

      console.log('Created bucket:', bucket);
      
      // Reset form
      setNewBucketName('');
      setIsPublic(false);
      setFileSizeLimit(50);
      setShowCreateForm(false);
      
      // Refresh bucket list
      await loadBuckets();
      
      // Select the new bucket
      setSelectedBucket(newBucketName);
    } catch (err) {
      console.error('Error creating bucket:', err);
      setError(err.message || 'Failed to create bucket');
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async (bucketName) => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No auth session found');
      }

      const { data: files, error } = await supabase.storage
        .from(bucketName)
        .list();
      
      if (error) {
        throw error;
      }

      // Filter out .keep files used for folder structure
      const filteredFiles = files?.filter(file => !file.name.endsWith('.keep')) || [];
      console.log('Loaded files:', filteredFiles);
      setFiles(filteredFiles);
    } catch (err) {
      console.error('Error loading files:', err);
      setError(err.message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const getFileUrl = (bucketName, fileName) => {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    return data?.publicUrl;
  };

  const runStorageTests = async () => {
    if (!selectedBucket) {
      setTestError('Please select a bucket first');
      return;
    }

    setTestLoading(true);
    setTestError(null);
    setTestResults([]);

    try {
      const results = [];
      
      // Test 1: Check bucket permissions
      results.push({
        name: 'Bucket Permissions',
        status: 'running'
      });
      
      const { data: bucketData, error: bucketError } = await supabase.storage
        .from(selectedBucket)
        .list();
      
      if (bucketError) {
        results[results.length - 1] = {
          name: 'Bucket Permissions',
          status: 'failed',
          error: bucketError.message
        };
        throw bucketError;
      }
      
      results[results.length - 1] = {
        name: 'Bucket Permissions',
        status: 'success',
        message: 'Successfully accessed bucket'
      };

      // Test 2: Upload test file
      results.push({
        name: 'File Upload',
        status: 'running'
      });

      if (!testFile) {
        results[results.length - 1] = {
          name: 'File Upload',
          status: 'failed',
          error: 'No file selected'
        };
        throw new Error('No file selected');
      }

      const fileName = `test-${Date.now()}-${testFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(selectedBucket)
        .upload(fileName, testFile);

      if (uploadError) {
        results[results.length - 1] = {
          name: 'File Upload',
          status: 'failed',
          error: uploadError.message
        };
        throw uploadError;
      }

      results[results.length - 1] = {
        name: 'File Upload',
        status: 'success',
        message: `Successfully uploaded ${fileName}`
      };

      // Test 3: Get public URL
      results.push({
        name: 'Public URL Access',
        status: 'running'
      });

      const { data: urlData } = supabase.storage
        .from(selectedBucket)
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        results[results.length - 1] = {
          name: 'Public URL Access',
          status: 'failed',
          error: 'Failed to get public URL'
        };
        throw new Error('Failed to get public URL');
      }

      results[results.length - 1] = {
        name: 'Public URL Access',
        status: 'success',
        message: 'Successfully generated public URL'
      };

      // Test 4: Delete test file
      results.push({
        name: 'File Deletion',
        status: 'running'
      });

      const { error: deleteError } = await supabase.storage
        .from(selectedBucket)
        .remove([fileName]);

      if (deleteError) {
        results[results.length - 1] = {
          name: 'File Deletion',
          status: 'failed',
          error: deleteError.message
        };
        throw deleteError;
      }

      results[results.length - 1] = {
        name: 'File Deletion',
        status: 'success',
        message: 'Successfully deleted test file'
      };

      // Test 5: Check bucket policies
      results.push({
        name: 'Bucket Policies',
        status: 'running'
      });

      const { data: policies, error: policiesError } = await supabase
        .from('storage.policies')
        .select('*')
        .eq('bucket_id', selectedBucket);

      if (policiesError) {
        results[results.length - 1] = {
          name: 'Bucket Policies',
          status: 'failed',
          error: policiesError.message
        };
        throw policiesError;
      }

      results[results.length - 1] = {
        name: 'Bucket Policies',
        status: 'success',
        message: `Found ${policies?.length || 0} policies`
      };

      setTestResults(results);
      await loadFiles(selectedBucket); // Refresh file list
    } catch (err) {
      console.error('Test error:', err);
      setTestError(err.message || 'Failed to complete tests');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Storage Explorer</h1>
      
      {!user && (
        <div className="text-red-600 mb-4">
          Please log in to access storage.
        </div>
      )}

      {error && (
        <div className="text-red-600 mb-4">
          Error: {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        {/* Bucket list */}
        <div className="w-full md:w-64 bg-gray-100 p-4 rounded">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Buckets</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
              disabled={!user}
            >
              {showCreateForm ? 'Cancel' : 'Create Bucket'}
            </button>
          </div>
          
          {showCreateForm && (
            <form onSubmit={createBucket} className="mb-4 p-4 bg-white rounded shadow">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Enter bucket name"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File Size Limit (MB)
                </label>
                <input
                  type="number"
                  value={fileSizeLimit}
                  onChange={(e) => setFileSizeLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded"
                  min="1"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Public Bucket
                  </span>
                </label>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Bucket'}
              </button>
            </form>
          )}
          
          {loading && buckets.length === 0 ? (
            <div className="animate-pulse">Loading buckets...</div>
          ) : buckets.length === 0 ? (
            <div className="text-yellow-700">No buckets found</div>
          ) : (
            <ul className="space-y-1">
              {buckets.map(bucket => (
                <li
                  key={bucket.id}
                  className={`p-2 cursor-pointer rounded ${
                    selectedBucket === bucket.name ? 'bg-blue-100' : 'hover:bg-gray-200'
                  }`}
                  onClick={() => setSelectedBucket(bucket.name)}
                >
                  {bucket.name}
                  {bucket.public && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded">
                      Public
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          
          <button
            onClick={loadBuckets}
            className="mt-4 w-full px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            disabled={!user || loading}
          >
            Refresh Buckets
          </button>
        </div>
        
        {/* File list */}
        <div className="flex-1">
          {selectedBucket ? (
            <div className="bg-white border rounded p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Files in {selectedBucket}</h2>
                <button
                  onClick={() => loadFiles(selectedBucket)}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                >
                  Refresh Files
                </button>
              </div>
              
              {loading ? (
                <div className="animate-pulse">Loading files...</div>
              ) : files.length === 0 ? (
                <div className="text-gray-500">No files found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Modified
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {files.map((file, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="mr-2">📄</span>
                              <span>{file.name}</span>
                              <a
                                href={getFileUrl(selectedBucket, file.name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-blue-600 hover:text-blue-800"
                              >
                                (Open)
                              </a>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {formatBytes(file.metadata?.size || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {new Date(file.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={async () => {
                                if (window.confirm('Are you sure you want to delete this file?')) {
                                  try {
                                    const { error } = await supabase.storage
                                      .from(selectedBucket)
                                      .remove([file.name]);
                                    
                                    if (error) throw error;
                                    loadFiles(selectedBucket);
                                  } catch (err) {
                                    console.error('Error deleting file:', err);
                                    alert('Failed to delete file');
                                  }
                                }
                              }}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-100 p-4 rounded text-center text-gray-500">
              Select a bucket to view its files
            </div>
          )}
        </div>
      </div>

      {/* Test Section */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Storage Tests</h2>
        
        {testError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong className="font-bold">Test Error:</strong>
            <span className="block sm:inline"> {testError}</span>
          </div>
        )}

        <div className="bg-white border rounded p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Test File
            </label>
            <input
              type="file"
              onChange={(e) => setTestFile(e.target.files[0])}
              className="w-full px-3 py-2 border rounded"
              disabled={!selectedBucket}
            />
            {!selectedBucket && (
              <p className="text-sm text-red-600 mt-1">Please select a bucket first</p>
            )}
          </div>

          <button
            onClick={runStorageTests}
            disabled={testLoading || !selectedBucket || !testFile}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {testLoading ? 'Running Tests...' : 'Run Storage Tests'}
          </button>

          {testResults.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Test Results</h3>
              <div className="space-y-2">
                {testResults.map((result, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded ${
                      result.status === 'success'
                        ? 'bg-green-100 text-green-800'
                        : result.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    <div className="flex items-center">
                      <span className="font-medium">{result.name}</span>
                      <span className="ml-2">
                        {result.status === 'success' && '✓'}
                        {result.status === 'failed' && '✗'}
                        {result.status === 'running' && '⟳'}
                      </span>
                    </div>
                    {result.message && (
                      <p className="text-sm mt-1">{result.message}</p>
                    )}
                    {result.error && (
                      <p className="text-sm mt-1 text-red-600">{result.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function to format file sizes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export default BucketExplorer; 