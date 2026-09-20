import React from 'react';
import InvoiceGenerationWizard from '../components/invoices/InvoiceGenerationWizard';

/**
 * BatchInvoiceGeneration - Page component for generating monthly invoices from
 * active tenancy agreements.
 */
const BatchInvoiceGeneration = () => {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Monthly Invoice Generation</h1>
        <p className="text-gray-600 mt-2">
          Generate one monthly invoice per eligible active tenancy. Contractual rent comes from the agreement and approved utility charges for the billing period are attached to the same auditable invoice.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <InvoiceGenerationWizard />
      </div>
    </div>
  );
};

export default BatchInvoiceGeneration;
