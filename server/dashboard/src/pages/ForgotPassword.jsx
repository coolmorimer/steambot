import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from './Login';
import { Loader2 } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/password/forgot', { email });
      setSent(true);
    } catch {
      toast.error('Ошибка. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Сброс пароля" subtitle="Восстановим доступ к аккаунту">
      {sent ? (
        <div className="text-center space-y-5 py-4">
          <div className="text-5xl">📬</div>
          <p className="text-green-400 text-sm font-medium">Если такой email зарегистрирован, письмо отправлено.</p>
          <Link to="/login" className="btn-primary w-full block text-center py-3">← Назад к входу</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-gray-400">Введите email — мы пришлём ссылку для сброса пароля.</p>
          <div>
            <label className="label">📧 Email</label>
            <input className="input" type="email" required autoFocus placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '📨 Отправить ссылку'}
          </button>
          <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-white transition-colors">← Назад</Link>
        </form>
      )}
    </AuthShell>
  );
}
