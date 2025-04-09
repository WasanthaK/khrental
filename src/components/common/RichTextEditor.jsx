import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';

const MenuBar = ({ editor }) => {
  if (!editor) {
    return null;
  }

  // Add state to control color picker visibility
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Add ref to color picker container
  const colorPickerRef = useRef(null);

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
    };
    
    // Add event listener when color picker is shown
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    // Clean up event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPicker]);

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
  };

  // Generic button click handler to prevent navigation issues
  const handleButtonClick = (e, action) => {
    e.preventDefault();
    e.stopPropagation();
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
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBold().run())}
        className={`p-2 rounded ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}
        title="Bold"
      >
        <i className="fas fa-bold"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleItalic().run())}
        className={`p-2 rounded ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}
        title="Italic"
      >
        <i className="fas fa-italic"></i>
      </button>
      <button
        onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleUnderline().run())}
        className={`p-2 rounded ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}
        title="Underline"
      >
        <i className="fas fa-underline"></i>
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      {/* Color Picker - Changed from hover to click behavior */}
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
    </div>
  );
};

const RichTextEditor = ({ content, onChange, placeholder = 'Start writing...', onEditorReady }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
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
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Call onEditorReady when the editor is initialized
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} className="p-4 min-h-[200px] prose max-w-none" />
    </div>
  );
};

export default RichTextEditor; 