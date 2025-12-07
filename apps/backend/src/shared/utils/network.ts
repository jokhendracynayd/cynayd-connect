import os from 'os';
import { logger } from './logger';

/**
 * Get the local network IP address (non-loopback, non-internal)
 * Priority: IPv4 addresses, excluding Docker/VirtualBox/VMware interfaces
 */
export function getLocalNetworkIP(): string | null {
  const interfaces = os.networkInterfaces();

  // Priority order: prefer certain interface names (Windows and Linux/Mac)
  const preferredInterfaces = [
    'Ethernet', 'Wi-Fi', 'WLAN', 
    'en0', 'eth0', 'eth1', 'enp0s3', 'enp0s8',
    'Local Area Connection', '以太网', '本地连接' // Windows Chinese/English
  ];

  // First pass: collect all IPv4 addresses with their interface info
  const candidates: Array<{
    ip: string;
    interface: string;
    priority: number;
    isInternal: boolean;
  }> = [];

  // Debug: log all interfaces found
  const allInterfaces: string[] = [];
  for (const [interfaceName, addrs] of Object.entries(interfaces)) {
    if (addrs) {
      allInterfaces.push(interfaceName);
      for (const addr of addrs) {
        if (addr.family === 'IPv4') {
          logger.debug(`Found interface: ${interfaceName}, IP: ${addr.address}, internal: ${addr.internal}`);
        }
      }
    }
  }
  
  if (allInterfaces.length === 0) {
    logger.warn('No network interfaces found on system');
    return null;
  }

  for (const [interfaceName, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    // Check if interface name matches preferred list (case-insensitive)
    const isPreferred = preferredInterfaces.some(pref => 
      interfaceName.toLowerCase().includes(pref.toLowerCase())
    );
    const priority = isPreferred ? 1 : 2;

    for (const addr of addrs) {
      // Only IPv4, not loopback
      if (
        addr.family === 'IPv4' &&
        addr.address !== '127.0.0.1'
      ) {
        const ipParts = addr.address.split('.').map(Number);
        
        // Docker bridge networks: Only exclude Docker's default bridge (172.17.x.x)
        // Also check interface name for Docker-related names
        // Note: 172.29.x.x is used by Hyper-V/WSL and should NOT be filtered
        const isDockerBridge = 
          (ipParts[0] === 172 && ipParts[1] === 17) || // Docker default bridge (172.17.0.0/16)
          interfaceName.toLowerCase().includes('docker') ||
          interfaceName.toLowerCase().startsWith('br-') || // Docker bridge interfaces
          interfaceName.toLowerCase().startsWith('veth'); // Docker veth interfaces
        
        // Skip Docker bridges
        if (!isDockerBridge) {
          // Determine if private network (for priority sorting)
          const isPrivate = 
            ipParts[0] === 10 || // 10.0.0.0/8 (includes corporate networks)
            (ipParts[0] === 192 && ipParts[1] === 168) || // 192.168.0.0/16
            (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31);
          
          candidates.push({
            ip: addr.address,
            interface: interfaceName,
            isInternal: addr.internal || false,
            // Lower priority number = higher priority
            // Prefer: public IPs > non-internal private IPs > internal private IPs
            // Within each category, prefer preferred interfaces
            priority: isPrivate 
              ? (addr.internal ? priority + 10 : priority + 5) 
              : priority,
          });
        }
      }
    }
  }

  // Sort by priority (lower is better)
  candidates.sort((a, b) => a.priority - b.priority);

  // Return the best candidate
  if (candidates.length > 0) {
    const best = candidates[0];
    const internalNote = best.isInternal ? ' (marked as internal, but using anyway)' : '';
    logger.info(`Auto-detected network IP: ${best.ip} (interface: ${best.interface})${internalNote}`);
    return best.ip;
  }

  // If no candidates found, log why with more details
  logger.warn('Could not auto-detect network IP address');
  logger.warn(`Available interfaces: ${allInterfaces.join(', ')}`);
  
  // Try to provide more helpful debugging info
  const allIPs: string[] = [];
  for (const [interfaceName, addrs] of Object.entries(interfaces)) {
    if (addrs) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4') {
          allIPs.push(`${addr.address} (${interfaceName}, internal: ${addr.internal})`);
        }
      }
    }
  }
  
  if (allIPs.length > 0) {
    logger.warn(`Found IPv4 addresses: ${allIPs.join(', ')}`);
    logger.warn('All addresses were filtered out (likely Docker bridges or loopback)');
  } else {
    logger.warn('No IPv4 addresses found (system may be IPv6-only)');
  }
  
  logger.warn('Solution: Set MEDIASOUP_ANNOUNCED_IP environment variable to your server\'s public IP address');
  return null;
}

/**
 * Get the announced IP for Mediasoup
 * Priority:
 * 1. MEDIASOUP_ANNOUNCED_IP env var (if set and not 'auto')
 * 2. Auto-detected local network IP (if env var is empty or 'auto')
 * 3. undefined (fallback)
 */
export function getAnnouncedIP(): string | undefined {
  const envIP = process.env.MEDIASOUP_ANNOUNCED_IP?.trim();

  // If explicitly set and not 'auto', use it
  if (envIP && envIP !== '' && envIP !== 'auto') {
    logger.info(`Using MEDIASOUP_ANNOUNCED_IP from environment: ${envIP}`);
    return envIP;
  }

  // Auto-detect
  const autoIP = getLocalNetworkIP();
  if (autoIP) {
    logger.info(`Using auto-detected IP: ${autoIP}`);
    return autoIP;
  }

  logger.warn(
    'No MEDIASOUP_ANNOUNCED_IP set and auto-detection failed. Remote connections may not work.'
  );
  return undefined;
}

