import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Create stable configuration to avoid unnecessary reloads
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react({
        // Ensure HMR works properly
        fastRefresh: true,
        jsxImportSource: 'react',
        // Add these settings to improve HMR behavior with named exports
        include: /\.[jt]sx?$/,
        exclude: /node_modules/,
        // Use proper automatic JSX runtime
        jsxRuntime: 'automatic',
      }),
    ],
    // Improve module handling
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      force: true,
      esbuildOptions: {
        target: 'es2020', // More modern target for better optimization
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      // Preserve casing to avoid Windows issues
      preserveSymlinks: true,
    },
    build: {
      minify: 'terser',
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['react-router-dom'],
          },
        },
      },
    },
    server: {
      // Enable HMR with more stable settings
      hmr: {
        overlay: true,
        timeout: 120000, // 2 minute timeout
        clientPort: 24678, // Fixed port to avoid conflicts
        host: '127.0.0.1', // Use local instead of wildcard
      },
      // Keep other server settings
      watch: {
        usePolling: false,
        interval: 1000,
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      },
      open: false,
    },
    // Set clearScreen to false to preserve console logs
    clearScreen: false,
  };
}); 