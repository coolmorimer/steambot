import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, MessageCircle, Bug, Send, ArrowLeft,
  Clock, User, ChevronDown, Image, X, RefreshCw,
} from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ═══════════════════════════════════════════════════════════════════════════ */

const TAB = { CHATS: 'chats', BUGS: 'bugs' };

const STATUS_LABELS = {
  open:        { text: 'Открыт',    cls: 'badge-yellow' },
  in_progress: { text: 'В работе',  cls: 'badge-blue'   },
  closed:      { text: 'Закрыт',    cls: 'badge-gray'   },
};

const BADGE_FALLBACK = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium';

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { text: status, cls: 'badge-gray' };
  return <span className={`${s.cls || BADGE_FALLBACK} ${!s.cls ? 'bg-gray-700 text-gray-300' : ''}`}>{s.text}</span>;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Навигационные пилюли админки                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function AdminNav() {
  return (
    <div className="flex gap-2 flex-wrap">
      <Link to="/admin"          className="badge-gray hover:bg-gray-600">Обзор</Link>
      <Link to="/admin/users"    className="badge-gray hover:bg-gray-600">Пользователи</Link>
      <Link to="/admin/plans"    className="badge-gray hover:bg-gray-600">Тарифы</Link>
      <Link to="/admin/config"   className="badge-gray hover:bg-gray-600">Конфигурация</Link>
      <Link to="/admin/support"  className="badge-blue">Поддержка</Link>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Список чатов                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ChatList({ chats, loading, onSelect, onRefresh }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-16 animate-pulse bg-gray-800" />
        ))}
      </div>
    );
  }

  if (!chats.length) {
    return (
      <div className="card text-center py-12">
        <MessageCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Обращений пока нет</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end mb-2">
        <button onClick={onRefresh} className="text-gray-400 hover:text-white transition-colors p-1">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {chats.map(chat => (
        <button
          key={chat.user_id}
          onClick={() => onSelect(chat)}
          className="card w-full text-left hover:border-gray-600 transition-colors flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-300 shrink-0">
            {(chat.name || chat.email || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200 truncate">
                {chat.name || chat.email || chat.user_id.slice(0, 8)}
              </span>
              {parseInt(chat.unread) > 0 && (
                <span className="bg-brand-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {chat.unread}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">{chat.email}</p>
          </div>
          <span className="text-xs text-gray-600 shrink-0">{timeAgo(chat.last_message)}</span>
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Чат-переписка                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ChatConversation({ chat, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadMessages = useCallback(() => {
    api.get(`/support/admin/chats/${chat.user_id}`)
      .then(r => setMessages(r.data))
      .catch(() => toast.error('Ошибка загрузки сообщений'))
      .finally(() => setLoading(false));
  }, [chat.user_id]);

  useEffect(() => {
    loadMessages();
    const iv = setInterval(loadMessages, 8000);
    return () => clearInterval(iv);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/support/admin/chats/${chat.user_id}`, { body: reply.trim() });
      setMessages(prev => [...prev, data]);
      setReply('');
    } catch {
      toast.error('Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-800">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-300">
          {(chat.name || chat.email || '?')[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{chat.name || '—'}</p>
          <p className="text-xs text-gray-500">{chat.email}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Нет сообщений</p>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={clsx('flex', msg.direction === 'out' ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[75%] rounded-xl px-4 py-2 text-sm',
                  msg.direction === 'out'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                <p className={clsx('text-[10px] mt-1', msg.direction === 'out' ? 'text-brand-200' : 'text-gray-500')}>
                  {fmtDate(msg.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply */}
      <div className="border-t border-gray-800 pt-3 flex gap-2">
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Написать ответ…"
          rows={1}
          className="input flex-1 resize-none min-h-[40px] max-h-24"
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim() || sending}
          className="btn-primary px-4 shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Список баг-репортов                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function BugList({ bugs, loading, onSelectBug, onRefresh }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-16 animate-pulse bg-gray-800" />
        ))}
      </div>
    );
  }

  if (!bugs.length) {
    return (
      <div className="card text-center py-12">
        <Bug className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Баг-репортов нет</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end mb-2">
        <button onClick={onRefresh} className="text-gray-400 hover:text-white transition-colors p-1">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {bugs.map(bug => (
        <button
          key={bug.id}
          onClick={() => onSelectBug(bug)}
          className="card w-full text-left hover:border-gray-600 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Bug className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 truncate">{bug.subject}</span>
                <StatusBadge status={bug.status} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 truncate">
                  <User className="w-3 h-3 inline mr-1" />
                  {bug.user_name || bug.user_email || '—'}
                </span>
                <span className="text-xs text-gray-600">{timeAgo(bug.created_at)}</span>
                {bug.has_screenshot && <Image className="w-3 h-3 text-gray-500" />}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Детали баг-репорта                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

function BugDetail({ bug, onBack, onStatusChange }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);

  useEffect(() => {
    api.get(`/support/admin/bugs/${bug.id}`)
      .then(r => setDetail(r.data))
      .catch(() => {
        // fallback — используем данные из списка
        setDetail(bug);
      })
      .finally(() => setLoading(false));
  }, [bug.id]);

  const updateStatus = async (status) => {
    setStatusLoading(true);
    try {
      await api.patch(`/support/admin/bugs/${bug.id}`, { status });
      setDetail(prev => ({ ...prev, status }));
      onStatusChange(bug.id, status);
      toast.success('Статус обновлён');
    } catch {
      toast.error('Ошибка обновления статуса');
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading) {
    return <div className="card h-48 animate-pulse bg-gray-800" />;
  }

  const d = detail || bug;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-white truncate flex-1">{d.subject}</h2>
        <StatusBadge status={d.status} />
      </div>

      <div className="card">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <User className="w-3 h-3" />
          <span>{d.user_name || d.user_email || '—'}</span>
          <span>•</span>
          <Clock className="w-3 h-3" />
          <span>{fmtDate(d.created_at)}</span>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap break-words">
          {d.body || '(нет описания)'}
        </div>

        {/* Screenshot */}
        {d.screenshot && (
          <div className="mt-4">
            <button
              onClick={() => setShowScreenshot(!showScreenshot)}
              className="flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300"
            >
              <Image className="w-4 h-4" />
              {showScreenshot ? 'Скрыть скриншот' : 'Показать скриншот'}
              <ChevronDown className={clsx('w-4 h-4 transition-transform', showScreenshot && 'rotate-180')} />
            </button>
            {showScreenshot && (
              <div className="mt-3 rounded-lg overflow-hidden border border-gray-700">
                <img
                  src={d.screenshot}
                  alt="Скриншот бага"
                  className="max-w-full max-h-[500px] object-contain bg-gray-900"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status controls */}
      <div className="card">
        <p className="text-sm text-gray-400 mb-3">Изменить статус:</p>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(STATUS_LABELS).map(([key, { text }]) => (
            <button
              key={key}
              disabled={d.status === key || statusLoading}
              onClick={() => updateStatus(key)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                d.status === key
                  ? 'bg-brand-600 text-white cursor-default'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50'
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Главная страница AdminSupport                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function AdminSupport() {
  const [tab, setTab] = useState(TAB.CHATS);
  const [chats, setChats] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [bugsLoading, setBugsLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState(null);
  const [selectedBug, setSelectedBug] = useState(null);

  const loadChats = useCallback(() => {
    api.get('/support/admin/chats')
      .then(r => setChats(r.data))
      .catch(() => toast.error('Ошибка загрузки чатов'))
      .finally(() => setChatsLoading(false));
  }, []);

  const loadBugs = useCallback(() => {
    api.get('/support/admin/bugs')
      .then(r => setBugs(r.data))
      .catch(() => toast.error('Ошибка загрузки баг-репортов'))
      .finally(() => setBugsLoading(false));
  }, []);

  useEffect(() => {
    loadChats();
    loadBugs();
  }, [loadChats, loadBugs]);

  const totalUnread = chats.reduce((acc, c) => acc + parseInt(c.unread || 0), 0);

  const handleBugStatusChange = (bugId, newStatus) => {
    setBugs(prev => prev.map(b => b.id === bugId ? { ...b, status: newStatus } : b));
  };

  // Детальный вид чата
  if (selectedChat) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-brand-400" />
          <h1 className="text-xl font-bold text-white">Администрация</h1>
        </div>
        <AdminNav />
        <ChatConversation chat={selectedChat} onBack={() => { setSelectedChat(null); loadChats(); }} />
      </div>
    );
  }

  // Детальный вид бага
  if (selectedBug) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-brand-400" />
          <h1 className="text-xl font-bold text-white">Администрация</h1>
        </div>
        <AdminNav />
        <BugDetail
          bug={selectedBug}
          onBack={() => { setSelectedBug(null); loadBugs(); }}
          onStatusChange={handleBugStatusChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-brand-400" />
        <h1 className="text-xl font-bold text-white">Администрация</h1>
      </div>

      <AdminNav />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab(TAB.CHATS)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            tab === TAB.CHATS ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
          )}
        >
          <MessageCircle className="w-4 h-4" />
          Чаты поддержки
          {totalUnread > 0 && (
            <span className="bg-brand-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {totalUnread}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab(TAB.BUGS)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            tab === TAB.BUGS ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
          )}
        >
          <Bug className="w-4 h-4" />
          Баг-репорты
          {bugs.filter(b => b.status === 'open').length > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {bugs.filter(b => b.status === 'open').length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {tab === TAB.CHATS ? (
        <ChatList
          chats={chats}
          loading={chatsLoading}
          onSelect={setSelectedChat}
          onRefresh={loadChats}
        />
      ) : (
        <BugList
          bugs={bugs}
          loading={bugsLoading}
          onSelectBug={setSelectedBug}
          onRefresh={loadBugs}
        />
      )}
    </div>
  );
}
