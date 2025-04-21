import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container mt-5 text-center">
      <h2>Not Found</h2>
      <p>Could not find the requested resource</p>
      <Link to="/" className="btn btn-primary">
        Return Home
      </Link>
    </div>
  );
} 