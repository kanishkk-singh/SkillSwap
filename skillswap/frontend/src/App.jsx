import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import HomePage      from './pages/HomePage';
import SignupPage    from './pages/SignupPage';
import SkillsPage    from './pages/SkillsPage';
import DashboardPage from './pages/DashboardPage';
import ChatPage      from './pages/ChatPage';
import MeetPage      from './pages/MeetPage';
import ReviewPage    from './pages/ReviewPage';

// Redirect to /signup if not logged in
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  return user ? children : <Navigate to="/signup" replace />;
};

// Redirect to /skills if already logged in
const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  return user ? <Navigate to="/skills" replace /> : children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/"          element={<HomePage />} />
    <Route path="/signup"    element={<GuestRoute><SignupPage /></GuestRoute>} />
    <Route path="/skills"    element={<SkillsPage />} />
    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="/chat/:id"  element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
    <Route path="/meet/:id"  element={<ProtectedRoute><MeetPage /></ProtectedRoute>} />
    <Route path="/review/:id" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
    <Route path="*"          element={<Navigate to="/" replace />} />
  </Routes>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
