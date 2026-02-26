import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthShell } from './Login';
import api from '../api/client';

export default function VerifyEmail() {
  const [params]          = useSearchParams();
  const token             = params.get('token');
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Токен отсутствует в ссылке.');
      return;
    }

    api.post('/auth/verify-email', { token })
      .then(r => {
        setStatus('success');
        setMessage(r.data.message || 'Email успешно подтверждён!');
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Ошибка подтверждения email.');
      });
  }, [token]);

  return (
    <AuthShell title="Подтверждение email">
      <div className="text-center space-y-4">
        {status === 'loading' && (
          <p className="text-gray-400">Подтверждаем ваш email...</p>
        )}

        {status === 'success' && (
          <>
            <div className="text-4xl">✅</div>
            <p className="text-green-400 font-medium">{message}</p>
            <Link to="/" className="btn-primary w-full block text-center">
              Перейти в Dashboard
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-4xl">❌</div>
            <p className="text-red-400 font-medium">{message}</p>
            <Link to="/login" className="btn-primary w-full block text-center">
              ← Назад к входу
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
