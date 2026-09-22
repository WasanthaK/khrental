import { platform as platformClient } from '../services/platformClient';
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
