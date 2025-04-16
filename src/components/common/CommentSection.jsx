import React, { useState } from 'react';

/**
 * A simple comment section component
 * @param {Object} props - Component props
 * @param {Array} props.comments - Array of comments to display
 * @param {Function} props.onAddComment - Function to call when adding a comment
 * @param {boolean} props.loading - Whether the comments are loading
 */
const CommentSection = ({ comments = [], onAddComment, loading = false }) => {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newComment.trim()) {
      onAddComment(newComment);
      setNewComment('');
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Comments</h3>
      
      {loading ? (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-sm">No comments yet.</p>
          ) : (
            comments.map((comment, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900">{comment.author || 'Anonymous'}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {comment.date ? new Date(comment.date).toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-gray-700">{comment.text || comment}</p>
              </div>
            ))
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="mt-4">
        <textarea
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          rows="3"
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={!newComment.trim() || loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};

export default CommentSection; 