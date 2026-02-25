import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthShell } from './Login';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();

  const [form, setForm]       = useState({ name: '', email: '', password: '', password2: '' });
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (form.password !== form.password2) return toast.error('Пароли не совпадают');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name);
      toast.success('Добро пожаловать!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const f = (k) => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <AuthShell title="Регистрация">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Имя (необязательно)</label>
          <input className="input" type="text" placeholder="Ваше имя" value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required autoFocus value={form.email} onChange={f('email')} />
        </div>
        <div>
          <label className="label">Пароль (минимум 8 символов)</label>
          <input className="input" type="password" required minLength={8} value={form.password} onChange={f('password')} />
        </div>
        <div>
          <label className="label">Повторите пароль</label>
          <input className="input" type="password" required value={form.password2} onChange={f('password2')} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Регистрирую...' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="text-brand-400 hover:underline">Войти</Link>
      </p>
    </AuthShell>
  );
}
