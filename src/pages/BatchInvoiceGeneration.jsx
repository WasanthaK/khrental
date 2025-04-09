import React from 'react';
import InvoiceGenerationWizard from '../components/invoices/InvoiceGenerationWizard';

/**
 * BatchInvoiceGeneration - Page component for generating monthly invoices in batch
 * This page wraps the InvoiceGenerationWizard component to provide context and layout
 */
const BatchInvoiceGeneration = () => {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Batch Invoice Generation</h1>
        <p className="text-gray-600 mt-2">
          Generate monthly invoices for multiple properties and rentees at once.
          This tool will combine utility readings and optionally include rent charges.
        </p>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <InvoiceGenerationWizard />
      </div>
    </div>
  );
};

export default BatchInvoiceGeneration; 