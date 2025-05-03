// Script to start both the CORS proxy and development server
// This is a cross-platform alternative to the npm run dev:with-proxy command

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Determine the correct command based on OS
const isWindows = os.platform() === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('Starting KH Rentals development environment...');
console.log('This will start both the CORS proxy and the development server.');

// Start the CORS proxy
console.log('\n🔄 Starting CORS proxy...');
const proxyProcess = spawn(npmCmd, ['run', 'proxy'], {
  stdio: 'pipe',
  shell: true
});

// Handle proxy output
proxyProcess.stdout.on('data', (data) => {
  console.log(`[PROXY] ${data.toString().trim()}`);
});

proxyProcess.stderr.on('data', (data) => {
  console.error(`[PROXY ERROR] ${data.toString().trim()}`);
});

// Give the proxy a moment to start up
setTimeout(() => {
  // Start the development server
  console.log('\n🚀 Starting development server...');
  const devProcess = spawn(npmCmd, ['run', 'dev'], {
    stdio: 'pipe',
    shell: true
  });

  // Handle dev server output
  devProcess.stdout.on('data', (data) => {
    console.log(`[DEV] ${data.toString().trim()}`);
  });

  devProcess.stderr.on('data', (data) => {
    console.error(`[DEV ERROR] ${data.toString().trim()}`);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping all processes...');
    if (!isWindows) {
      proxyProcess.kill('SIGINT');
      devProcess.kill('SIGINT');
    } else {
      // On Windows, we need to use taskkill
      spawn('taskkill', ['/pid', proxyProcess.pid, '/f', '/t']);
      spawn('taskkill', ['/pid', devProcess.pid, '/f', '/t']);
    }
    process.exit(0);
  });

  console.log('\n✅ Development environment is running!');
  console.log('Access your application at: http://localhost:5174');
  console.log('The CORS proxy is running at: http://localhost:9090');
  console.log('\nPress Ctrl+C to stop all processes.\n');
}, 2000);

// Handle proxy process exit
proxyProcess.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`\n❌ CORS proxy exited with code ${code}`);
    console.log('Make sure the port 9090 is not in use by another application.');
    process.exit(1);
  }
}); 