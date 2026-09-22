from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)

# Central explicit storage service: add privileged bucket actions.
p = Path('src/services/storageApiService.js')
s = p.read_text()
marker = """export const listStorageBuckets = async () => {
  const payload = await requestJson('/api/platform/storage/buckets');
  return payload?.data || [];
};
"""
addition = marker + """
export const createStorageBucket = async (bucketName) => {
  const normalizedBucketName = String(bucketName || '').trim();
  if (!normalizedBucketName) {
    throw new Error('Bucket name is required.');
  }

  const payload = await requestJson('/api/platform/storage/buckets', {
    method: 'POST',
    body: JSON.stringify({ bucketName: normalizedBucketName })
  });
  return payload?.data || null;
};

export const deleteStorageBucket = async (bucketName) => {
  const normalizedBucketName = String(bucketName || '').trim();
  if (!normalizedBucketName) {
    throw new Error('Bucket name is required.');
  }

  const payload = await requestJson(`/api/platform/storage/buckets/${encodeURIComponent(normalizedBucketName)}`, {
    method: 'DELETE'
  });
  return payload?.data ?? true;
};
"""
if 'export const createStorageBucket' not in s:
    s = replace_once(s, marker, addition, 'storage bucket helpers')
p.write_text(s)

# Application startup only verifies storage readiness; it no longer mutates buckets/folders.
Path('src/services/appInitService.js').write_text("""import { getPlatformClient } from './platformClient';
import { STORAGE_BUCKETS } from './fileService';
import { listStorageBuckets } from './storageApiService';

const platformClient = getPlatformClient();
let storageInitialized = false;

/**
 * Verify the server-owned storage configuration. Browser startup is deliberately
 * read-only: bucket creation/deletion is an administrator operation and object
 * folders are virtual prefixes created naturally by uploads.
 */
export const initializeStorage = async () => {
  if (storageInitialized) {
    return { success: true, skipped: true, reason: 'Storage already initialized.' };
  }

  try {
    const { data: { session } } = await platformClient.auth.getSession();
    if (!session) {
      return {
        success: true,
        skipped: true,
        reason: 'No authenticated session available for storage readiness check.'
      };
    }

    const buckets = await listStorageBuckets();
    const configuredNames = new Set((buckets || []).map((bucket) => bucket?.name || bucket?.id).filter(Boolean));
    const missingBuckets = Object.values(STORAGE_BUCKETS).filter((bucketName) => !configuredNames.has(bucketName));

    if (missingBuckets.length > 0) {
      throw new Error(`Missing configured storage buckets: ${missingBuckets.join(', ')}`);
    }

    storageInitialized = true;
    return { success: true, skipped: false };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      error: error.message || 'Storage readiness check failed.'
    };
  }
};

export const initializeApp = async () => {
  try {
    const storageResult = await initializeStorage();

    if (!storageResult.success && !storageResult.skipped) {
      console.warn('Storage readiness check failed; the application will continue.', storageResult.error);
      return {
        success: true,
        error: storageResult.error || 'Storage is not ready. Some file features may be unavailable.',
        isStorageError: true
      };
    }

    return {
      success: true,
      error: null,
      isStorageError: false,
      storageSkipped: Boolean(storageResult.skipped)
    };
  } catch (error) {
    console.error('Error during app initialization:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const forceStorageReinitialization = () => {
  storageInitialized = false;
};
""")

# Bucket explorer service uses only explicit storage APIs.
Path('src/services/bucketExplorer.js').write_text("""import {
  buildStorageUrl,
  createStorageBucket,
  deleteStorageBucket,
  deleteTenantFiles,
  listStorageBuckets,
  listTenantFiles,
  uploadTenantFile
} from './storageApiService';

export const listAllBuckets = async () => {
  try {
    return { buckets: await listStorageBuckets(), error: null };
  } catch (error) {
    return { buckets: [], error: error.message };
  }
};

export const createBucket = async (bucketName) => {
  try {
    return { bucket: await createStorageBucket(bucketName), error: null };
  } catch (error) {
    return { bucket: null, error: error.message };
  }
};

export const removeBucket = async (bucketName) => {
  try {
    await deleteStorageBucket(bucketName);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const listBucketContents = async (bucketName, folderPath = '') => {
  try {
    const buckets = await listStorageBuckets();
    if (!(buckets || []).some((bucket) => (bucket?.name || bucket?.id) === bucketName)) {
      throw new Error(`Bucket not found: ${bucketName}`);
    }

    const files = await listTenantFiles({ bucket: bucketName, path: folderPath });
    const publicUrls = {};
    for (const file of files || []) {
      if (file?.id !== null && file?.name) {
        const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
        publicUrls[file.name] = buildStorageUrl(bucketName, filePath);
      }
    }
    return { files: files || [], publicUrls, error: null };
  } catch (error) {
    return { files: [], publicUrls: {}, error: error.message };
  }
};

const listFilesRecursively = async (bucketName, path, accumulator) => {
  const contents = await listTenantFiles({ bucket: bucketName, path });
  for (const item of contents || []) {
    if (item?.id === null && item?.name) {
      await listFilesRecursively(bucketName, path ? `${path}/${item.name}` : item.name, accumulator);
    } else if (item?.name) {
      accumulator.push({ ...item, path: path ? `${path}/${item.name}` : item.name });
    }
  }
};

export const listAllFilesInBucket = async (bucketName) => {
  try {
    const files = [];
    await listFilesRecursively(bucketName, '', files);
    return { files, error: null };
  } catch (error) {
    return { files: [], error: error.message };
  }
};

export const uploadFileToBucket = async (file, bucketName, folderPath = '', customFileName = null) => {
  try {
    if (!file) return { path: null, publicUrl: null, error: 'No file provided' };
    const fileName = customFileName || file.name || `file-${Date.now()}`;
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
    const uploaded = await uploadTenantFile({ bucket: bucketName, path: filePath, file });
    return { path: uploaded?.path || filePath, publicUrl: uploaded?.url || null, error: null };
  } catch (error) {
    return { path: null, publicUrl: null, error: error.message };
  }
};

export const deleteFileFromBucket = async (bucketName, filePath) => {
  try {
    await deleteTenantFiles({ bucket: bucketName, paths: [filePath] });
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default {
  listAllBuckets,
  createBucket,
  removeBucket,
  listBucketContents,
  listAllFilesInBucket,
  uploadFileToBucket,
  deleteFileFromBucket
};
""")

# Admin panel test upload uses explicit storage; auth remains on the auth client.
Path('src/pages/AdminPanel.jsx').write_text("""import { platform as platformClient } from '../services/platformClient';
import { listTenantFiles, uploadTenantFile } from '../services/storageApiService';

const AdminPanel = () => {
  async function testStorageUpload() {
    try {
      const { data: { session }, error: authError } = await platformClient.auth.getSession();
      if (authError || !session) {
        alert('You must be authenticated to upload files');
        return;
      }

      const blob = new Blob(['This is a test file content from admin panel.'], { type: 'text/plain' });
      const fileName = `agreements/test-file-${new Date().toISOString()}.txt`;
      await uploadTenantFile({ bucket: 'files', path: fileName, file: blob });
      await listTenantFiles({ bucket: 'files', path: 'agreements' });
      alert('Test file uploaded successfully!');
    } catch (error) {
      console.error('Upload process failed:', error);
      alert(`Upload process failed: ${error.message}`);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Storage Test</h2>
        <button
          onClick={testStorageUpload}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Test File Upload
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;
""")

# Replace unused legacy explorer component with a thin UI over the explicit explorer service.
Path('src/components/BucketExplorer.jsx').write_text("""import React, { useEffect, useState } from 'react';
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
""")

# Admin signature test surfaces: storage upload only moves to explicit API.
for file_name in ['src/components/admin/EviaSignTesting.jsx', 'src/components/admin/SignatureTestingTools.jsx']:
    p = Path(file_name)
    s = p.read_text()
    import_marker = "import { toast } from 'react-toastify';\n"
    storage_import = "import { uploadTenantFile } from '../../services/storageApiService';\n"
    if storage_import not in s:
        s = s.replace(import_marker, import_marker + storage_import, 1)
    pattern = re.compile(r"\s*const \{ error: uploadError \} = await platformClient\.storage\s*\.from\('files'\)\s*\.upload\(fileName, selectedFile\);\s*\n\s*if \(uploadError\)(?: \{|)\s*(?:throw uploadError;\s*\}|throw uploadError;)\s*\n\s*// Get the file URL\s*\n\s*const \{ data: urlData \} = platformClient\.storage\s*\.from\('files'\)\s*\.getPublicUrl\(fileName\);\s*\n\s*if \(!urlData\?\.publicUrl\) \{\s*throw new Error\('Failed to get file URL'\);\s*\}", re.MULTILINE)
    match = pattern.search(s)
    if not match:
        raise SystemExit(f'missing signature storage block: {file_name}')
    replacement = """
      const uploadData = await uploadTenantFile({
        bucket: 'files',
        path: fileName,
        file: selectedFile
      });
      const documentUrl = uploadData?.url;

      if (!documentUrl) {
        throw new Error('Failed to get file URL');
      }"""
    s = s[:match.start()] + replacement + s[match.end():]
    s = s.replace('documentUrl: urlData.publicUrl', 'documentUrl')
    if file_name.endswith('EviaSignTesting.jsx'):
        s = s.replace("import { platform as platformClient } from '../../services/platformClient';\n", '')
    if 'platformClient.storage' in s:
        raise SystemExit(f'{file_name} still contains compatibility storage calls')
    p.write_text(s)

# Bucket mutations are administrative server operations.
p = Path('src/api/platform/router.js')
s = p.read_text()
s = replace_once(
    s,
    "router.post('/storage/buckets', requireAuthenticated, async (req, res, next) => {",
    "router.post('/storage/buckets', requireAuthenticated, requireAdmin, async (req, res, next) => {",
    'bucket create admin guard'
)
s = replace_once(
    s,
    "router.delete('/storage/buckets/:bucket', requireAuthenticated, async (req, res, next) => {",
    "router.delete('/storage/buckets/:bucket', requireAuthenticated, requireAdmin, async (req, res, next) => {",
    'bucket delete admin guard'
)
p.write_text(s)

# Obsolete browser mutation setup script is removed; provisioning belongs to server/admin APIs.
setup_script = Path('src/scripts/setup_storage_buckets.js')
if setup_script.exists():
    setup_script.unlink()

# Regression coverage.
p = Path('tests/storage-delivery.test.js')
s = p.read_text()
s = s.replace("import { readFileSync } from 'node:fs';", "import { existsSync, readFileSync } from 'node:fs';")
source_marker = """const storageApiServiceSource = readFileSync(
  new URL('../src/services/storageApiService.js', import.meta.url),
  'utf8'
);
"""
source_add = source_marker + """
const appInitServiceSource = readFileSync(new URL('../src/services/appInitService.js', import.meta.url), 'utf8');
const bucketExplorerServiceSource = readFileSync(new URL('../src/services/bucketExplorer.js', import.meta.url), 'utf8');
const bucketExplorerComponentSource = readFileSync(new URL('../src/components/BucketExplorer.jsx', import.meta.url), 'utf8');
const adminPanelSource = readFileSync(new URL('../src/pages/AdminPanel.jsx', import.meta.url), 'utf8');
const eviaSignTestingSource = readFileSync(new URL('../src/components/admin/EviaSignTesting.jsx', import.meta.url), 'utf8');
const signatureTestingToolsSource = readFileSync(new URL('../src/components/admin/SignatureTestingTools.jsx', import.meta.url), 'utf8');
const platformRouterSource = readFileSync(new URL('../src/api/platform/router.js', import.meta.url), 'utf8');
"""
if 'const appInitServiceSource' not in s:
    s = replace_once(s, source_marker, source_add, 'admin storage test sources')
extra = r"""

test('browser startup verifies storage readiness without mutating storage', () => {
  assert.match(appInitServiceSource, /listStorageBuckets/);
  assert.doesNotMatch(appInitServiceSource, /platformClient\.storage|createBucket|uploadTenantFile|deleteTenantFiles/);
});

test('bucket explorer and admin test surfaces use explicit storage APIs', () => {
  for (const source of [bucketExplorerServiceSource, bucketExplorerComponentSource, adminPanelSource, eviaSignTestingSource, signatureTestingToolsSource]) {
    assert.doesNotMatch(source, /platformClient\.storage/);
  }
  assert.match(bucketExplorerServiceSource, /listStorageBuckets/);
  assert.match(bucketExplorerServiceSource, /uploadTenantFile/);
  assert.match(bucketExplorerServiceSource, /deleteTenantFiles/);
  assert.match(adminPanelSource, /uploadTenantFile/);
  assert.match(eviaSignTestingSource, /uploadTenantFile/);
  assert.match(signatureTestingToolsSource, /uploadTenantFile/);
});

test('bucket create and delete require administrator authorization', () => {
  assert.match(storageApiServiceSource, /export const createStorageBucket/);
  assert.match(storageApiServiceSource, /export const deleteStorageBucket/);
  assert.match(platformRouterSource, /router\.post\('\/storage\/buckets', requireAuthenticated, requireAdmin/);
  assert.match(platformRouterSource, /router\.delete\('\/storage\/buckets\/:bucket', requireAuthenticated, requireAdmin/);
});

test('obsolete browser bucket setup script is removed', () => {
  assert.equal(existsSync(new URL('../src/scripts/setup_storage_buckets.js', import.meta.url)), false);
});
"""
if 'browser startup verifies storage readiness without mutating storage' not in s:
    s += extra
p.write_text(s)
