const getLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
};

export const storage = {
  setToken: (token: string) => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.setItem('token', token);
  },
  getToken: () => {
    const ls = getLocalStorage();
    return ls ? ls.getItem('token') : null;
  },
  removeToken: () => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.removeItem('token');
  },
  setRefreshToken: (token: string) => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.setItem('refreshToken', token);
  },
  getRefreshToken: () => {
    const ls = getLocalStorage();
    return ls ? ls.getItem('refreshToken') : null;
  },
  removeRefreshToken: () => {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.removeItem('refreshToken');
  },
};

