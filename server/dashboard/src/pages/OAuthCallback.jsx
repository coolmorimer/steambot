import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Handles OAuth redirect — reads tokens from URL hash fragment
 * and stores them, then redirects to dashboard.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const { fetchMe } = useAuth();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      localStorage.setItem('access_token',  accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      fetchMe().then(() => navigate('/', { replace: true }));
    } else {
      navigate('/login?error=oauth_failed', { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Авторизация...</p>
      </div>
    </div>
  );
}
