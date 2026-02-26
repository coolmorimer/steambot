import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Megaphone, Activity, Send,
  TrendingUp, Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

export default function Dashboard() {
  const { user, sub } = useAuth();
  const [stats, setStats]   = useState(null);
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/profiles').then(r => r.data),
      api.get('/campaigns').then(r => r.data),
      api.get('/jobs?limit=10').then(r => r.data),
    ]).then(([profiles, campaigns, jobsData]) => {
      setStats({ profiles: profiles.length, campaigns: campaigns.length });
      setJobs(jobsData.jobs || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Доброе утро' : hour < 17 ? 'Добрый день' : 'Добрый вечер';

  if (loading) return <PageSkeleton />;

  const statCards = [
    { icon: Users,    label: 'Steam аккаунты', value: stats?.profiles ?? '–',
      limit: sub?.limits?.max_steam_accounts, to: '/accounts', color: 'blue' },
    { icon: Megaphone, label: 'Кампании', value: stats?.campaigns ?? '–',
      limit: sub?.limits?.max_campaigns, to: '/campaigns', color: 'purple' },
    { icon: Activity, label: 'Заданий сегодня', value: jobs.filter(j => {
        const d = new Date(j.created_at);
        return d.toDateString() === new Date().toDateString();
      }).length, limit: sub?.limits?.max_jobs_per_day, to: '/activity', color: 'green' },
    { icon: Send, label: 'Telegram бот',
      value: (sub?.limits?.max_telegram_bots || 0) > 0 ? 'Доступен' : 'Недоступен',
      to: '/telegram', color: 'cyan' },
  ];

  const colors = { blue: 'brand-500', purple: 'purple-500', green: 'green-500', cyan: 'cyan-500' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {greeting}, {user?.name || user?.email?.split('@')[0]}! 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Тариф: <span className="text-brand-400 font-medium">{sub?.plan_name || 'Free'}</span>
            {sub?.status === 'trial' && <span className="ml-2 badge-yellow">Пробный период</span>}
          </p>
        </div>
        {sub?.status === 'trial' && (
          <Link to="/subscription" className="btn-primary text-sm">
            Улучшить тариф
          </Link>
        )}
      </div>

      {/* Email verification banner */}
      {user && !user.email_verified && (
        <EmailVerificationBanner />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ icon: Icon, label, value, limit, to, color }) => (
          <Link key={label} to={to} className="card hover:border-gray-600 transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg bg-${color === 'blue' ? 'brand-600' : color + '-600'}/20 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${color === 'blue' ? 'brand-400' : color + '-400'}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}{limit ? ` / ${limit === -1 ? '∞' : limit}` : ''}</p>
          </Link>
        ))}
      </div>

      {/* Recent jobs */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Последние задания</h2>
          <Link to="/activity" className="text-sm text-brand-400 hover:underline">Все задания →</Link>
        </div>
        {jobs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">Заданий пока нет. Создайте кампанию!</p>
        ) : (
          <div className="space-y-2">
            {jobs.slice(0, 8).map(job => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>

      {/* Trial / upgrade banner */}
      {sub?.status === 'trial' && sub?.trial_ends_at && (
        <TrialBanner trialEndsAt={sub.trial_ends_at} />
      )}
    </div>
  );
}

function JobRow({ job }) {
  const icons = {
    done:    <CheckCircle2 className="w-4 h-4 text-green-400" />,
    failed:  <AlertTriangle className="w-4 h-4 text-red-400" />,
    pending: <Clock className="w-4 h-4 text-yellow-400" />,
    running: <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />,
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 transition-colors">
      <div className="shrink-0">{icons[job.status] || icons.pending}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{job.campaign_name || 'Кампания'}</p>
        <p className="text-xs text-gray-500">{job.profile_name || ''}</p>
      </div>
      <span className="text-xs text-gray-600 shrink-0">
        {new Date(job.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

function TrialBanner({ trialEndsAt }) {
  const days = Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000));
  return (
    <div className="rounded-xl bg-yellow-900/20 border border-yellow-700/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start sm:items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
        <p className="text-sm text-yellow-200">
          Пробный период заканчивается через <strong>{days} дн.</strong> — улучшите тариф, чтобы не потерять функции.
        </p>
      </div>
      <Link to="/subscription" className="btn text-sm bg-yellow-500 hover:bg-yellow-400 text-gray-900 shrink-0 w-full sm:w-auto text-center">
        Улучшить
      </Link>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-gray-800 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-28 bg-gray-800" />
        ))}
      </div>
      <div className="card h-64 bg-gray-800" />
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
    <div className="rounded-xl border border-yellow-600/30 bg-yellow-900/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-yellow-300 font-medium">Email не подтверждён</p>
        <p className="text-xs text-yellow-500 mt-0.5">
          Проверьте почту и перейдите по ссылке для подтверждения.
        </p>
      </div>
      <button onClick={resend} disabled={sending} className="btn-ghost text-yellow-400 text-sm shrink-0">
        {sending ? 'Отправка...' : 'Отправить повторно'}
      </button>
    </div>
  );
}
