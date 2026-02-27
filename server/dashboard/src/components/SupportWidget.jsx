import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Bug, X, Send, Paperclip, ChevronDown, Camera, Loader2, CheckCircle } from 'lucide-react';
import api from '../api/client';
import clsx from 'clsx';

/* ═══════════════════════════════════════════════════════════════════════════
 *  SupportWidget — плавающие кнопки справа-снизу:
 *    1) Чат поддержки (💬)
 *    2) Баг-репорт    (🐛)
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function SupportWidget() {
  const [chatOpen,   setChatOpen]   = useState(false);
  const [bugOpen,    setBugOpen]    = useState(false);
  const [unread,     setUnread]     = useState(0);

  // Проверяем непрочитанные ответы каждые 30 сек
  useEffect(() => {
    const check = () => api.get('/support/unread').then(r => setUnread(r.data.count)).catch(() => {});
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      {/* ── Плавающие кнопки ──────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Баг-репорт */}
        <button
          onClick={() => { setBugOpen(true); setChatOpen(false); }}
          className="group flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-3 shadow-lg shadow-red-900/30 transition-all hover:scale-105"
          title="Сообщить о баге"
        >
          <Bug className="w-5 h-5" />
          <span className="hidden group-hover:inline text-sm font-medium pr-1">Баг</span>
        </button>

        {/* Чат поддержки */}
        <button
          onClick={() => { setChatOpen(c => !c); setBugOpen(false); }}
          className="relative group flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white rounded-full p-4 shadow-lg shadow-brand-900/40 transition-all hover:scale-105"
          title="Чат поддержки"
        >
          {chatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
          {unread > 0 && !chatOpen && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
              {unread}
            </span>
          )}
        </button>
      </div>

      {/* ── Окно чата ──────────────────────────────────────────────────── */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} onRead={() => setUnread(0)} />}

      {/* ── Окно баг-репорта ──────────────────────────────────────────── */}
      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
    </>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
 *  ChatPanel — чат поддержки
 * ═══════════════════════════════════════════════════════════════════════════ */
function ChatPanel({ onClose, onRead }) {
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  // Загрузка истории
  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await api.get('/support/messages');
      setMessages(data);
      // Пометить ответы как прочитанные
      await api.post('/support/messages/read').catch(() => {});
      onRead?.();
    } catch { /* ignore */ }
    setLoading(false);
  }, [onRead]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Поллинг новых сообщений каждые 10 сек
  useEffect(() => {
    const iv = setInterval(fetchMessages, 10_000);
    return () => clearInterval(iv);
  }, [fetchMessages]);

  // Автопрокрутка
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post('/support/messages', { body: text.trim() });
      setMessages(prev => [...prev, data]);
      setText('');
      inputRef.current?.focus();
    } catch { /* ignore */ }
    setSending(false);
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-brand-400" />
          <span className="font-semibold text-white text-sm">Поддержка</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Напишите нам — мы поможем!</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={clsx(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words',
                msg.direction === 'in'
                  ? 'ml-auto bg-brand-600 text-white rounded-br-md'
                  : 'mr-auto bg-gray-800 text-gray-200 rounded-bl-md border border-gray-700'
              )}
            >
              <p className="whitespace-pre-wrap">{msg.body}</p>
              <p className={clsx(
                'text-[10px] mt-1',
                msg.direction === 'in' ? 'text-brand-200' : 'text-gray-500'
              )}>
                {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-gray-700 bg-gray-800/50">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="Сообщение…"
          className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
          maxLength={2000}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white rounded-xl p-2 transition-colors"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
 *  BugReportModal — модалка для баг-репорта
 * ═══════════════════════════════════════════════════════════════════════════ */
function BugReportModal({ onClose }) {
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [sending,    setSending]    = useState(false);
  const [done,       setDone]       = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой (макс 5 МБ)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result);
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file.size > 5 * 1024 * 1024) {
          alert('Изображение слишком большое (макс 5 МБ)');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setScreenshot(reader.result);
          setPreview(reader.result);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const handleCaptureScreen = async () => {
    try {
      // HTML5 Screen Capture API
      const canvas = document.createElement('canvas');
      const html = document.documentElement;
      const { scrollWidth, scrollHeight } = html;

      // Используем html2canvas-подобный подход — просто скриншот видимой области
      // через canvas
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Вместо сложного canvas — предложим вставить из буфера
      alert('Сделайте скриншот (PrtScr) и вставьте его сюда через Ctrl+V');
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await api.post('/support/bugs', {
        subject: subject.trim(),
        body: body.trim(),
        screenshot,
      });
      setDone(true);
      setTimeout(onClose, 2000);
    } catch {
      alert('Ошибка отправки. Попробуйте ещё раз.');
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onPaste={handlePaste}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-red-400" />
            <span className="font-semibold text-white">Сообщить о баге</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          /* Успех */
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-white font-semibold">Баг-репорт отправлен!</p>
            <p className="text-gray-400 text-sm">Спасибо, мы разберёмся 🔧</p>
          </div>
        ) : (
          /* Форма */
          <div className="p-5 space-y-4">
            {/* Тема */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Тема</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Кратко опишите проблему"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                maxLength={255}
              />
            </div>

            {/* Описание */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Описание</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Подробно опишите баг: что делали, что ожидали, что произошло"
                rows={4}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors resize-none"
                maxLength={5000}
              />
            </div>

            {/* Скриншот */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Скриншот <span className="text-gray-600">(вставьте Ctrl+V или выберите файл)</span>
              </label>

              {preview ? (
                <div className="relative group">
                  <img
                    src={preview}
                    alt="Скриншот"
                    className="w-full max-h-48 object-contain rounded-xl border border-gray-600"
                  />
                  <button
                    onClick={() => { setScreenshot(null); setPreview(null); }}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-800 border border-dashed border-gray-600 rounded-xl py-3 text-sm text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                    Выбрать файл
                  </button>
                  <button
                    onClick={handleCaptureScreen}
                    className="flex items-center justify-center gap-2 bg-gray-800 border border-dashed border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
                    title="Сделайте скриншот (PrtScr) и вставьте Ctrl+V"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Кнопка */}
            <button
              onClick={handleSubmit}
              disabled={!subject.trim() || !body.trim() || sending}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Отправка…</>
              ) : (
                <><Bug className="w-4 h-4" /> Отправить баг-репорт</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
