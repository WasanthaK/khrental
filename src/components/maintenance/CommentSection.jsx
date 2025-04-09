import React, { useState } from 'react';
import { formatDateTime } from '../../utils/helpers';

const CommentSection = ({ comments = [], onAddComment, userRole, userName }) => {
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Handle comment submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      const commentData = {
        content: newComment.trim(),
        isInternal,
        createdBy: {
          name: userName,
          role: userRole
        },
        createdat: new Date().toISOString(),
      };
      
      const success = await onAddComment(commentData);
      if (success) {
        setNewComment('');
        setIsInternal(false);
      }
    } catch (err) {
      console.error('Error adding comment:', err.message);
      setError('Failed to add comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStaff = userRole === 'staff' || userRole === 'admin';

  // Filter comments based on user role
  const visibleComments = comments.filter(comment => {
    // If user is staff or admin, show all comments
    if (userRole === 'admin' || userRole === 'staff' || userRole === 'maintenance') {
      return true;
    }
    
    // If user is rentee, only show non-internal comments
    return !comment.isInternal;
  });

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border">
      <h3 className="text-lg font-medium mb-4">Comments & Updates</h3>
      
      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="mb-3">
          <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
            Add a comment
          </label>
          <textarea
            id="comment"
            rows="3"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Type your comment here..."
            disabled={isSubmitting}
          ></textarea>
        </div>
        
        {/* Internal comment checkbox only for staff */}
        {isStaff && (
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="checkbox"
              id="internalComment"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="internalComment" className="text-sm text-gray-700">
              Internal comment (only visible to staff)
            </label>
          </div>
        )}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-3" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            disabled={isSubmitting || !newComment.trim()}
          >
            {isSubmitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>
      
      {/* Comments List */}
      {visibleComments.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {visibleComments.map((comment, index) => (
            <div 
              key={index} 
              className={`p-4 rounded-lg ${comment.isInternal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-200'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center">
                  <div className="font-medium text-gray-900">{comment.createdBy?.name || 'Unknown User'}</div>
                  <div className="text-sm text-gray-500 ml-2">({comment.createdBy?.role || 'unknown'})</div>
                  
                  {comment.isInternal && (
                    <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                      Internal
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">{formatDateTime(comment.createdat || comment.createdAt)}</div>
              </div>
              
              <div className="text-gray-700 whitespace-pre-wrap">{comment.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentSection; 