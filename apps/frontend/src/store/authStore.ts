import { create } from 'zustand';
import api from '../lib/api';
import { storage } from '../lib/storage';

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCheckedAuth: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: storage.getToken(),
  isLoading: false,
  isAuthenticated: !!storage.getToken(),
  hasCheckedAuth: false,
  
  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { user, token, refreshToken } = response.data;
      
      storage.setToken(token);
      if (refreshToken) storage.setRefreshToken(refreshToken);
      
      set({ user, token, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  },
  
  register: async (name, email, password) => {
    set({ isLoading: true });
    try {
      const response = await api.post('/api/auth/register', { name, email, password });
      const { user, token, refreshToken } = response.data;
      
      storage.setToken(token);
      if (refreshToken) storage.setRefreshToken(refreshToken);
      
      set({ user, token, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || 'Registration failed');
    }
  },
  
  logout: () => {
    storage.removeToken();
    storage.removeRefreshToken();
    set({ user: null, token: null, isAuthenticated: false });
  },
  
  checkAuth: async () => {
    const token = storage.getToken();
    
    // Set hasCheckedAuth immediately so ProtectedRoute knows we're checking
    set({ hasCheckedAuth: false });
    
    if (!token) {
      set({ hasCheckedAuth: true, isAuthenticated: false, user: null, token: null });
      return;
    }
    
    // Set token in store immediately so components can use it
    set({ token, isAuthenticated: true, hasCheckedAuth: false });
    
    try {
      const response = await api.get('/api/auth/me');
      // Update store with user and token
      set({ 
        user: response.data.user, 
        token, 
        isAuthenticated: true, 
        hasCheckedAuth: true 
      });
    } catch (error: any) {
      // If 401, try to refresh token
      if (error.response?.status === 401) {
        const refreshToken = storage.getRefreshToken();
        if (refreshToken) {
          try {
            const refreshResponse = await api.post('/api/auth/refresh', { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data;
            
            storage.setToken(accessToken);
            if (newRefreshToken) storage.setRefreshToken(newRefreshToken);
            
            // Retry getting user with new token
            const userResponse = await api.get('/api/auth/me');
            set({ 
              user: userResponse.data.user,
              token: accessToken,
              isAuthenticated: true,
              hasCheckedAuth: true 
            });
            return;
          } catch (refreshError) {
            // Refresh failed, clear tokens
            storage.removeToken();
            storage.removeRefreshToken();
          }
        }
      }
      
      // Auth failed, clear everything
      storage.removeToken();
      storage.removeRefreshToken();
      set({ user: null, token: null, isAuthenticated: false, hasCheckedAuth: true });
    }
  },
}));

