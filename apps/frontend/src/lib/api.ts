import axios, { AxiosError } from 'axios';
import { config } from '../config';

const api = axios.create({
  baseURL: config.apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors with token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(promise => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        processQueue(error);
        isRefreshing = false;
        // Redirect to login if no refresh token
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(
          `${originalRequest.baseURL || api.defaults.baseURL}/api/auth/refresh`,
          { refreshToken }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        
        localStorage.setItem('token', accessToken);
        if (newRefreshToken) {
          localStorage.setItem('refreshToken', newRefreshToken);
        }

        // Update auth store if available (non-blocking)
        try {
          const { useAuthStore } = await import('../store/authStore');
          useAuthStore.setState({ token: accessToken, isAuthenticated: true });
        } catch (e) {
          // Store might not be initialized yet, that's ok - token is already in localStorage
        }

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        
        processQueue(null, accessToken);
        isRefreshing = false;

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        isRefreshing = false;
        
        // Clear tokens and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Room join request methods
export const requestRoomJoin = async (roomCode: string) => {
  const response = await api.post(`/api/rooms/${roomCode}/request-join`);
  return response.data;
};

export const approveJoinRequest = async (roomCode: string, requestId: string) => {
  const response = await api.post(`/api/rooms/${roomCode}/approve/${requestId}`);
  return response.data;
};

export const rejectJoinRequest = async (roomCode: string, requestId: string) => {
  const response = await api.post(`/api/rooms/${roomCode}/reject/${requestId}`);
  return response.data;
};

export const getPendingRequests = async (roomCode: string) => {
  const response = await api.get(`/api/rooms/${roomCode}/pending-requests`);
  return response.data;
};

export const updateRoomSettings = async (roomCode: string, settings: { isPublic: boolean }) => {
  const response = await api.patch(`/api/rooms/${roomCode}/settings`, settings);
  return response.data;
};

export default api;

