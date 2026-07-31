const fs = require('fs');
const path = require('path');
const os = require('os');

function getLocalIp() {
  const interfaces = os.networkInterfaces();

  // Helper to detect virtual network adapters across Windows, Linux, and macOS
  const checkIsVirtual = (lower) =>
    lower.startsWith('vethernet') ||
    lower.startsWith('veth') ||
    lower.startsWith('virbr') ||
    lower.startsWith('br-') ||
    lower.startsWith('docker') ||
    lower.startsWith('tun') ||
    lower.startsWith('tap') ||
    lower.includes('virtual') ||
    lower.includes('wsl') ||
    lower.includes('hyper-v') ||
    lower.includes('vmware') ||
    lower.includes('virtualbox') ||
    lower.includes('loopback');

  // 1. First Pass: Look for real physical Wi-Fi interfaces
  // Windows: "Wi-Fi", "Wireless"
  // Linux: "wlan0", "wlp2s0" (starts with "wl" or "wlan")
  // macOS: "en0" (if Wi-Fi)
  for (const [name, addrs] of Object.entries(interfaces)) {
    const lower = name.toLowerCase();
    const isVirtual = checkIsVirtual(lower);

    const isPhysicalWifi =
      (lower === 'wi-fi' ||
        lower.startsWith('wi-fi') ||
        lower.startsWith('wlan') ||
        lower.startsWith('wlp') ||
        lower.includes('wireless') ||
        lower.includes('wifi')) &&
      !isVirtual;

    if (isPhysicalWifi) {
      for (const net of addrs) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  // 2. Second Pass: Fallback to any non-virtual LAN IPv4 address (e.g. Ethernet: eth0, enp3s0, Ethernet 1)
  for (const [name, addrs] of Object.entries(interfaces)) {
    const lower = name.toLowerCase();
    const isVirtual = checkIsVirtual(lower);

    if (!isVirtual) {
      for (const net of addrs) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  return '127.0.0.1';
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

// If manual override lock is present in .env or environment, do not overwrite manual IP setting
const isManualLock =
  envContent.includes('# MANUAL_IP') ||
  envContent.includes('LOCK_API_IP=true') ||
  process.env.LOCK_API_IP === 'true';

if (isManualLock) {
  console.log('[Update IP] Manual IP override lock detected in .env. Preserving custom EXPO_PUBLIC_API_BASE_URL.');
  process.exit(0);
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
