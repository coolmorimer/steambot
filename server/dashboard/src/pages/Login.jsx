import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [form, setForm]     = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Вход в систему">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required autoFocus
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className="label">Пароль</label>
          <input className="input" type="password" required
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Вхожу...' : 'Войти'}
        </button>
      </form>
      <div className="mt-4 text-center space-y-2">
        <Link to="/forgot-password" className="text-sm text-brand-400 hover:underline block">
          Забыли пароль?
        </Link>
        <p className="text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-brand-400 hover:underline">Зарегистрироваться</Link>
        </p>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-4">
            <span className="text-white text-xl font-bold">SP</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-gray-500 text-sm mt-1">Steam Poster Bot</p>
        </div>
        <div className="card">{children}</div>
      </div>
    </div>
  );
}
