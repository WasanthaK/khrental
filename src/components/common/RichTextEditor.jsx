import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import React from 'react';

/**
 * Fetches and formats actual data for merge fields based on an agreement ID
 * @param {string} agreementId - The ID of the agreement to fetch data for
 * @returns {Promise<Object>} - Object containing categories of merge field data
 */
export const getMergeDataForAgreement = async (agreementId) => {
  if (!agreementId) return null;
  
  try {
    // Fetch agreement data with all related entities
    const response = await fetch(`/api/agreements/${agreementId}?include=property,unit,rentee,terms`);
    if (!response.ok) {
      throw new Error('Failed to fetch agreement data');
    }
    
    const data = await response.json();
    const { agreement, property, unit, rentee, terms } = data;
    
    // Format dates for display
    const formatDate = (dateString) => {
      if (!dateString) return '';
      return new Date(dateString).toLocaleDateString();
    };
    
    // Format currency values
    const formatCurrency = (value) => {
      if (!value && value !== 0) return '';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    };
    
    // Return structured merge field data
    return {
      agreement: {
        'Agreement ID': agreement?.id || '',
        'Start Date': formatDate(agreement?.startDate),
        'End Date': formatDate(agreement?.endDate),
        'Rent Amount': formatCurrency(agreement?.rentAmount),
        'Security Deposit': formatCurrency(agreement?.securityDeposit),
        'Agreement Type': agreement?.type || '',
        'Agreement Status': agreement?.status || '',
      },
      property: {
        'Property ID': property?.id || '',
        'Property Name': property?.name || '',
        'Property Address': property?.address || '',
        'Property City': property?.city || '',
        'Property State': property?.state || '',
        'Property Zip': property?.zip || '',
      },
      unit: {
        'Unit ID': unit?.id || '',
        'Unit Number': unit?.number || '',
        'Unit Type': unit?.type || '',
        'Unit Size': unit?.size || '',
        'Bedrooms': unit?.bedrooms || '',
        'Bathrooms': unit?.bathrooms || '',
      },
      rentee: {
        'Rentee Name': rentee?.name || '',
        'Rentee Email': rentee?.email || '',
        'Rentee Phone': rentee?.phone || '',
        'Rentee Address': rentee?.address || '',
      },
      terms: {
        'Late Fee Amount': formatCurrency(terms?.lateFeeAmount),
        'Late Fee Days': terms?.lateFeeDays || '',
        'Payment Due Day': terms?.paymentDueDay || '',
        'Payment Method': terms?.paymentMethod || '',
      }
    };
  } catch (error) {
    console.error('Error fetching merge field data:', error);
    return null;
  }
};

// Default merge fields that will be used if no custom fields are provided
const defaultMergeFields = {
  agreement: {
    'Agreement ID': '{{agreementId}}',
    'Start Date': '{{startDate}}',
    'End Date': '{{endDate}}',
    'Current Date': '{{currentDate}}',
    'Rent Amount': '{{rentAmount}}',
    'Security Deposit': '{{securityDeposit}}',
    'Agreement Type': '{{agreementType}}',
    'Agreement Status': '{{agreementStatus}}',
  },
  property: {
    'Property ID': '{{propertyId}}',
    'Property Name': '{{propertyName}}',
    'Property Address': '{{propertyAddress}}',
    'Property City': '{{propertyCity}}',
    'Property State': '{{propertyState}}',
    'Property Zip': '{{propertyZip}}',
  },
  unit: {
    'Unit ID': '{{unitId}}',
    'Unit Number': '{{unitNumber}}',
    'Unit Type': '{{unitType}}',
    'Unit Size': '{{unitSize}}',
    'Bedrooms': '{{bedrooms}}',
    'Bathrooms': '{{bathrooms}}',
  },
  rentee: {
    'Rentee Name': '{{renteeName}}',
    'Rentee Email': '{{renteeEmail}}',
    'Rentee Phone': '{{renteePhone}}',
    'Rentee Address': '{{renteeAddress}}',
  },
  terms: {
    'Late Fee Amount': '{{lateFeeAmount}}',
    'Late Fee Days': '{{lateFeeDays}}',
    'Payment Due Day': '{{paymentDueDay}}',
    'Payment Method': '{{paymentMethod}}',
  }
};

const MenuBar = ({ editor, agreementId }) => {
  if (!editor) {
    return null;
  }

  // Add state to control color picker visibility
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Add ref to color picker container
  const colorPickerRef = useRef(null);
  
  // Merge fields dropdown state
  const [showMergeFields, setShowMergeFields] = useState(false);
  const [currentCategory, setCurrentCategory] = useState('agreement');
  const [mergeData, setMergeData] = useState(defaultMergeFields);
  const [isLoading, setIsLoading] = useState(false);
  const mergeFieldsRef = useRef(null);

  // Fetch merge field data when agreement ID changes
  useEffect(() => {
    const fetchMergeData = async () => {
      if (!agreementId) {
        // If no agreement ID, use default fields
        setMergeData(defaultMergeFields);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const data = await getMergeDataForAgreement(agreementId);
        setMergeData(data || defaultMergeFields);
      } catch (err) {
        console.error("Error fetching merge fields:", err);
        setMergeData(defaultMergeFields);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMergeData();
  }, [agreementId]);

  const colors = [
    '#000000', // black
    '#FF0000', // red
    '#0000FF', // blue
    '#008000', // green
    '#FFA500', // orange
    '#800080', // purple
    '#A52A2A', // brown
    '#808080', // gray
  ];

  // Handle clicks outside the color picker to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
        setShowColorPicker(false);
      }
      if (mergeFieldsRef.current && !mergeFieldsRef.current.contains(event.target)) {
        setShowMergeFields(false);
      }
    };
    
    // Add event listener when any dropdown is shown
    if (showColorPicker || showMergeFields) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    // Clean up event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPicker, showMergeFields]);

  // Handler for color button click
  const handleColorClick = (e, color) => {
    e.preventDefault();
    e.stopPropagation();
    editor.chain().focus().setColor(color).run();
    // Optionally close the picker after selection
    setShowColorPicker(false);
  };

  // Toggle color picker
  const toggleColorPicker = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowColorPicker(!showColorPicker);
    setShowMergeFields(false);
  };
  
  // Toggle merge fields dropdown
  const toggleMergeFields = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMergeFields(!showMergeFields);
    setShowColorPicker(false);
  };
  
  // Select merge field category
  const selectCategory = (e, category) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentCategory(category);
  };
  
  // Insert merge field into editor
  const insertMergeField = (category, fieldName) => {
    if (!editor) return;
    
    // Get the field value from mergeData
    const fieldValue = mergeData[category][fieldName];
    
    // Save the current selection before inserting content
    const { from, to } = editor.state.selection;
    
    // Insert the content at the current cursor position
    editor.chain()
      .focus()
      .insertContent(fieldValue)
      .setTextSelection(from + fieldValue.length)
      .run();
      
    // Close the dropdown after insertion
    setShowMergeFields(false);
  };

  // Generic button click handler to prevent navigation issues
  const handleButtonClick = (e, action) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Execute the formatting action
    action();
  };

  // Link button handler
  const handleLinkClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = window.prompt('Enter the URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  // Prevent click events from bubbling up from the menu bar
  const handleMenuBarClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="border-b border-gray-200 p-2 flex flex-wrap gap-2"
      onClick={handleMenuBarClick}
    >
      <button
        onClick={(e) => handleButtonClick(e, () => {
          // Ensure editor is focused first
          editor.view.focus();
          editor.chain().toggleBold().run();
        })}
        className={`p-2 rounded ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}
        title="Bold"
      >
        <i className="fas fa-bold"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => {
          editor.view.focus();
          editor.chain().toggleItalic().run();
        })}
        className={`p-2 rounded ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}
        title="Italic"
      >
        <i className="fas fa-italic"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => {
          editor.view.focus();
          editor.chain().toggleUnderline().run();
        })}
        className={`p-2 rounded ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}
        title="Underline"
      >
        <i className="fas fa-underline"></i>
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      {/* Color Picker */}
      <div className="relative">
        <button
          onClick={toggleColorPicker}
          className="p-2 rounded flex items-center"
          title="Text Color"
        >
          <i className="fas fa-palette"></i>
        </button>
        {showColorPicker && (
          <div className="absolute z-10 left-0 mt-1 flex flex-wrap bg-white border border-gray-300 rounded shadow-lg p-2 w-40" ref={colorPickerRef}>
            {colors.map((color) => (
              <button
                key={color}
                onClick={(e) => handleColorClick(e, color)}
                className="w-6 h-6 m-1 rounded-full border border-gray-300"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBulletList().run())}
        className={`p-2 rounded ${editor.isActive('bulletList') ? 'bg-gray-200' : ''}`}
        title="Bullet List"
      >
        <i className="fas fa-list-ul"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleOrderedList().run())}
        className={`p-2 rounded ${editor.isActive('orderedList') ? 'bg-gray-200' : ''}`}
        title="Numbered List"
      >
        <i className="fas fa-list-ol"></i>
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().setTextAlign('left').run())}
        className={`p-2 rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-gray-200' : ''}`}
        title="Align Left"
      >
        <i className="fas fa-align-left"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().setTextAlign('center').run())}
        className={`p-2 rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-gray-200' : ''}`}
        title="Align Center"
      >
        <i className="fas fa-align-center"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().setTextAlign('right').run())}
        className={`p-2 rounded ${editor.isActive({ textAlign: 'right' }) ? 'bg-gray-200' : ''}`}
        title="Align Right"
      >
        <i className="fas fa-align-right"></i>
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      <button
        onClick={handleLinkClick}
        className={`p-2 rounded ${editor.isActive('link') ? 'bg-gray-200' : ''}`}
        title="Add Link"
      >
        <i className="fas fa-link"></i>
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().insertTable({
          rows: 3,
          cols: 3,
          withHeaderRow: true,
          HTMLAttributes: {
            class: 'custom-table',
            style: 'width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 2px solid #ced4da;'
          },
          cellAttributes: {
            style: 'border: 1px solid #ced4da; padding: 8px; vertical-align: top;'
          },
          headerCellAttributes: {
            style: 'border: 1px solid #ced4da; padding: 8px; background-color: #f8f9fa; font-weight: bold;'
          }
        }).run())}
        className="p-2 rounded"
        title="Insert Table"
      >
        <i className="fas fa-table"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().addColumnBefore().run())}
        className="p-2 rounded"
        title="Add Column Before"
        disabled={!editor.can().addColumnBefore()}
      >
        <i className="fas fa-columns"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().addRowBefore().run())}
        className="p-2 rounded"
        title="Add Row Before"
        disabled={!editor.can().addRowBefore()}
      >
        <i className="fas fa-plus"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().deleteTable().run())}
        className="p-2 rounded"
        title="Delete Table"
        disabled={!editor.can().deleteTable()}
      >
        <i className="fas fa-trash"></i>
      </button>
      
      {/* Merge Fields Dropdown */}
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      <div className="relative">
        <button
          onClick={toggleMergeFields}
          className="p-2 rounded hover:bg-gray-100"
          title="Insert Merge Field"
        >
          <i className="fas fa-tags text-gray-700"></i>
        </button>
        
        {showMergeFields && (
          <div 
            className="absolute z-50 mt-2 left-0 origin-top-left"
            ref={mergeFieldsRef}
            style={{ minWidth: '300px', maxWidth: '320px' }}
          >
            {isLoading ? (
              <div className="bg-white rounded-lg shadow-lg p-4">
                <div className="flex items-center justify-center py-2">
                  <i className="fas fa-spinner fa-spin mr-2 text-blue-500"></i>
                  <span>Loading merge fields...</span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                {/* Category Tabs */}
                <div className="mb-3 flex flex-wrap border-b border-gray-200">
                  {Object.keys(mergeData).map((category) => (
                    <button
                      key={category}
                      className={`py-2 px-2 text-xs font-medium capitalize transition-colors 
                        ${currentCategory === category 
                          ? 'text-blue-600 border-b-2 border-blue-600' 
                          : 'text-gray-600 hover:text-gray-900'}`}
                      onClick={(e) => selectCategory(e, category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                
                {/* Fields List for Current Category */}
                <div className="max-h-60 overflow-y-auto">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    {currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)} Fields
                  </h3>
                  
                  <div className="grid gap-1">
                    {Object.entries(mergeData[currentCategory]).map(([fieldName, fieldValue]) => (
                      <button
                        key={fieldName}
                        className="flex items-center justify-between text-left p-2 rounded-md hover:bg-blue-50 group"
                        onClick={(e) => insertMergeField(currentCategory, fieldName)}
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-700">{fieldName}</div>
                          <code className="text-xs text-gray-400 group-hover:text-blue-500">{fieldValue}</code>
                        </div>
                        <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <i className="fas fa-plus-circle"></i>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const RichTextEditor = ({
  initialContent = '',
  placeholder = 'Start typing...',
  readonly = false,
  onChange,
  height = 'auto',
  label,
  agreementId,
  onEditorReady,
}) => {
  // Track if we're doing a programmatic update to avoid cursor jumps
  const isUpdatingContent = useRef(false);
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialContent,
    editable: !readonly,
    onUpdate: ({ editor }) => {
      if (onChange && !isUpdatingContent.current) {
        onChange(editor.getHTML());
      }
    },
  });

  // Pass editor reference to parent component if needed
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Update editor content when initialContent changes
  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      // Track that we're doing a programmatic update
      isUpdatingContent.current = true;
      
      // Store current selection
      const selection = editor.state.selection;
      
      // Update content
      editor.commands.setContent(initialContent);
      
      // If we had a valid selection, try to restore cursor position
      if (selection && !selection.empty) {
        // Delay to ensure content is fully updated
        setTimeout(() => {
          try {
            // Place cursor at same relative position if possible
            editor.commands.focus();
          } catch (err) {
            console.error('Error restoring cursor position:', err);
          }
          isUpdatingContent.current = false;
        }, 10);
      } else {
        isUpdatingContent.current = false;
      }
    }
  }, [editor, initialContent]);

  return (
    <div className="rich-text-editor w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}
      <div className="border rounded-md overflow-hidden bg-white w-full">
        {!readonly && <MenuBar editor={editor} agreementId={agreementId} />}
        <EditorContent 
          editor={editor} 
          className="prose max-w-none p-4"
          style={{ 
            height: height,
            minHeight: '400px',
            overflow: 'auto'
          }}
        />
      </div>
      <style>{`
        .ProseMirror {
          outline: none;
          width: 100%;
          min-height: 400px;
          padding: 8px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 0;
          overflow: hidden;
          margin-bottom: 16px;
          border: 2px solid #ced4da;
        }
        .ProseMirror table td,
        .ProseMirror table th {
          min-width: 1em;
          border: 2px solid #ced4da;
          padding: 6px 8px;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }
        .ProseMirror table th {
          font-weight: bold;
          background-color: #f8f9fa;
          text-align: left;
        }
        .ProseMirror table .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: rgba(200, 200, 255, 0.4);
          pointer-events: none;
        }
        .ProseMirror table .column-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: 0;
          width: 4px;
          background-color: #adf;
          pointer-events: none;
        }
        .tableWrapper {
          padding: 1em 0;
          overflow-x: auto;
        }
        .resize-cursor {
          cursor: col-resize;
        }
        .rich-text-editor {
          width: 100%;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor; 