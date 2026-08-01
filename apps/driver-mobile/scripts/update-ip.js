const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to check if IP is a Docker internal bridge IP (172.16.0.0 - 172.31.255.255)
function isDockerInternalIp(ip) {
  if (!ip) return false;
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

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
        if (net.family === 'IPv4' && !net.internal && !isDockerInternalIp(net.address)) {
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
        if (net.family === 'IPv4' && !net.internal && !isDockerInternalIp(net.address)) {
          return net.address;
        }
      }
    }
  }

  return '127.0.0.1';
}

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

// If manual override lock is present in .env or environment, do not overwrite
const isManualLock =
  envContent.includes('# MANUAL_IP') ||
  envContent.includes('LOCK_API_IP=true') ||
  process.env.LOCK_API_IP === 'true';

if (isManualLock) {
  console.log('[Update IP] Manual IP override lock detected in .env. Preserving custom EXPO_PUBLIC_API_BASE_URL.');
  process.exit(0);
}

// Check if running inside Docker container
const isInsideDocker = fs.existsSync('/.dockerenv') || process.env.IS_DOCKER === 'true';

// Extract existing IP from .env if present
const match = envContent.match(/EXPO_PUBLIC_API_BASE_URL=http:\/\/([^:/]+):8000/);
const existingIp = match ? match[1] : null;

// If running inside Docker and we already have a non-Docker host IP, preserve it!
if (isInsideDocker && existingIp && existingIp !== '127.0.0.1' && existingIp !== 'localhost' && !isDockerInternalIp(existingIp)) {
  console.log(`[Update IP] Running inside Docker. Preserving valid host IP from .env: ${existingIp}`);
  process.exit(0);
}

const localIp = getLocalIp();

// If running inside Docker and localIp is Docker internal or loopback, keep existing IP if available
if (isInsideDocker && (isDockerInternalIp(localIp) || localIp === '127.0.0.1') && existingIp) {
  console.log(`[Update IP] Running inside Docker. Keeping existing host IP: ${existingIp}`);
  process.exit(0);
}

const apiBaseUrlLine = `EXPO_PUBLIC_API_BASE_URL=http://${localIp}:8000`;

if (envContent.includes('EXPO_PUBLIC_API_BASE_URL=')) {
  envContent = envContent.replace(/EXPO_PUBLIC_API_BASE_URL=.*/g, apiBaseUrlLine);
} else {
  envContent += `\n${apiBaseUrlLine}\n`;
}

envContent = envContent.replace(/\n\n+/g, '\n\n');

fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`[Update IP] Successfully updated .env with local IP: ${localIp}`);
