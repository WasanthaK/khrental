import React, { useState } from 'react';

const CommentSection = ({ comments, onAddComment, userRole, userName }) => {
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [messageType, setMessageType] = useState('regular'); // 'regular', 'internal', or 'admin_message'

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const success = await onAddComment({
      content: newComment,
      isInternal: messageType === 'internal',
      isAdminMessage: messageType === 'admin_message',
      createdBy: userName,
      role: userRole
    });

    if (success) {
      setNewComment('');
      // Reset message type to regular after posting
      setMessageType('regular');
    }
  };

  const isStaff = userRole === 'staff' || userRole === 'admin';

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="text-lg font-semibold mb-4">Comments & Updates</h3>
      
      {/* Add comment form */}
      <div className="mb-4">
        <h4 className="text-md mb-2">Add a comment</h4>
        <textarea
          className="w-full p-2 border rounded-md mb-2"
          placeholder="Type your comment here..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={4}
        />
        
        {/* Message type selector for staff */}
        {isStaff && (
          <div className="flex items-center mb-2 space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                checked={messageType === 'regular'}
                onChange={() => setMessageType('regular')}
                name="messageType"
              />
              <span>Regular Comment</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                checked={messageType === 'internal'}
                onChange={() => setMessageType('internal')}
                name="messageType"
              />
              <span>Internal Note</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                checked={messageType === 'admin_message'}
                onChange={() => setMessageType('admin_message')}
                name="messageType"
              />
              <span>Message to Rentee</span>
            </label>
          </div>
        )}
        
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Post Comment
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-4">
        {comments.map((comment, index) => {
          // Skip internal comments for non-staff users
          if (comment.isInternal && !isStaff) return null;

          return (
            <div
              key={index}
              className={`p-3 rounded ${
                comment.isInternal 
                  ? 'bg-yellow-50' 
                  : comment.isAdminMessage 
                    ? 'bg-blue-50'
                    : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">{comment.createdBy || 'Unknown User'}</span>
                <span className="text-sm text-gray-500">({comment.role || 'unknown'})</span>
                {comment.isInternal && (
                  <span className="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded">
                    Internal
                  </span>
                )}
                {comment.isAdminMessage && (
                  <span className="bg-blue-200 text-blue-800 text-xs px-2 py-1 rounded">
                    Admin Message
                  </span>
                )}
                {comment.createdat && (
                  <span className="text-sm text-gray-500">
                    {new Date(comment.createdat).toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-gray-700">{comment.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CommentSection; 