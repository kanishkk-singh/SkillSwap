import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ss_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response error handler
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      window.location.href = '/signup';
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  getMe:    ()     => api.get('/auth/me'),
};

// ── Skills ───────────────────────────────────────────────────────────────────
export const skillsAPI = {
  getAll:  (params) => api.get('/skills', { params }),
  create:  (data)   => api.post('/skills', data),
  remove:  (id)     => api.delete(`/skills/${id}`),
};

// ── Requests ─────────────────────────────────────────────────────────────────
export const requestsAPI = {
  send:         (skillId)         => api.post(`/requests/${skillId}`),
  getIncoming:  ()                => api.get('/requests/incoming'),
  getSent:      ()                => api.get('/requests/sent'),
  getActive:    ()                => api.get('/requests/active'),
  getById:      (id)              => api.get(`/requests/${id}`),
  updateStatus: (id, status)      => api.patch(`/requests/${id}/status`, { status }),
};

// ── Chat ─────────────────────────────────────────────────────────────────────
export const chatAPI = {
  getMessages: (requestId) => api.get(`/chat/${requestId}`),
  send:        (requestId, text) => api.post(`/chat/${requestId}`, { text }),
};

// ── Reviews ──────────────────────────────────────────────────────────────────
export const reviewsAPI = {
  get:    (requestId) => api.get(`/reviews/${requestId}`),
  submit: (requestId, data) => api.post(`/reviews/${requestId}`, data),
};

// ── Stats ────────────────────────────────────────────────────────────────────
export const statsAPI = {
  get: () => api.get('/stats'),
};

export default api;
