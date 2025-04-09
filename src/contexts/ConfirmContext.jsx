import { createContext, useContext, useState } from 'react';

// Create context for confirmation dialogs
const ConfirmContext = createContext(null);

/**
 * Hook to access the confirmation dialog context
 */
export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmContextProvider');
  }
  
  return context;
};

/**
 * Provider component for confirmation dialogs
 * This allows any component to trigger confirmation dialogs from anywhere in the app
 */
export const ConfirmContextProvider = ({ children }) => {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {},
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  });
  
  // Function to show a confirmation dialog
  const confirm = (options) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || 'Confirm',
        message: options.message || 'Are you sure?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        onConfirm: () => {
          setState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        },
      });
    });
  };
  
  // Close the dialog
  const closeDialog = () => {
    setState(prev => ({ ...prev, isOpen: false }));
  };
  
  return (
    <ConfirmContext.Provider value={{ confirm, closeDialog }}>
      {children}
      
      {/* Render the confirmation dialog if it's open */}
      {state.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-auto">
            {state.title && (
              <h3 className="text-lg font-medium mb-2">{state.title}</h3>
            )}
            <p className="mb-4">{state.message}</p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                onClick={state.onCancel}
              >
                {state.cancelText}
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                onClick={state.onConfirm}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export default ConfirmContext; 