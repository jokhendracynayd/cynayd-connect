import os from 'os';
import { logger } from './logger';

/**
 * Get the local network IP address (non-loopback, non-internal)
 * Priority: IPv4 addresses, excluding Docker/VirtualBox/VMware interfaces
 */
export function getLocalNetworkIP(): string | null {
  const interfaces = os.networkInterfaces();
  const ipAddresses: string[] = [];

  // Priority order: prefer certain interface names
  const preferredInterfaces = ['Ethernet', 'Wi-Fi', 'WLAN', 'en0', 'eth0'];

  // First pass: collect all IPv4 addresses with their interface info
  const candidates: Array<{
    ip: string;
    interface: string;
    priority: number;
  }> = [];

  for (const [interfaceName, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    const priority = preferredInterfaces.includes(interfaceName) ? 1 : 2;

    for (const addr of addrs) {
      // Only IPv4, not loopback, not internal
      if (
        addr.family === 'IPv4' &&
        !addr.internal &&
        addr.address !== '127.0.0.1'
      ) {
        const ipParts = addr.address.split('.').map(Number);
        
        // Docker bridge networks: 172.16-31.x.x (exclude these)
        const isDockerBridge = ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31;
        
        // Skip Docker bridges, but include all other IPs (10.x, 192.168.x, public IPs)
        if (!isDockerBridge) {
          // Determine if private network (for priority sorting)
          const isPrivate = 
            ipParts[0] === 10 || // 10.0.0.0/8 (includes corporate networks)
            (ipParts[0] === 192 && ipParts[1] === 168) || // 192.168.0.0/16
            (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31); // Shouldn't hit this due to isDockerBridge check
          
          candidates.push({
            ip: addr.address,
            interface: interfaceName,
            // Lower priority number = higher priority
            // Prefer public IPs, then preferred interfaces, then others
            priority: isPrivate ? priority + 5 : priority,
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
    logger.info(`Auto-detected network IP: ${best.ip} (interface: ${best.interface})`);
    return best.ip;
  }

  logger.warn('Could not auto-detect network IP address');
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

