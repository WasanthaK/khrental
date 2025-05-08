// Simple Express server for handling API endpoints
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Create a Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createServer() {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(bodyParser.json());
  
  // Create a separate router for API endpoints
  const apiRouter = express.Router();
  
  // Mount the API router before Vite middleware
  app.use('/api', apiRouter);
  
  // Vite dev server for frontend
  const vite = await createViteServer({
    server: { middlewareMode: true }
  });
  app.use(vite.middlewares);
  
  // Add a catch-all route handler for client-side routing
  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    
    // Skip API routes and static files
    if (url.startsWith('/api/') || 
        url.includes('.') || 
        url.startsWith('/_')) {
      return next();
    }
    
    try {
      // For SPA client-side routing - serve the index.html
      console.log(`[SPA Router] Serving index.html for: ${url}`);
      
      // Use Vite to transform and serve index.html
      let html = await vite.transformIndexHtml(url, '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      console.error(`Error handling: ${url}`, e);
      next(e);
    }
  });
  
  // Start server
  const port = process.env.PORT || 5174;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

createServer(); 