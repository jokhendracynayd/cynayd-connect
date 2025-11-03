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
    set({ hasCheckedAuth: true });
    
    if (!token) return;
    
    try {
      const response = await api.get('/api/auth/me');
      set({ user: response.data.user, isAuthenticated: true });
    } catch (error) {
      storage.removeToken();
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));

