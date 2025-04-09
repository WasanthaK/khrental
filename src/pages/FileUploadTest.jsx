import React, { useState, useEffect } from 'react';
import { testStorageBuckets, testFileUpload, checkBucketPermissions } from '../services/fileUploadTest';
import { saveFile, STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-hot-toast';

const FileUploadTest = () => {
  const [results, setResults] = useState({ testing: false, data: null, error: null });
  const [testFile, setTestFile] = useState(null);
  const [customBuckets, setCustomBuckets] = useState([]);
  const [customBucketName, setCustomBucketName] = useState('');
  const [newBucketName, setNewBucketName] = useState('');
  const [bucketVisibility, setBucketVisibility] = useState('public');
  const [loading, setLoading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  
  // Check for existing buckets on component mount
  useEffect(() => {
    const checkBuckets = async () => {
      try {
        setResults({ testing: true, data: null, error: null });
        
        console.log('Checking storage buckets...');
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
          console.error('Error listing buckets:', bucketsError);
          setResults({ 
            testing: false, 
            data: null, 
            error: `Error checking storage buckets: ${bucketsError.message}` 
          });
          return;
        }
        
        if (!buckets || buckets.length === 0) {
          console.error('No storage buckets found! Please create buckets in Supabase dashboard.');
          setResults({
            testing: false,
            data: null,
            error: 'No storage buckets found. You need to create buckets in the Supabase dashboard.'
          });
          return;
        }
        
        setCustomBuckets(buckets);
        setResults({ 
          testing: false, 
          data: { 
            message: 'Found existing storage buckets', 
            buckets: buckets.map(b => b.name) 
          }, 
          error: null 
        });
      } catch (error) {
        console.error('Error checking buckets:', error);
        setResults({ 
          testing: false, 
          data: null, 
          error: `Error checking buckets: ${error.message || 'Unknown error'}` 
        });
      }
    };
    
    checkBuckets();
  }, []);
  
  const runBucketTest = async () => {
    setResults({ testing: true, data: null, error: null });
    try {
      const testResult = await testStorageBuckets();
      setResults({ testing: false, data: testResult, error: null });
    } catch (error) {
      setResults({ testing: false, data: null, error: error.message || 'Test failed' });
    }
  };
  
  const diagnosePermissions = async () => {
    setResults({ testing: true, data: null, error: null });
    try {
      const checkResult = await checkBucketPermissions();
      setResults({ 
        testing: false, 
        data: checkResult, 
        error: checkResult.success ? null : 'Permission check failed: ' + checkResult.message 
      });
    } catch (error) {
      setResults({ testing: false, data: null, error: error.message || 'Diagnosis failed' });
    }
  };
  
  const runFileUploadTest = async () => {
    setResults({ testing: true, data: null, error: null });
    try {
      const testResult = await testFileUpload();
      setResults({ testing: false, data: testResult, error: null });
    } catch (error) {
      setResults({ testing: false, data: null, error: error.message || 'Test failed' });
    }
  };
  
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setTestFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (!testFile) {
      setResults({ testing: false, data: null, error: 'Please select a file first' });
      return;
    }

    try {
      setLoading(true);
      setResults({ testing: true, data: null, error: null });

      const result = await saveFile(testFile, {
        bucket: STORAGE_BUCKETS.IMAGES,
        folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload file');
      }

      setUploadedUrl(result.url);
      toast.success('File uploaded successfully!');
      setResults({ 
        testing: false, 
        data: { 
          message: 'File uploaded successfully',
          path: result.path,
          url: result.url
        }, 
        error: null 
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      setResults({ 
        testing: false, 
        data: null, 
        error: `Failed to upload file: ${error.message || 'Unknown error'}` 
      });
      toast.error('Failed to upload file');
    } finally {
      setLoading(false);
    }
  };
  
  const listBuckets = async () => {
    setResults({ testing: true, data: null, error: null });
    try {
      const { data, error } = await supabase.storage.listBuckets();
      
      if (error) throw error;
      
      setCustomBuckets(data || []);
      setResults({ testing: false, data: { buckets: data }, error: null });
    } catch (error) {
      setResults({ testing: false, data: null, error: error.message || 'Failed to list buckets' });
    }
  };
  
  const getBucketInfo = async (bucketName) => {
    setResults({ testing: true, data: null, error: null });
    
    try {
      // First try to list the bucket contents
      const { data: filesList, error: filesError } = await supabase.storage
        .from(bucketName)
        .list();
      
      if (filesError) {
        setResults({ 
          testing: false, 
          data: null, 
          error: `Error accessing bucket "${bucketName}": ${filesError.message}` 
        });
        return;
      }
      
      // Get bucket info
      const bucket = customBuckets.find(b => b.name === bucketName) || { name: bucketName };
      
      setResults({ 
        testing: false, 
        data: { 
          bucket,
          files: filesList || [],
          message: `Successfully accessed bucket "${bucketName}"`
        }, 
        error: null 
      });
    } catch (error) {
      setResults({ 
        testing: false, 
        data: null, 
        error: `Error getting bucket info: ${error.message}` 
      });
    }
  };
  
  const listFilesInFolder = async (bucketName, folderPath) => {
    setResults({ testing: true, data: null, error: null });
    
    try {
      const { data: filesList, error: filesError } = await supabase.storage
        .from(bucketName)
        .list(folderPath);
      
      if (filesError) {
        setResults({ 
          testing: false, 
          data: null, 
          error: `Error accessing folder "${folderPath}" in bucket "${bucketName}": ${filesError.message}` 
        });
        return;
      }
      
      // Get public URLs for each file
      const filesWithUrls = await Promise.all(
        filesList.map(async (item) => {
          // Skip folders (they don't have public URLs)
          if (item.id === null) {
            return { ...item, isFolder: true };
          }
          
          const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
          const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fullPath);
            
          return { 
            ...item, 
            path: fullPath,
            publicUrl: urlData?.publicUrl || null 
          };
        })
      );
      
      setResults({ 
        testing: false, 
        data: { 
          bucketName,
          folderPath,
          files: filesWithUrls || [],
          message: `Listed files in "${folderPath || 'root'}" of bucket "${bucketName}"`
        }, 
        error: null 
      });
    } catch (error) {
      setResults({ 
        testing: false, 
        data: null, 
        error: `Error listing files: ${error.message}` 
      });
    }
  };
  
  const listAllBucketsAndContents = async () => {
    setResults({ testing: true, data: null, error: null });
    
    try {
      // Get list of all buckets
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        throw bucketsError;
      }
      
      if (!buckets || buckets.length === 0) {
        setResults({
          testing: false,
          data: { message: 'No buckets found in your Supabase project.' },
          error: null
        });
        return;
      }
      
      // Get contents for each bucket
      const bucketsWithContents = [];
      
      for (const bucket of buckets) {
        try {
          const { data: contents, error: contentsError } = await supabase.storage
            .from(bucket.name)
            .list();
            
          if (contentsError) {
            bucketsWithContents.push({
              name: bucket.name,
              error: contentsError.message,
              contents: []
            });
          } else {
            bucketsWithContents.push({
              name: bucket.name,
              public: bucket.public,
              contents: contents || []
            });
          }
        } catch (error) {
          bucketsWithContents.push({
            name: bucket.name,
            error: error.message,
            contents: []
          });
        }
      }
      
      setResults({
        testing: false,
        data: {
          message: `Listed ${buckets.length} buckets and their contents`,
          buckets: bucketsWithContents
        },
        error: null
      });
    } catch (error) {
      setResults({
        testing: false,
        data: null,
        error: `Error listing buckets: ${error.message}`
      });
    }
  };
  
  const uploadToCustomBucket = async () => {
    if (!testFile) {
      setResults({ testing: false, data: null, error: 'Please select a file first' });
      return;
    }
    
    if (!customBucketName) {
      setResults({ testing: false, data: null, error: 'Please select a bucket' });
      return;
    }
    
    setResults({ testing: true, data: null, error: null });
    
    try {
      const testFilePath = `test-upload-${Date.now()}.${testFile.name.split('.').pop()}`;
      
      const { data, error } = await supabase.storage
        .from(customBucketName)
        .upload(testFilePath, testFile);
      
      if (error) throw error;
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from(customBucketName)
        .getPublicUrl(testFilePath);
      
      setResults({ 
        testing: false, 
        data: { 
          message: `File uploaded successfully to ${customBucketName}`, 
          path: testFilePath,
          publicUrl: urlData?.publicUrl
        }, 
        error: null 
      });
    } catch (error) {
      setResults({ testing: false, data: null, error: error.message || 'Upload failed' });
    }
  };
  
  const createBucketPolicies = async (bucketName) => {
    setResults({ testing: true, data: null, error: null });
    
    try {
      // First check if the bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets.some(b => b.name === bucketName)) {
        throw new Error(`Bucket "${bucketName}" not found`);
      }

      setResults({ 
        testing: false, 
        data: { 
          message: `Storage policies must be created using SQL in the Supabase dashboard. Please run the following SQL for bucket "${bucketName}":`,
          sql: `-- First, drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access ${bucketName}" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads ${bucketName}" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates ${bucketName}" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletions ${bucketName}" ON storage.objects;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policies for the ${bucketName} bucket
CREATE POLICY "Allow public read access ${bucketName}"
ON storage.objects FOR SELECT
USING (bucket_id = '${bucketName}');

CREATE POLICY "Allow authenticated uploads ${bucketName}"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = '${bucketName}' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated updates ${bucketName}"
ON storage.objects FOR UPDATE
USING (
  bucket_id = '${bucketName}' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated deletions ${bucketName}"
ON storage.objects FOR DELETE
USING (
  bucket_id = '${bucketName}' 
  AND auth.role() = 'authenticated'
);`
        }, 
        error: null 
      });
    } catch (error) {
      console.error('Error checking bucket:', error);
      setResults({ 
        testing: false, 
        data: null, 
        error: `Error checking bucket: ${error.message}` 
      });
    }
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Supabase Storage Test</h1>
      
      {results.error && results.error.includes('No storage buckets found') && (
        <div className="mb-6 bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded relative">
          <strong className="font-bold">Storage Configuration Error</strong>
          <p className="mt-2">
            Your Supabase project does not have any storage buckets configured. 
            File uploads will not work until this is fixed.
          </p>
          <div className="mt-3">
            <p className="font-medium">How to fix:</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Go to your Supabase dashboard at <a href="https://app.supabase.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">https://app.supabase.com</a></li>
              <li>Select your project and go to the Storage section</li>
              <li>Create a new bucket called "images" (avoid using "public" as it's a reserved word)</li>
              <li>Make sure to check "Public bucket" to allow file access</li>
              <li>Add appropriate RLS policies to allow file uploads</li>
              <li>Return to this page and click "Refresh Buckets" below</li>
            </ol>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Automatic Tests</h2>
          
          <div className="space-y-4">
            <button
              onClick={runBucketTest}
              disabled={results.testing}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {results.testing ? 'Testing...' : 'Test Buckets'}
            </button>
            
            <button
              onClick={runFileUploadTest}
              disabled={results.testing}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {results.testing ? 'Testing...' : 'Test File Upload (Auto)'}
            </button>
            
            <button
              onClick={diagnosePermissions}
              disabled={results.testing}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {results.testing ? 'Diagnosing...' : 'Diagnose Permissions'}
            </button>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Manual Test</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test File
              </label>
              <input
                type="file"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            
            <button
              onClick={handleUpload}
              disabled={!testFile || results.testing}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {results.testing ? 'Uploading...' : 'Test with Selected File'}
            </button>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow md:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Storage Buckets</h2>
            
            <div className="space-x-2">
              <button
                onClick={listBuckets}
                disabled={results.testing}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Refresh Buckets
              </button>
              
              <button
                onClick={listAllBucketsAndContents}
                disabled={results.testing}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                List All Bucket Contents
              </button>
            </div>
          </div>
          
          {customBuckets.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {customBuckets.map(bucket => (
                <div key={bucket.name} className="border rounded p-4">
                  <div className="font-medium">{bucket.name}</div>
                  <div className="text-sm text-gray-500">
                    {bucket.public ? 'Public' : 'Private'} bucket
                  </div>
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={() => {
                        setCustomBucketName(bucket.name);
                        getBucketInfo(bucket.name);
                      }}
                      className="w-full px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                    >
                      View Contents
                    </button>
                    
                    <button
                      onClick={() => setCustomBucketName(bucket.name)}
                      disabled={!testFile}
                      className="w-full px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200 disabled:opacity-50"
                    >
                      Select for Upload
                    </button>
                    
                    <button
                      onClick={() => createBucketPolicies(bucket.name)}
                      className="w-full px-3 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                    >
                      Setup RLS Policies
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-yellow-700 bg-yellow-50 p-4 rounded">
              No storage buckets available. Please create one in your Supabase dashboard.
            </div>
          )}
          
          {customBucketName && (
            <div className="mt-6 border-t pt-4">
              <h3 className="font-medium mb-2">Selected Bucket: {customBucketName}</h3>
              {testFile ? (
                <button
                  onClick={uploadToCustomBucket}
                  disabled={results.testing}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {results.testing ? 'Uploading...' : `Upload to ${customBucketName}`}
                </button>
              ) : (
                <div className="text-gray-500">Select a file to upload</div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Test Results</h2>
        
        {results.testing ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status">
              <span className="sr-only">Testing...</span>
            </div>
            <p className="mt-2">Running tests...</p>
          </div>
        ) : results.error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {results.error}</span>
          </div>
        ) : results.data ? (
          <div className="bg-green-100 border border-green-400 text-green-800 px-4 py-3 rounded relative mb-4">
            <strong className="font-bold">Success:</strong>
            <span className="block sm:inline"> {results.data.message}</span>
          </div>
        ) : null}
        
        {results.data && (
          <div className="mt-4 overflow-auto max-h-96">
            <pre className="p-4 bg-gray-100 rounded text-sm">
              {JSON.stringify(results.data, null, 2)}
            </pre>
            
            {/* Display bucket contents with folder navigation */}
            {results.data.buckets && (
              <div className="mt-4">
                {results.data.buckets.map(bucket => (
                  <div key={bucket.name} className="mb-6 border rounded p-4">
                    <h3 className="text-lg font-semibold">{bucket.name} Bucket</h3>
                    {bucket.error ? (
                      <div className="text-red-600">Error: {bucket.error}</div>
                    ) : bucket.contents && bucket.contents.length > 0 ? (
                      <div className="mt-2">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="text-left p-2">Name</th>
                              <th className="text-left p-2">Type</th>
                              <th className="text-left p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bucket.contents.map((item, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2">
                                  {item.id === null ? '📁 ' : '📄 '}
                                  {item.name}
                                </td>
                                <td className="p-2">
                                  {item.id === null ? 'Folder' : 'File'}
                                </td>
                                <td className="p-2">
                                  {item.id === null && (
                                    <button
                                      onClick={() => listFilesInFolder(bucket.name, item.name)}
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                                    >
                                      Explore
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-gray-500 mt-2">No files in this bucket</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Display folder contents when exploring a specific folder */}
            {results.data.folderPath !== undefined && (
              <div className="mt-4 border rounded p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">
                    Contents of {results.data.folderPath || 'root'} in {results.data.bucketName}
                  </h3>
                  <button
                    onClick={() => getBucketInfo(results.data.bucketName)}
                    className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  >
                    Back to Bucket
                  </button>
                </div>
                
                {results.data.files && results.data.files.length > 0 ? (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.data.files.map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">
                            {item.id === null ? '📁 ' : '📄 '}
                            {item.name}
                          </td>
                          <td className="p-2">
                            {item.id === null ? 'Folder' : 'File'}
                          </td>
                          <td className="p-2">
                            {item.id === null ? (
                              <button
                                onClick={() => {
                                  const path = results.data.folderPath 
                                    ? `${results.data.folderPath}/${item.name}` 
                                    : item.name;
                                  listFilesInFolder(results.data.bucketName, path);
                                }}
                                className="px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                              >
                                Explore
                              </button>
                            ) : item.publicUrl ? (
                              <a 
                                href={item.publicUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                              >
                                View
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-gray-500">No files in this folder</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="mt-8 bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Troubleshooting Guide</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Common Issues</h3>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>
                <strong>No buckets found</strong> - You need to create storage buckets in the Supabase dashboard.
                To do this, go to the Supabase project dashboard → Storage section → Create a bucket.
              </li>
              <li>
                <strong>"public" is a reserved word</strong> - Don't use "public" as a bucket name. Use "images" or another name instead.
              </li>
              <li>
                <strong>Permission errors (403)</strong> - Your bucket might not have proper public access or Row Level Security (RLS) policies. 
                Make sure your bucket is set to public in the Supabase dashboard and has appropriate RLS policies.
              </li>
              <li>
                <strong>Bad Request (400)</strong> - This often happens when your Supabase project doesn't 
                have Storage enabled or when your service role key doesn't have access to Storage.
              </li>
              <li>
                <strong>"Row Level Security policy" error</strong> - This means you need to update the RLS policies for storage.
                In the Supabase dashboard, go to Storage → Policies and make sure you have appropriate policies for creating buckets.
              </li>
              <li>
                <strong>"The resource already exists" error</strong> - This means the bucket already exists. 
                Try refreshing the page or using the Diagnosis tool.
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-medium">How to Fix</h3>
            <ol className="list-decimal pl-5 mt-2 space-y-2">
              <li>Go to the Supabase dashboard and ensure Storage is enabled for your project</li>
              <li>Make sure your anon and service role keys have Storage permissions</li>
              <li>Create a bucket called "images" (not "public") through the Supabase dashboard</li>
              <li>Make sure to check the "Public bucket" option when creating it</li>
              <li>Add the following RLS policies to your storage buckets:
                <ul className="list-disc pl-5 mt-1 text-sm font-mono">
                  <li>INSERT: (true)</li>
                  <li>SELECT: (true)</li>
                  <li>UPDATE: (true)</li>
                  <li>DELETE: (true)</li>
                </ul>
              </li>
              <li>If all else fails, check your browser console for more detailed error messages</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUploadTest; 