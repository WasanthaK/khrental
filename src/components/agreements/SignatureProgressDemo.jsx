import React, { useState } from 'react';
import SignatureProgressTracker from '../ui/SignatureProgressTracker';

const SignatureProgressDemo = () => {
  // Demo states to showcase different signature scenarios
  const [demoState, setDemoState] = useState('pending');
  
  // Sample data for different scenarios
  const scenarios = {
    // No signatories have signed yet
    pending: {
      status: 'pending_signature',
      signatories: [
        { id: 1, name: 'John Doe', email: 'john@example.com', completed: false },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', completed: false },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', completed: false }
      ]
    },
    // First signatory has signed
    first_signed: {
      status: 'partially_signed',
      signatories: [
        { id: 1, name: 'John Doe', email: 'john@example.com', completed: true },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', completed: false },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', completed: false }
      ]
    },
    // Second signatory has signed
    second_signed: {
      status: 'partially_signed',
      signatories: [
        { id: 1, name: 'John Doe', email: 'john@example.com', completed: true },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', completed: true },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', completed: false }
      ]
    },
    // All signatories have signed
    completed: {
      status: 'signed',
      signatories: [
        { id: 1, name: 'John Doe', email: 'john@example.com', completed: true },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', completed: true },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', completed: true }
      ]
    }
  };
  
  // Get current scenario data
  const currentScenario = scenarios[demoState];
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Signature Progress Demo</h1>
      
      {/* Controls to switch between scenarios */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Select a scenario:</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDemoState('pending')}
            className={`px-4 py-2 rounded-md ${demoState === 'pending' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            Awaiting Signatures
          </button>
          
          <button
            onClick={() => setDemoState('first_signed')}
            className={`px-4 py-2 rounded-md ${demoState === 'first_signed' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            1st Signatory Signed
          </button>
          
          <button
            onClick={() => setDemoState('second_signed')}
            className={`px-4 py-2 rounded-md ${demoState === 'second_signed' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            2nd Signatory Signed
          </button>
          
          <button
            onClick={() => setDemoState('completed')}
            className={`px-4 py-2 rounded-md ${demoState === 'completed' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            All Signed (Complete)
          </button>
        </div>
      </div>
      
      {/* Display the full signature progress tracker */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Full View</h2>
        <SignatureProgressTracker 
          status={currentScenario.status}
          signatories={currentScenario.signatories}
        />
      </div>
      
      {/* Display the compact signature progress tracker */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Compact View (for Cards)</h2>
        <div className="p-4 bg-white rounded shadow">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Agreement #12345</h3>
            <SignatureProgressTracker 
              status={currentScenario.status}
              signatories={currentScenario.signatories}
              compact={true}
            />
          </div>
          <p className="mt-2 text-gray-600">Rental Agreement for 123 Main St.</p>
        </div>
      </div>
      
      {/* Integration example in an agreement card */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Example Integration in Agreement Card</h2>
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-4 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Rental Agreement</h3>
              <SignatureProgressTracker 
                status={currentScenario.status}
                signatories={currentScenario.signatories}
                compact={true}
              />
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-start">
              <div className="flex-1">
                <p className="text-gray-600">Property: 123 Main Street, Apt 4B</p>
                <p className="text-gray-600 mt-1">Tenant: John Doe</p>
                <p className="text-gray-600 mt-1">Created: April 3, 2025</p>
              </div>
              <div className="ml-4">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                  View Details
                </button>
              </div>
            </div>
            
            {/* Mini signatory list to show in card */}
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Signatories:</h4>
              <div className="space-y-1">
                {currentScenario.signatories.map((signatory, index) => (
                  <div key={signatory.id} className="flex items-center text-sm">
                    <div className={`w-2 h-2 rounded-full mr-2 ${signatory.completed ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <span>{signatory.name}</span>
                    {signatory.completed && <span className="ml-auto text-green-600 text-xs">Signed</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignatureProgressDemo; 