const getLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
};

const STORAGE_KEYS = {
  TOKEN: 'token',
  REFRESH_TOKEN: 'refreshToken',
  AUDIO_PROCESSING_PREFS: 'audioProcessingPreferences',
} as const;

export const storage = {
  setToken: (token: string) => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.setItem(STORAGE_KEYS.TOKEN, token);
  },
  getToken: () => {
    const ls = getLocalStorage();
    return ls ? ls.getItem(STORAGE_KEYS.TOKEN) : null;
  },
  removeToken: () => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.removeItem(STORAGE_KEYS.TOKEN);
  },
  setRefreshToken: (token: string) => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
  },
  getRefreshToken: () => {
    const ls = getLocalStorage();
    return ls ? ls.getItem(STORAGE_KEYS.REFRESH_TOKEN) : null;
  },
  removeRefreshToken: () => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  },
  getAudioProcessingPreferences: (): { noiseSuppression: boolean; echoCancellation: boolean; autoGainControl: boolean } | null => {
    const ls = getLocalStorage();
    if (!ls) return null;
    try {
      const stored = ls.getItem(STORAGE_KEYS.AUDIO_PROCESSING_PREFS);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },
  setAudioProcessingPreferences: (prefs: { noiseSuppression: boolean; echoCancellation: boolean; autoGainControl: boolean }) => {
    const ls = getLocalStorage();
    if (!ls) return;
    try {
      ls.setItem(STORAGE_KEYS.AUDIO_PROCESSING_PREFS, JSON.stringify(prefs));
    } catch (error) {
      console.warn('Failed to save audio processing preferences:', error);
    }
  },
};

