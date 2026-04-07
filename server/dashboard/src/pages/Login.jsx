import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, verify2FA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [form, setForm]     = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [tfaToken, setTfaToken]   = useState(null);
  const [tfaMethod, setTfaMethod] = useState(null);
  const [tfaCode, setTfaCode]     = useState('');

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (data.requires_2fa) {
        setTfaToken(data.tfa_token);
        setTfaMethod(data.method);
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const submit2FA = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await verify2FA(tfaToken, tfaCode);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={tfaToken ? 'Двухфакторная проверка' : 'Вход в систему'} subtitle={tfaToken ? `Код отправлен ${tfaMethod === 'email' ? 'на вашу почту' : 'в Telegram'}` : 'Добро пожаловать обратно!'}>
      {tfaToken ? (
        <>
          <form onSubmit={submit2FA} className="space-y-4">
            <div>
              <label className="label">🔐 Код подтверждения</label>
              <input className="input text-center text-lg tracking-widest font-mono" maxLength={6}
                required autoFocus placeholder="000000" value={tfaCode}
                onChange={e => setTfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </div>
            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading || tfaCode.length !== 6}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '✅ Подтвердить'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => { setTfaToken(null); setTfaCode(''); }} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              ← Назад к входу
            </button>
          </div>
        </>
      ) : (
        <>
      {/* Steam login */}
      <div className="mb-6">
        <a href="/api/oauth/steam"
          className="group relative flex items-center justify-center gap-3 w-full py-3 px-4 bg-gradient-to-r from-[#171a21] to-[#1b2838] hover:from-[#1e2329] hover:to-[#2a475e] border border-gray-700/60 hover:border-gray-600 rounded-xl text-sm font-bold text-white transition-all duration-300 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 256 259" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M128.015 0C58.206 0 1.578 54.244.076 123.143l68.94 28.477c5.864-4.025 12.932-6.378 20.556-6.378.685 0 1.363.021 2.034.058l30.735-44.539v-.625c0-27.879 22.678-50.557 50.56-50.557 27.882 0 50.56 22.678 50.56 50.575 0 27.896-22.678 50.574-50.56 50.574-.42 0-.834-.014-1.254-.028l-43.835 31.288c.028.539.042 1.082.042 1.631 0 20.904-17.014 37.918-37.923 37.918-18.514 0-33.96-13.314-37.293-30.893L2.527 163.464C18.053 218.596 68.845 259 128.015 259c70.684 0 127.985-57.301 127.985-128.007C256 60.688 198.699 0 128.015 0" fill="#fff"/>
          </svg>
          <span>🎮 Войти через Steam</span>
        </a>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-gray-800/60"></div>
        <span className="text-xs text-gray-600 font-medium">или по email</span>
        <div className="flex-1 h-px bg-gray-800/60"></div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">📧 Email</label>
          <input className="input" type="email" required autoFocus placeholder="you@example.com"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className="label">🔒 Пароль</label>
          <input className="input" type="password" required placeholder="••••••••"
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '🚀 Войти'}
        </button>
      </form>
      <div className="mt-5 text-center space-y-2">
        <Link to="/forgot-password" className="text-sm text-brand-400 hover:text-brand-300 font-medium block transition-colors">
          Забыли пароль?
        </Link>
        <p className="text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">Зарегистрироваться</Link>
        </p>
      </div>
        </>
      )}
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-950 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-brand-500/8 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-purple-500/8 rounded-full blur-3xl" />

      <div className="relative w-full max-w-sm animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-purple-600 rounded-2xl mb-4 shadow-xl shadow-brand-600/30">
            <span className="text-white text-2xl font-extrabold">SP</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-gray-500 text-sm mt-1.5">{subtitle}</p>}
        </div>
        <div className="card-glass p-6">{children}</div>

        <p className="text-center text-xs text-gray-700 mt-6">
          Steam Poster Bot · communityrig.ru
        </p>
      </div>
    </div>
  );
}
