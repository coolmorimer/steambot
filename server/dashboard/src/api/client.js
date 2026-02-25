import axios from 'axios';

const BASE = import.meta.env.PROD ? '/api' : '/api';

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

// ── Attach access-token to every request ─────────────────────────────────────
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── Auto-refresh on 401 ───────────────────────────────────────────────────────
let isRefreshing = false;
let queue = [];

function processQueue(error, token) {
  queue.forEach(p => (error ? p.reject(error) : p.resolve(token)));
  queue = [];
}

api.interceptors.response.use(
  r => r,
  async err => {
    const orig = err.config;
    if (err.response?.status !== 401 || orig._retry) return Promise.reject(err);

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then(token => {
        orig.headers.Authorization = `Bearer ${token}`;
        return api(orig);
      });
    }

    orig._retry   = true;
    isRefreshing  = true;

    try {
      const refresh = localStorage.getItem('refresh_token');
      if (!refresh) throw new Error('no refresh token');

      const { data } = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refresh });
      localStorage.setItem('access_token',  data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
      processQueue(null, data.access_token);

      orig.headers.Authorization = `Bearer ${data.access_token}`;
      return api(orig);
    } catch (e) {
      processQueue(e, null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
