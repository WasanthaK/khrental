import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  createBucket,
  deleteFileFromBucket,
  listAllBuckets,
  listBucketContents,
  uploadFileToBucket
} from '../services/bucketExplorer';

const BucketExplorer = () => {
  const { user } = useAuth();
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState('');
  const [files, setFiles] = useState([]);
  const [newBucketName, setNewBucketName] = useState('');
  const [testFile, setTestFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadBuckets = async () => {
    if (!user) return;
    setLoading(true);
    const result = await listAllBuckets();
    setLoading(false);
    if (result.error) return setError(result.error);
    setBuckets(result.buckets || []);
    const first = result.buckets?.[0]?.name || result.buckets?.[0]?.id || '';
    if (!selectedBucket && first) setSelectedBucket(first);
  };

  const loadFiles = async (bucketName = selectedBucket) => {
    if (!user || !bucketName) return;
    setLoading(true);
    const result = await listBucketContents(bucketName);
    setLoading(false);
    if (result.error) return setError(result.error);
    setFiles((result.files || []).filter((file) => !file?.name?.endsWith('.keep')));
  };

  useEffect(() => { loadBuckets(); }, [user]);
  useEffect(() => { loadFiles(selectedBucket); }, [selectedBucket, user]);

  const handleCreateBucket = async (event) => {
    event.preventDefault();
    const result = await createBucket(newBucketName);
    if (result.error) return setError(result.error);
    setNewBucketName('');
    await loadBuckets();
  };

  const handleUpload = async () => {
    if (!testFile || !selectedBucket) return;
    const result = await uploadFileToBucket(testFile, selectedBucket, 'test_documents');
    if (result.error) return setError(result.error);
    setTestFile(null);
    await loadFiles();
  };

  const handleDelete = async (file) => {
    if (!window.confirm(`Delete ${file.name}?`)) return;
    const result = await deleteFileFromBucket(selectedBucket, file.path || file.name);
    if (result.error) return setError(result.error);
    await loadFiles();
  };

  if (!user) return <div className="p-4 text-red-600">Please log in to access storage.</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Storage Explorer</h1>
      {error && <div className="text-red-600">{error}</div>}

      <form onSubmit={handleCreateBucket} className="flex gap-2">
        <input value={newBucketName} onChange={(event) => setNewBucketName(event.target.value)} placeholder="Bucket name" className="border p-2" required />
        <button className="bg-blue-600 text-white px-3 py-2 rounded" disabled={loading}>Create Bucket</button>
      </form>

      <div className="flex gap-2 flex-wrap">
        {buckets.map((bucket) => {
          const name = bucket.name || bucket.id;
          return <button key={name} onClick={() => setSelectedBucket(name)} className={`px-3 py-2 rounded ${selectedBucket === name ? 'bg-blue-100' : 'bg-gray-100'}`}>{name}</button>;
        })}
      </div>

      {selectedBucket && (
        <>
          <div className="flex gap-2 items-center">
            <input type="file" onChange={(event) => setTestFile(event.target.files?.[0] || null)} />
            <button onClick={handleUpload} disabled={!testFile || loading} className="bg-green-600 text-white px-3 py-2 rounded">Upload Test File</button>
            <button onClick={() => loadFiles()} disabled={loading} className="bg-gray-600 text-white px-3 py-2 rounded">Refresh</button>
          </div>
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.path || file.name} className="flex justify-between border p-2 rounded">
                <span>{file.path || file.name}</span>
                <button onClick={() => handleDelete(file)} className="text-red-600">Delete</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BucketExplorer;
