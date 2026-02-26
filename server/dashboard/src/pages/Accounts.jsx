import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Trash2, RefreshCw, UploadCloud, Globe,
  AlertTriangle, QrCode, X, Loader2, CheckCircle2,
  LogIn, Shield,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ── Главная страница ──────────────────────────────────────────────────────────

export default function Accounts() {
  const { sub } = useAuth();
  const [profiles, setProfiles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/profiles')
      .then(r => setProfiles(r.data))
      .catch(() => toast.error('Ошибка загрузки аккаунтов'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Удалить аккаунт?')) return;
    try {
      await api.delete(`/profiles/${id}`);
      setProfiles(p => p.filter(x => x.id !== id));
      toast.success('Удалено');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleImport = async (file) => {
    try {
      const text    = await file.text();
      const data    = JSON.parse(text);
      const cookies = Array.isArray(data) ? data : data.cookies;
      if (!cookies?.length) throw new Error('Нет cookies в файле');

      const name = file.name.replace(/\.json$/i, '');
      await api.post('/profiles/import', { name, cookies, target_url: data.target_url || '' });
      toast.success(`Аккаунт "${name}" добавлен`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Ошибка импорта');
    }
  };

  const limit  = sub?.limits?.max_steam_accounts ?? 1;
  const isUnlimited = limit === -1;
  const canAdd = isUnlimited || profiles.length < limit;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Steam аккаунты</h1>
          <p className="text-gray-500 text-sm">{profiles.length} / {isUnlimited ? '∞' : limit}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={load} className="btn-ghost" title="Обновить">
            <RefreshCw className="w-4 h-4" />
          </button>
          {canAdd ? (
            <>
              <button onClick={() => setShowModal(true)} className="btn-primary">
                <LogIn className="w-4 h-4" /> Добавить аккаунт
              </button>
              <input ref={fileRef} type="file" accept=".json" className="hidden"
                onChange={e => e.target.files[0] && handleImport(e.target.files[0])} />
              <button onClick={() => fileRef.current?.click()} className="btn-ghost">
                <UploadCloud className="w-4 h-4" /> Импорт cookies
              </button>
            </>
          ) : (
            <div className="badge-yellow">Лимит достигнут</div>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-16 animate-pulse bg-gray-800" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState
          title="Нет аккаунтов"
          desc="Войдите через QR-код приложения Steam или введите логин и пароль."
          action={canAdd ? (
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <LogIn className="w-4 h-4" /> Добавить аккаунт
            </button>
          ) : null}
        />
      ) : (
        <div className="space-y-2">
          {profiles.map(p => (
            <ProfileCard key={p.id} profile={p} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {!canAdd && (
        <div className="rounded-xl bg-yellow-900/20 border border-yellow-700/40 p-3 flex gap-2 items-center text-sm text-yellow-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Достигнут лимит аккаунтов. Улучшите подписку.
        </div>
      )}

      {showModal && (
        <LoginModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

// ── Модальное окно входа ──────────────────────────────────────────────────────

const POLL_MS = 2500;
const QR_MS   = 2200;

function LoginModal({ onClose, onSuccess }) {
  // ── Форма ──
  const [name, setName]         = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [mode, setMode]         = useState('qr');          // 'qr' | 'credentials'

  // ── Сессия ──
  const [step, setStep]         = useState('form');        // form|loading|qr|credentials|guard|done|error
  const [sessionId, setSid]     = useState(null);
  const [qrImage, setQrImage]   = useState(null);
  const [expiresAt, setExpAt]   = useState(null);
  const [secondsLeft, setSecs]  = useState(null);
  const [errMsg, setErrMsg]     = useState('');

  // ── Форма credentials ──
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [guardCode, setGuard]   = useState('');
  const [busy, setBusy]         = useState(false);

  const pollRef    = useRef(null);
  const qrRef      = useRef(null);
  const timerRef   = useRef(null);
  const expSetRef  = useRef(false);   // защита от двойного запуска таймера

  // Очистка при размонтировании
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(qrRef.current); clearInterval(timerRef.current); }, []);

  const clearPolls = () => {
    clearInterval(pollRef.current);
    clearInterval(qrRef.current);
    clearInterval(timerRef.current);
  };

  const stopSession = useCallback(async (sid) => {
    if (!sid) return;
    try { await api.delete(`/profiles/login/${sid}`); } catch { /* ignore */ }
  }, []);

  const startCountdown = useCallback((expAt) => {
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((expAt - Date.now()) / 1000));
      setSecs(left);
      if (left === 0) clearInterval(timerRef.current);
    }, 1000);
  }, []);

  // Polling статуса — работает для обоих режимов
  const startStatusPoll = useCallback((sid) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/profiles/login/${sid}/status`);
        const { status, expiresAt: ea, error: e } = data;

        if (ea && !expSetRef.current) {
          expSetRef.current = true;
          setExpAt(ea);
          startCountdown(ea);
        }

        if (status === 'done') {
          clearPolls();
          setStep('done');
          toast.success('Аккаунт Steam добавлен!');
          setTimeout(onSuccess, 1400);
        } else if (['expired', 'cancelled'].includes(status)) {
          clearPolls();
          setStep('error');
          setErrMsg('Сессия истекла. Попробуйте ещё раз.');
        } else if (status === 'error') {
          clearPolls();
          setStep('error');
          setErrMsg(e || 'Ошибка при входе.');
        } else if (status === 'waiting_guard') {
          // Guard может прийти и со стороны сервера
          setStep(prev => prev !== 'guard' ? 'guard' : 'guard');
        }
        // loading / waiting / waiting_credentials / checking_* → ждём дальше
      } catch { /* ignore network glitches */ }
    }, POLL_MS);
  }, [onSuccess, startCountdown]);

  // Polling QR-изображения (только для режима qr)
  const startQRPoll = useCallback((sid) => {
    qrRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/profiles/login/${sid}/qr`);
        if (data.qr) {
          setQrImage(data.qr);
          setStep('qr');
        }
      } catch { /* QR ещё не готов */ }
    }, QR_MS);
  }, []);

  // ── Запуск сессии ──
  const handleStart = async () => {
    if (!name.trim()) { toast.error('Введите имя аккаунта'); return; }
    setStep('loading');
    setErrMsg('');
    expSetRef.current = false;

    try {
      const { data } = await api.post('/profiles/login/start', {
        name: name.trim(),
        target_url: targetUrl.trim() || undefined,
        mode,
      });
      const sid = data.sessionId;
      setSid(sid);
      startStatusPoll(sid);

      if (mode === 'qr') {
        startQRPoll(sid);
        // step остаётся 'loading' пока не придёт QR-картинка
      } else {
        setStep('credentials');
      }
    } catch (err) {
      setStep('error');
      setErrMsg(err.response?.data?.error || 'Не удалось запустить сессию');
    }
  };

  // ── Отправить логин/пароль ──
  const handleCredentials = async () => {
    if (!username.trim() || !password) { toast.error('Введите логин и пароль'); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/profiles/login/${sessionId}/credentials`, { username: username.trim(), password });
      if (data.needsGuard) setStep('guard');
      // Если Guard не нужен — statuspoll поймает done
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка входа');
    } finally { setBusy(false); }
  };

  // ── Отправить код Guard ──
  const handleGuard = async () => {
    if (!guardCode.trim()) { toast.error('Введите код'); return; }
    setBusy(true);
    try {
      await api.post(`/profiles/login/${sessionId}/guard`, { code: guardCode.trim() });
      // statuspoll поймает done
    } catch (err) {
      toast.error(err.response?.data?.error || 'Неверный код');
    } finally { setBusy(false); }
  };

  const handleRefresh = async () => {
    clearPolls();
    if (sessionId) await stopSession(sessionId);
    setSid(null); setQrImage(null); setExpAt(null); setSecs(null);
    setUsername(''); setPassword(''); setGuard('');
    expSetRef.current = false;
    setStep('form');
  };

  const handleClose = async () => {
    clearPolls();
    if (sessionId && step !== 'done') await stopSession(sessionId);
    onClose();
  };

  const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">

        {/* Заголовок */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <span className="font-semibold text-white">Добавить Steam аккаунт</span>
          <button onClick={handleClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Форма выбора способа ── */}
          {step === 'form' && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Название аккаунта *</label>
                <input className="input w-full" placeholder="my_steam_account"
                  value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleStart()} autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  URL форума <span className="text-gray-600">(необязательно)</span>
                </label>
                <input className="input w-full" placeholder="https://steamcommunity.com/games/…"
                  value={targetUrl} onChange={e => setTargetUrl(e.target.value)} />
              </div>

              {/* Способ входа */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Способ входа</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'qr',          icon: QrCode, label: 'QR-код',       hint: 'Steam Mobile App' },
                    { id: 'credentials', icon: LogIn,  label: 'Логин/Пароль', hint: 'Ввести вручную' },
                  ].map(({ id, icon: Icon, label, hint }) => (
                    <button key={id} onClick={() => setMode(id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm transition-colors ${
                        mode === id
                          ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}>
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{label}</span>
                      <span className="text-xs opacity-60">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleStart} className="btn-primary w-full">Продолжить</button>
            </>
          )}

          {/* ── Загрузка браузера ── */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              <p className="text-gray-400 text-sm">Запускаем браузер…</p>
            </div>
          )}

          {/* ── QR-код (только изображение, чисто) ── */}
          {step === 'qr' && (
            <>
              <p className="text-sm text-center text-gray-400">
                Откройте <strong className="text-white">Steam</strong> на телефоне:<br />
                <span className="text-gray-500">Настройки → Войти через QR-код</span>
              </p>

              <div className="flex justify-center">
                {qrImage ? (
                  <div className="relative p-4 bg-white rounded-2xl shadow-lg w-full">
                    <img src={`data:image/png;base64,${qrImage}`} alt="Steam QR code"
                      className="w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                    <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" title="Обновляется" />
                  </div>
                ) : (
                  <div className="w-full h-64 bg-gray-800 rounded-2xl flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {secondsLeft !== null ? `Истекает через ${fmtTime(secondsLeft)}` : 'Ожидаем сканирования…'}
                </span>
                <button onClick={handleRefresh} className="btn-ghost text-xs px-2 py-1">
                  <RefreshCw className="w-3 h-3 mr-1 inline" /> Обновить
                </button>
              </div>
            </>
          )}

          {/* ── Форма логин/пароль ── */}
          {step === 'credentials' && (
            <>
              <div className="rounded-xl bg-blue-900/20 border border-blue-700/30 p-3 text-sm text-blue-300">
                Сервер готов. Введите данные аккаунта — они будут переданы браузеру на сервере.
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Логин Steam</label>
                <input className="input w-full" placeholder="username" autoFocus
                  autoComplete="username" value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && document.getElementById('pwd-input')?.focus()} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Пароль</label>
                <input id="pwd-input" className="input w-full" type="password" placeholder="••••••••"
                  autoComplete="current-password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCredentials()} />
              </div>
              <button onClick={handleCredentials} disabled={busy} className="btn-primary w-full">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Войти
              </button>
            </>
          )}

          {/* ── Steam Guard / 2FA ── */}
          {step === 'guard' && (
            <>
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-orange-400" />
                </div>
                <p className="text-white font-semibold">Steam Guard</p>
                <p className="text-gray-500 text-sm">
                  Введите код из приложения <strong className="text-gray-300">Steam Guard</strong><br />
                  или из письма на электронную почту
                </p>
              </div>
              <input
                className="input w-full text-center text-2xl font-mono tracking-widest"
                placeholder="XXXXX" maxLength={8}
                value={guardCode}
                onChange={e => setGuard(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleGuard()}
                autoFocus
              />
              <button onClick={handleGuard} disabled={busy || !guardCode.trim()} className="btn-primary w-full">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Подтвердить
              </button>
            </>
          )}

          {/* ── Успех ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="w-14 h-14 text-green-400" />
              <p className="text-white font-semibold text-lg">Аккаунт добавлен!</p>
            </div>
          )}

          {/* ── Ошибка ── */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-3 text-sm text-red-300 flex gap-2 items-start">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {errMsg || 'Произошла ошибка.'}
              </div>
              <button onClick={handleRefresh} className="btn-primary w-full">
                <RefreshCw className="w-4 h-4" /> Попробовать снова
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Карточка аккаунта ─────────────────────────────────────────────────────────

function ProfileCard({ profile, onDelete }) {
  const [busy, setBusy] = useState(false);

  const statusColor = profile.status === 'active'  ? 'badge-green'
    : profile.status === 'invalid' ? 'badge-red'
    : 'badge-gray';



  const handleCheck = async () => {
    setBusy(true);
    try {
      await api.post(`/profiles/${profile.id}/check`);
      toast.success('Проверка запущена');
    } catch {
      toast.error('Ошибка проверки');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-medium text-sm shrink-0">
        {(profile.name || 'U')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{profile.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={statusColor}>{statusLabels[profile.status] || profile.status}</span>
          {profile.target_url && (
            <a href={profile.target_url} target="_blank" rel="noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Открыть
            </a>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-600 hidden sm:block">
        {new Date(profile.created_at).toLocaleDateString('ru')}
      </p>
      <div className="flex gap-1">
        <button onClick={handleCheck} disabled={busy} className="btn-ghost text-xs px-2 py-1" title="Проверить">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => onDelete(profile.id)} className="btn-ghost text-xs px-2 py-1 hover:text-red-400" title="Удалить">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

const statusLabels = { active: 'Активен', invalid: 'Недействителен', checking: 'Проверяется', unknown: 'Неизвестно' };

export function EmptyState({ title, desc, action }) {
  return (
    <div className="card text-center py-12">
      <p className="text-gray-400 font-medium">{title}</p>
      <p className="text-gray-600 text-sm mt-1">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
