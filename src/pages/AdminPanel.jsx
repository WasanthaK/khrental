import { supabase } from '../services/supabaseClient';

const AdminPanel = () => {
  async function testStorageUpload() {
    try {
      // First, check if we're authenticated
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !session) {
        console.error('Authentication error:', authError || 'No session found');
        alert('You must be authenticated to upload files');
        return;
      }

      // Create a test blob
      const blob = new Blob(['This is a test file content from admin panel.'], { type: 'text/plain' });
      const fileName = `agreements/test-file-${new Date().toISOString()}.txt`;

      // Upload the file
      const { data, error } = await supabase.storage
        .from('files')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Error uploading file:', error);
        alert(`Upload failed: ${error.message}`);
        return;
      }

      console.log('File uploaded successfully:', data);
      alert('Test file uploaded successfully!');

      // Test reading the file back
      const { data: files, error: listError } = await supabase.storage
        .from('files')
        .list('agreements');

      if (listError) {
        console.error('Error listing files:', listError);
      } else {
        console.log('Files in agreements folder:', files);
      }

    } catch (error) {
      console.error('Upload process failed:', error);
      alert(`Upload process failed: ${error.message}`);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      
      {/* Add test upload button */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Storage Test</h2>
        <button
          onClick={testStorageUpload}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Test File Upload
        </button>
      </div>

      {/* ... rest of your existing admin panel content ... */}
    </div>
  );
};

export default AdminPanel; 