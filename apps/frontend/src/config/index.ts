// Get the current hostname and protocol (works for both localhost and network IP)
const getCurrentHost = () => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'localhost';
};

// Get protocol
const getProtocol = () => {
  if (typeof window !== 'undefined') {
    return window.location.protocol;
  }
  return 'http:';
};

const normalizeUrl = (url: string) => {
  if (!url) {
    return url;
  }

  const trimmed = url.trim();

  try {
    // Valid absolute URL
    const absolute = new URL(trimmed);
    return absolute.origin.replace(/\/+$/, '');
  } catch {
    // Allow hostnames or protocol-relative URLs and prefix with https://
    const lower = trimmed.toLowerCase();
    const sanitized = trimmed.replace(/^\/*/, '');

    const candidate =
      lower.startsWith('//') ? `https:${trimmed}` : `https://${sanitized}`;

    try {
      const absolute = new URL(candidate);
      return absolute.origin.replace(/\/+$/, '');
    } catch {
      console.warn('Invalid VITE_*_URL provided, falling back to window location:', trimmed);
      return undefined;
    }
  }
};

// Build API URL - uses current hostname with API port
const buildApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    const normalized = normalizeUrl(envUrl);
    if (normalized) {
      return normalized;
    }
  }
  const fallback = import.meta.env.VITE_API_FALLBACK_URL;
  if (fallback) {
    const normalizedFallback = normalizeUrl(fallback);
    if (normalizedFallback) {
      return normalizedFallback;
    }
  }
  const hostname = getCurrentHost();
  const protocol = getProtocol();
  const port = import.meta.env.VITE_API_PORT || '3000';
  return `${protocol}//${hostname}:${port}`;
};

// Build Socket URL - Socket.io runs on the same server as API (port 3000)
const buildSocketUrl = () => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl) {
    const normalized = normalizeUrl(envUrl);
    if (normalized) {
      return normalized;
    }
  }
  const fallback = import.meta.env.VITE_SOCKET_FALLBACK_URL;
  if (fallback) {
    const normalizedFallback = normalizeUrl(fallback);
    if (normalizedFallback) {
      return normalizedFallback;
    }
  }
  const apiOrigin = buildApiUrl();
  if (apiOrigin) {
    try {
      return new URL(apiOrigin).origin;
    } catch {
      // Ignore and continue to hostname/port fallback
    }
  }
  const hostname = getCurrentHost();
  const protocol = getProtocol();
  const port = import.meta.env.VITE_SOCKET_PORT || import.meta.env.VITE_API_PORT || '3000';
  return `${protocol}//${hostname}:${port}`;
};

// Create config object with getters to ensure dynamic hostname detection
export const config = {
  get apiUrl() {
    return buildApiUrl();
  },
  get socketUrl() {
    return buildSocketUrl();
  },
  signalingPath: '/socket',
};

// Debug logging (only in development)
if (import.meta.env.DEV) {
  setTimeout(() => {
    console.log('🔧 Frontend Configuration:', {
      apiUrl: config.apiUrl,
      socketUrl: config.socketUrl,
      signalingPath: config.signalingPath,
      currentHostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
      protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
    });
  }, 100);
}
