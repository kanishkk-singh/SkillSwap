import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // while restoring session

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('ss_token');
    if (!token) { setLoading(false); return; }
    authAPI.getMe()
      .then(res => setUser(res.data.user))
      .catch(() => { localStorage.removeItem('ss_token'); })
      .finally(() => setLoading(false));
  }, []);

  const login = async ({ username, password }) => {
    const res = await authAPI.login({ username, password });
    localStorage.setItem('ss_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (formData) => {
    const res = await authAPI.register(formData);
    localStorage.setItem('ss_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('ss_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
