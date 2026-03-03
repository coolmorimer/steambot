import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Megaphone, Activity, Send, Wallet,
  TrendingUp, Clock, AlertTriangle, CheckCircle2,
  ArrowRight, Zap, Rocket, ArrowLeftRight, CreditCard,
  Sparkles, Star, Plus, ExternalLink,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

/* ══ Animated counter ══ */
function AnimatedNum({ value, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const n = typeof value === 'number' ? value : parseInt(value) || 0;
    if (n === 0) { setDisplay(0); return; }
    const dur = 600;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * n));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [value]);
  return <>{display}{suffix}</>;
}

export default function Dashboard() {
  const { user, sub } = useAuth();
  const [stats, setStats]   = useState(null);
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/profiles').then(r => r.data),
      api.get('/campaigns').then(r => r.data),
      api.get('/jobs?limit=100').then(r => r.data),
    ]).then(([profiles, campaigns, jobsData]) => {
      setStats({ profiles: profiles.length, campaigns: campaigns.length });
      setJobs(jobsData.jobs || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const total = jobs.filter(j => new Date(j.created_at).toDateString() === dateStr).length;
      const done = jobs.filter(j => new Date(j.created_at).toDateString() === dateStr && j.status === 'done').length;
      days.push({ day: dayNames[d.getDay()], total, done });
    }
    return days;
  }, [jobs]);

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '🌙 Доброй ночи' : hour < 12 ? '☀️ Доброе утро' : hour < 17 ? '🌤️ Добрый день' : '🌙 Добрый вечер';

  if (loading) return <PageSkeleton />;

  const todayJobs = jobs.filter(j => new Date(j.created_at).toDateString() === new Date().toDateString()).length;
  const successRate = jobs.length > 0 ? Math.round(jobs.filter(j => j.status === 'done').length / jobs.length * 100) : 0;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;

  /* ── Onboarding — показываем если нет аккаунтов или кампаний ── */
  const hasAccounts  = (stats?.profiles ?? 0) > 0;
  const hasCampaigns = (stats?.campaigns ?? 0) > 0;
  const hasSteam     = !!user?.steam_id;
  const showOnboarding = !hasAccounts || !hasCampaigns;

  const statCards = [
    {
      icon: Users, label: 'Steam аккаунты', value: stats?.profiles ?? 0,
      limit: sub?.limits?.max_steam_accounts, to: '/accounts',
      gradient: 'from-blue-600/20 to-cyan-600/10',
      iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400',
      hint: 'Аккаунты для постинга',
    },
    {
      icon: Megaphone, label: 'Кампании', value: stats?.campaigns ?? 0,
      limit: sub?.limits?.max_campaigns, to: '/campaigns',
      gradient: 'from-purple-600/20 to-pink-600/10',
      iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400',
      hint: 'Автопостинг объявлений',
    },
    {
      icon: Zap, label: 'Заданий сегодня', value: todayJobs,
      limit: sub?.limits?.max_jobs_per_day, to: '/activity',
      gradient: 'from-green-600/20 to-emerald-600/10',
      iconBg: 'bg-green-500/15', iconColor: 'text-green-400',
      hint: 'Выполнено за сегодня',
    },
    {
      icon: ArrowLeftRight, label: 'P2P Обмен', value: 'Открыть',
      to: '/trades',
      gradient: 'from-amber-600/20 to-orange-600/10',
      iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400',
      hint: 'Обменивайте скины',
      isAction: true,
    },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {greeting}, <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">{user?.name || user?.email?.split('@')[0]}</span>!
          </h1>
          <p className="text-gray-500 text-sm mt-1.5 flex items-center gap-2">
            Тариф:
            <span className="inline-flex items-center gap-1 text-brand-400 font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> {sub?.plan_name || 'Free'}
            </span>
            {sub?.status === 'trial' && <span className="badge-yellow">Пробный</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {sub?.status === 'trial' && (
            <Link to="/subscription" className="btn-primary text-sm">
              <Rocket className="w-4 h-4" /> Улучшить
            </Link>
          )}
        </div>
      </div>

      {/* ── Email verification ── */}
      {user && !user.email_verified && <EmailVerificationBanner />}

      {/* ── Onboarding steps ── */}
      {showOnboarding && (
        <div className="card-glass border-brand-500/20 animate-scale-in">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="w-5 h-5 text-brand-400" />
            <h2 className="font-bold text-white">🚀 Быстрый старт</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OnboardingStep
              num={1}
              done={hasSteam}
              title="Привяжите Steam"
              desc="Вставьте Trade URL для привязки"
              to="/settings"
              btn="Привязать"
              emoji="🎮"
            />
            <OnboardingStep
              num={2}
              done={hasAccounts}
              title="Добавьте аккаунт"
              desc="Войдите через QR или логин"
              to="/accounts"
              btn="Добавить"
              emoji="👤"
            />
            <OnboardingStep
              num={3}
              done={hasCampaigns}
              title="Создайте кампанию"
              desc="Настройте автопостинг"
              to="/campaigns"
              btn="Создать"
              emoji="📢"
            />
          </div>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map(({ icon: Icon, label, value, limit, to, gradient, iconBg, iconColor, hint, isAction }, i) => (
          <Link key={label} to={to}
            className="stat-card group"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl`} />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white">
                {isAction ? (
                  <span className="text-base font-semibold">{value}</span>
                ) : (
                  <AnimatedNum value={value} />
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {label}
                {limit != null && !isAction && (
                  <span className="text-gray-600"> / {limit === -1 ? '∞' : limit}</span>
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Chart + Summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title">
              <Activity className="w-5 h-5 text-brand-400" /> Активность
            </h2>
            <div className="flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              <span className="text-sm text-green-400 font-bold"><AnimatedNum value={successRate} suffix="%" /></span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px', fontSize: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.4)' }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Area type="monotone" dataKey="total" name="Всего" stroke="#818cf8" fill="url(#colorPosts)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#818cf8', stroke: '#1e1b4b', strokeWidth: 2 }} />
              <Area type="monotone" dataKey="done" name="Успешно" stroke="#34d399" fill="url(#colorDone)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Summary panel */}
        <div className="card flex flex-col">
          <h2 className="section-title mb-4">
            <Star className="w-5 h-5 text-amber-400" /> Сводка
          </h2>
          <div className="space-y-4 flex-1">
            {/* Success rate bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-400">Успешность</span>
                <span className="text-green-400 font-bold"><AnimatedNum value={successRate} suffix="%" /></span>
              </div>
              <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-600 to-emerald-400 rounded-full transition-all duration-700 ease-out" style={{ width: `${successRate}%` }} />
              </div>
            </div>

            {/* Counters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 text-center">
                <p className="text-xl font-extrabold text-red-400"><AnimatedNum value={failedCount} /></p>
                <p className="text-[10px] text-gray-500 mt-0.5 font-medium">❌ Ошибок</p>
              </div>
              <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3 text-center">
                <p className="text-xl font-extrabold text-yellow-400"><AnimatedNum value={pendingCount} /></p>
                <p className="text-[10px] text-gray-500 mt-0.5 font-medium">⏳ В очереди</p>
              </div>
            </div>
            <div className="bg-brand-500/5 border border-brand-500/10 rounded-xl p-3 text-center">
              <p className="text-xl font-extrabold text-white"><AnimatedNum value={jobs.length} /></p>
              <p className="text-[10px] text-gray-500 mt-0.5 font-medium">📊 Всего заданий</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickAction to="/accounts"      icon="👤" label="Добавить аккаунт" />
        <QuickAction to="/campaigns"     icon="📢" label="Новая кампания" />
        <QuickAction to="/trades/create" icon="🔄" label="Создать обмен" />
        <QuickAction to="/referrals"     icon="🎁" label="Рефералы" />
      </div>

      {/* ── Recent jobs ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">
            <Clock className="w-5 h-5 text-gray-400" /> Последние задания
          </h2>
          <Link to="/activity" className="text-sm text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 transition-colors">
            Все задания <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {jobs.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400 font-medium">Заданий пока нет</p>
            <p className="text-xs text-gray-600 mt-1">Создайте кампанию, чтобы начать автопостинг</p>
            <Link to="/campaigns" className="btn-primary text-sm mt-4 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Создать кампанию
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {jobs.slice(0, 8).map(job => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>

      {/* ── Trial banner ── */}
      {sub?.status === 'trial' && sub?.trial_ends_at && (
        <TrialBanner trialEndsAt={sub.trial_ends_at} />
      )}
    </div>
  );
}

/* ═══════ Onboarding step ═══════ */
function OnboardingStep({ num, done, title, desc, to, btn, emoji }) {
  return (
    <div className={`relative rounded-xl border p-4 transition-all ${
      done
        ? 'border-green-500/20 bg-green-500/5'
        : 'border-gray-700/40 bg-gray-800/30 hover:border-brand-500/30 hover:bg-brand-500/5'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
          done ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-400'
        }`}>
          {done ? '✓' : num}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${done ? 'text-green-400' : 'text-white'}`}>
            {emoji} {title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
          {!done && (
            <Link to={to} className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium mt-2 transition-colors">
              {btn} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════ Quick action card ═══════ */
function QuickAction({ to, icon, label }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-gray-800/50 bg-gray-900/50 px-4 py-3 hover:border-brand-500/30 hover:bg-brand-500/5 transition-all group">
      <span className="text-xl group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm text-gray-400 group-hover:text-white transition-colors font-medium">{label}</span>
    </Link>
  );
}

/* ═══════ Job row ═══════ */
function JobRow({ job }) {
  const icons = {
    done:    <CheckCircle2 className="w-4 h-4 text-green-400" />,
    failed:  <AlertTriangle className="w-4 h-4 text-red-400" />,
    pending: <Clock className="w-4 h-4 text-yellow-400" />,
    running: <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />,
  };

  const statusBg = {
    done:    'bg-green-500/5',
    failed:  'bg-red-500/5',
    pending: '',
    running: 'bg-brand-500/5',
  };

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-800/40 transition-all ${statusBg[job.status] || ''}`}>
      <div className="shrink-0">{icons[job.status] || icons.pending}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate font-medium">{job.campaign_name || 'Кампания'}</p>
        <p className="text-xs text-gray-600">{job.profile_name || ''}</p>
      </div>
      <span className="text-xs text-gray-600 shrink-0 font-mono">
        {new Date(job.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

function TrialBanner({ trialEndsAt }) {
  const days = Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000));
  return (
    <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-200">
            ⏰ Пробный период: <strong>{days} дн.</strong> осталось
          </p>
          <p className="text-xs text-amber-400/60 mt-0.5">Улучшите тариф, чтобы не потерять функции</p>
        </div>
      </div>
      <Link to="/subscription" className="btn bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 text-sm font-bold shadow-lg shadow-amber-600/20 shrink-0 w-full sm:w-auto text-center">
        <Rocket className="w-4 h-4" /> Улучшить тариф
      </Link>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-72 bg-gray-800/60 rounded-xl animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-800/40 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-gray-800/40 animate-pulse" />
    </div>
  );
}

function EmailVerificationBanner() {
  const [sending, setSending] = useState(false);

  const resend = async () => {
    setSending(true);
    try {
      await api.post('/auth/resend-verification');
      toast.success('Письмо для подтверждения отправлено!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-slide-up">
      <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-yellow-300 font-semibold">📧 Email не подтверждён</p>
        <p className="text-xs text-yellow-500/70 mt-0.5">
          Проверьте почту и перейдите по ссылке для подтверждения
        </p>
      </div>
      <button onClick={resend} disabled={sending} className="btn-secondary text-yellow-400 text-sm shrink-0">
        {sending ? 'Отправка...' : '🔄 Отправить повторно'}
      </button>
    </div>
  );
}
