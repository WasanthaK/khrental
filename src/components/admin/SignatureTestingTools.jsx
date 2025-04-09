import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'react-toastify';

const SignatureTestingTools = () => {
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileSelect = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const testSignatureProcess = async () => {
    try {
      setLoading(true);
      
      if (!selectedFile || !webhookUrl) {
        toast.error('Please select a file and provide webhook URL');
        return;
      }

      // 1. Upload the file to get document token
      const fileName = `test_documents/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw uploadError;
      }

      // Get the file URL
      const { data: urlData } = supabase.storage
        .from('files')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get file URL');
      }

      // 2. Create signature request
      const { data: signatureRequest, error: signatureError } = await supabase.functions.invoke('send-to-evia-sign', {
        body: {
          documentUrl: urlData.publicUrl,
          webhookUrl: webhookUrl,
          completedDocumentsAttached: true,
          signatories: [
            {
              name: "Test Signer",
              email: "test@example.com",
              order: 1
            }
          ]
        }
      });

      if (signatureError) {
        throw signatureError;
      }

      setRequestId(signatureRequest.requestId);
      toast.success('Signature request created successfully');

    } catch (error) {
      console.error('Error in signature test:', error);
      toast.error('Signature test failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!requestId) {
      toast.error('No request ID available');
      return;
    }

    try {
      setLoading(true);
      const { data: response, error } = await supabase.functions.invoke('check-signature-status', {
        body: { requestId }
      });

      if (error) {
        throw error;
      }

      setStatus(response.status);
      toast.success('Status updated');
    } catch (error) {
      console.error('Error checking status:', error);
      toast.error('Failed to check status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Evia Sign Testing Tools</h2>
      
      {/* File Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Test Document (PDF)
        </label>
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* Webhook URL */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://webhook.site/your-webhook-url"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">
          Tip: Use webhook.site to get a temporary webhook URL for testing
        </p>
      </div>

      {/* Status Display */}
      {requestId && (
        <div className="mb-6 p-4 bg-gray-50 rounded-md">
          <h3 className="font-medium mb-2">Request Status</h3>
          <p>Request ID: {requestId}</p>
          {status && <p>Status: {status}</p>}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={testSignatureProcess}
          disabled={loading || !selectedFile || !webhookUrl}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Test Signature Process'}
        </button>
        {requestId && (
          <button
            onClick={checkStatus}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SignatureTestingTools; 