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

// Build API URL - uses current hostname with API port
const buildApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl;
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
    return envUrl;
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
