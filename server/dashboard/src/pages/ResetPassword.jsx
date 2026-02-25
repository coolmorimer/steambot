import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from './Login';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [params]    = useSearchParams();
  const navigate    = useNavigate();
  const token       = params.get('token') || '';

  const [form, setForm]       = useState({ password: '', password2: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) toast.error('Ссылка недействительна');
  }, [token]);

  const submit = async e => {
    e.preventDefault();
    if (form.password !== form.password2) return toast.error('Пароли не совпадают');
    setLoading(true);
    try {
      await api.post('/auth/password/reset', { token, password: form.password });
      toast.success('Пароль изменён!');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка сброса');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Новый пароль">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Новый пароль (мин. 8 символов)</label>
          <input className="input" type="password" required minLength={8}
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <div>
          <label className="label">Повторите пароль</label>
          <input className="input" type="password" required
            value={form.password2} onChange={e => setForm(f => ({ ...f, password2: e.target.value }))} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading || !token}>
          {loading ? 'Сохраняю...' : 'Установить пароль'}
        </button>
        <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-white">← Назад</Link>
      </form>
    </AuthShell>
  );
}
