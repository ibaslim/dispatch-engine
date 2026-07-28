const fs = require('fs');
const path = require('path');
const os = require('os');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  let fallbackIp = null;

  // We want to scan and find the best matching active local IP address.
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip loopback and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        // Prefer common Wi-Fi / Ethernet subnets (192.168.x.x)
        if (net.address.startsWith('192.168.')) {
          return net.address;
        }
        // Save other private subnets (like 10.x.x.x or 172.x.x.x) as fallbacks
        if (net.address.startsWith('10.') || net.address.startsWith('172.')) {
          fallbackIp = net.address;
        }
      }
    }
  }

  return fallbackIp || '127.0.0.1';
}

const localIp = getLocalIp();
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
} else if (fs.existsSync(envExamplePath)) {
  envContent = fs.readFileSync(envExamplePath, 'utf8');
} else {
  envContent = '# Expo Environment Variables\n';
}

const apiBaseUrlLine = `EXPO_PUBLIC_API_BASE_URL=http://${localIp}:8000`;

if (envContent.includes('EXPO_PUBLIC_API_BASE_URL=')) {
  // Replace the existing line
  envContent = envContent.replace(/EXPO_PUBLIC_API_BASE_URL=.*/g, apiBaseUrlLine);
} else {
  // Append to the end of the file
  envContent += `\n${apiBaseUrlLine}\n`;
}

// Clean up double newlines
envContent = envContent.replace(/\n\n+/g, '\n\n');

fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`[Update IP] Successfully updated .env with local IP: ${localIp}`);
