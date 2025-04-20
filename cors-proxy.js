// CORS Proxy Server
import corsAnywhere from 'cors-anywhere';

// Configure the proxy server
const host = 'localhost';
const port = 8080;

// Create and start the proxy server
corsAnywhere.createServer({
  originWhitelist: [], // Allow all origins
  requireHeader: ['origin', 'x-requested-with'],
  removeHeaders: ['cookie', 'cookie2']
}).listen(port, host, function() {
  console.log('CORS Anywhere proxy server running on ' + host + ':' + port);
  console.log('To use: prefix your Supabase URL with http://localhost:8080/');
}); 