import { useState, useEffect, useCallback } from 'react';

const VARS = ['{date}', '{time}', '{num}', '{profile}', '{day}'];

const EMPTY_FORM = {
  id:             null,
  name:           '',
  title_template: '',
  body_template:  '',
  schedule_times: [],   // [“17:00”, “21:00”]
  profile_ids:    [],
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [accounts,  setAccounts]  = useState([]);
  const [form,      setForm]      = useState(null); // null = список, obj = форма
  const [saving,    setSaving]    = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [timeError, setTimeError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genStatus,  setGenStatus]  = useState('');   // 'fetching' | 'generating' | ''
  const [genError,   setGenError]   = useState('');
  const [hasAIKey,   setHasAIKey]   = useState(false);
  const [ollamaInfo, setOllamaInfo] = useState({ available: false, models: [], currentModel: '' });
  const [templates,  setTemplates]  = useState([]);
  const [selTemplate, setSelTemplate] = useState('emoji');

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([
      window.api?.campaignsList() ?? [],
      window.api?.accountsList()  ?? [],
    ]);
    setCampaigns(c);
    setAccounts(a);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Проверяем наличие OpenAI ключа
  useEffect(() => {
    window.api?.inventoryHasOpenAIKey?.().then(r => setHasAIKey(r?.hasKey || false));
    window.api?.ollamaStatus?.().then(r => setOllamaInfo(r || { available: false, models: [], currentModel: '' }));
    window.api?.inventoryTemplates?.().then(r => { if (Array.isArray(r)) setTemplates(r); });
  }, []);

  function openCreate() {
    setForm({ ...EMPTY_FORM, schedule_times: [] });
    setTimeInput('');
    setTimeError('');
    setGenError('');
    setGenStatus('');
  }

  function openEdit(c) {
    setForm({
      ...c,
      profile_ids:    Array.isArray(c.profile_ids)    ? c.profile_ids    : JSON.parse(c.profile_ids || '[]'),
      schedule_times: Array.isArray(c.schedule_times) ? c.schedule_times : [],
    });
    setTimeInput('');
    setTimeError('');
    setGenError('');
    setGenStatus('');
  }

  async function handleToggle(id) {
    await window.api?.campaignsToggle(id);
    load();
  }

  async function handleDelete(id, name) {
    if (!confirm(`Удалить кампанию «${name}»?`)) return;
    await window.api?.campaignsDelete(id);
    load();
  }

  async function handleSave(e) {
    e.preventDefault();
    if (form.schedule_times.length === 0) {
      setTimeError('Добавьте хотя бы одно время публикации');
      return;
    }
    setSaving(true);
    await window.api?.campaignsSave({
      ...form,
      schedule_times: [...form.schedule_times].sort(),
    });
    setSaving(false);
    setForm(null);
    load();
  }

  function insertVar(v) {
    setForm(f => ({ ...f, title_template: f.title_template + v }));
  }

  async function generateFromInventory(useAI, useOllama = false) {
    if (form.profile_ids.length === 0) {
      setGenError('Сначала выберите хотя бы один аккаунт');
      return;
    }
    setGenerating(true);
    setGenError('');
    setGenStatus('fetching');

    try {
      // Берём первый выбранный аккаунт
      const profileId = form.profile_ids[0];
      const result = await window.api?.inventoryGeneratePost(profileId, useAI, useOllama, selTemplate);

      if (!result?.ok) {
        throw new Error(result?.error || 'Неизвестная ошибка');
      }

      setForm(f => ({
        ...f,
        title_template: result.title,
        body_template:  result.body,
      }));
      setGenStatus('');
    } catch (err) {
      setGenError(err.message || 'Ошибка генерации');
    } finally {
      setGenerating(false);
      setGenStatus('');
    }
  }

  function toggleProfile(pid) {
    setForm(f => {
      const ids = f.profile_ids.includes(pid)
        ? f.profile_ids.filter(x => x !== pid)
        : [...f.profile_ids, pid];
      return { ...f, profile_ids: ids };
    });
  }

  function addTime() {
    setTimeError('');
    const val = timeInput.trim();
    if (!val) return;
    if (!/^\d{2}:\d{2}$/.test(val)) {
      setTimeError('Неверный формат — введите ЧЧ:ММ, например 17:00');
      return;
    }
    const [h, m] = val.split(':').map(Number);
    if (h > 23 || m > 59) { setTimeError('Часы 0–23, минуты 0–59'); return; }
    if (form.schedule_times.includes(val)) { setTimeError('Это время уже добавлено'); return; }
    setForm(f => ({ ...f, schedule_times: [...f.schedule_times, val].sort() }));
    setTimeInput('');
  }

  function removeTime(t) {
    setForm(f => ({ ...f, schedule_times: f.schedule_times.filter(x => x !== t) }));
  }

  /* ── Форма ────────────────────────────────────────────────────────────── */
  if (form) return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => setForm(null)}
        className="text-sm text-[#66c0f4] hover:underline mb-4 flex items-center gap-1"
      >
        ← Назад к кампаниям
      </button>

      <h2 className="text-white font-semibold text-lg mb-5">
        {form.id ? 'Редактировать кампанию' : 'Новая кампания'}
      </h2>

      <form onSubmit={handleSave} className="flex flex-col gap-4">

        {/* Название */}
        <Field label="Название">
          <input required className={inputCls} placeholder="CS2 Trading"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>

        {/* Заголовок + переменные */}
        <Field label="Заголовок темы">
          <div className="flex gap-2 mb-2 flex-wrap">
            {VARS.map(v => (
              <button key={v} type="button" onClick={() => insertVar(v)}
                className="px-2 py-0.5 rounded bg-[#2a475e] text-[#66c0f4] text-xs
                           hover:bg-[#3a5570] transition-colors">
                {v}
              </button>
            ))}
          </div>
          <input required className={inputCls}
            placeholder='WTS CS2 items #{num} | {date}'
            value={form.title_template}
            onChange={e => setForm(f => ({ ...f, title_template: e.target.value }))} />
        </Field>

        {/* Текст поста */}
        <Field label="Текст поста">
          <textarea required rows={4} className={inputCls + ' resize-none'}
            placeholder="Подробное описание вашего объявления..."
            value={form.body_template}
            onChange={e => setForm(f => ({ ...f, body_template: e.target.value }))} />

          {/* Генерация из инвентаря */}
          <div className="mt-3 p-3 bg-[#0e1a26] rounded-lg border border-[#3d6070]/50">
            <p className="text-xs text-[#8fa5b5] mb-2">
              🎒 Автозаполнение из инвентаря Steam (выбранного аккаунта)
            </p>

            {/* Выбор шаблона */}
            {templates.length > 0 && (
              <div className="mb-3">
                <label className="text-xs text-[#8fa5b5] mb-1 block">Шаблон поста:</label>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => setSelTemplate(t.id)}
                      title={t.desc}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors border ${
                        selTemplate === t.id
                          ? 'bg-[#66c0f4]/20 border-[#66c0f4] text-[#66c0f4]'
                          : 'bg-[#1b2838] border-[#3d6070]/50 text-[#8fa5b5] hover:border-[#66c0f4]/50'
                      }`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => generateFromInventory(false)}
                disabled={generating || form.profile_ids.length === 0}
                className="px-3 py-1.5 bg-[#2a475e] hover:bg-[#3a5570] text-[#66c0f4]
                           text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
                {generating && !genStatus.includes('generating')
                  ? <><Spinner /> Загрузка инвентаря...</>
                  : '📦 Из инвентаря (шаблон)'}
              </button>
              {hasAIKey && (
                <button type="button" onClick={() => generateFromInventory(true)}
                  disabled={generating || form.profile_ids.length === 0}
                  className="px-3 py-1.5 bg-[#4a2a6e] hover:bg-[#5a3a80] text-[#c89fff]
                             text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
                  {generating && genStatus === 'generating'
                    ? <><Spinner /> AI генерирует...</>
                    : generating
                      ? <><Spinner /> Загрузка инвентаря...</>
                      : '🤖 Сгенерировать через AI'}
                </button>
              )}
              {ollamaInfo.available && (
                <button type="button" onClick={() => generateFromInventory(false, true)}
                  disabled={generating || form.profile_ids.length === 0}
                  className="px-3 py-1.5 bg-[#1a4a2e] hover:bg-[#2a5a3e] text-[#66f4a0]
                             text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
                  {generating && genStatus === 'generating'
                    ? <><Spinner /> Ollama генерирует...</>
                    : generating
                      ? <><Spinner /> Загрузка инвентаря...</>
                      : `🧠 Ollama (${ollamaInfo.currentModel})`}
                </button>
              )}
            </div>
            {genStatus === 'fetching' && (
              <p className="text-xs text-[#66c0f4] mt-2 animate-pulse">
                ⏳ Загружаю инвентарь аккаунта...
              </p>
            )}
            {genStatus === 'generating' && (
              <p className="text-xs text-purple-400 mt-2 animate-pulse">
                🤖 AI формирует пост...
              </p>
            )}
            {genError && (
              <p className="text-xs text-red-400 mt-2">❌ {genError}</p>
            )}
            {!hasAIKey && !ollamaInfo.available && (
              <p className="text-xs text-[#4d7a8a] mt-2">
                💡 Для AI-генерации: добавьте <code>"openaiKey"</code> в <code>config.json</code> или запустите <code>Ollama</code> локально
              </p>
            )}
          </div>
        </Field>

        {/* Время публикаций */}
        <Field label="Время публикаций">
          <p className="text-xs text-[#8fa5b5] mb-2">
            Укажите точные времена ежедневной публикации. Можно добавить несколько.
          </p>

          {/* Чипсы */}
          {form.schedule_times.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {form.schedule_times.map(t => (
                <span key={t}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                             bg-[#2a475e] text-[#66c0f4] text-sm font-mono">
                  🕐 {t}
                  <button type="button" onClick={() => removeTime(t)}
                    className="text-[#4d7a8a] hover:text-red-400 transition-colors leading-none text-base -mr-0.5">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Ввод */}
          <div className="flex gap-2">
            <input
              type="time"
              className={inputCls + ' w-36'}
              value={timeInput}
              onChange={e => { setTimeInput(e.target.value); setTimeError(''); }}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTime())}
            />
            <button type="button" onClick={addTime}
              className="px-4 py-2 bg-[#2a475e] hover:bg-[#3a5570] text-[#66c0f4]
                         text-sm rounded-lg transition-colors whitespace-nowrap">
              + Добавить
            </button>
          </div>
          {timeError && (
            <p className="text-xs text-red-400 mt-1">{timeError}</p>
          )}
        </Field>

        {/* Аккаунты */}
        <Field label="Аккаунты">
          {accounts.length === 0 ? (
            <p className="text-sm text-[#4d7a8a]">Нет аккаунтов. Добавьте их на вкладке «Аккаунты».</p>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map(a => (
                <label key={a.id} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox"
                    checked={form.profile_ids.includes(a.id)}
                    onChange={() => toggleProfile(a.id)}
                    className="w-4 h-4 accent-[#66c0f4]" />
                  <span className={`text-sm ${form.profile_ids.includes(a.id) ? 'text-white' : 'text-[#8fa5b5]'}`}>
                    {a.name}
                  </span>
                  {!a.is_active && (
                    <span className="text-xs text-red-400">куки истекли</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </Field>

        {/* Кнопки */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-[#4db86e] hover:bg-[#5dd880] text-[#1b2838] font-semibold
                       rounded-lg text-sm transition-colors disabled:opacity-40">
            {saving ? 'Сохранение...' : '✓ Сохранить'}
          </button>
          <button type="button" onClick={() => setForm(null)}
            className="px-6 py-2 bg-[#1b2838] hover:bg-[#243748] text-[#c7d5e0]
                       rounded-lg text-sm transition-colors">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );

  /* ── Список ───────────────────────────────────────────────────────────── */
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-[#66c0f4] uppercase tracking-wider">
          Кампании ({campaigns.length})
        </h2>
        <button onClick={openCreate}
          className="px-4 py-2 bg-[#66c0f4] hover:bg-[#7ed1ff] text-[#1b2838] font-semibold
                     rounded-lg text-sm transition-colors">
          + Новая кампания
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-14 text-[#4d7a8a]">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">Нет кампаний. Создайте первую!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(c => (
            <CampaignCard key={c.id} c={c}
              onEdit={() => openEdit(c)}
              onToggle={() => handleToggle(c.id)}
              onDelete={() => handleDelete(c.id, c.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ c, onEdit, onToggle, onDelete }) {
  const times = Array.isArray(c.schedule_times) && c.schedule_times.length > 0
    ? c.schedule_times
    : null;

  return (
    <div className="bg-[#1b2838] rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <p className="font-semibold text-white truncate">{c.name}</p>
            <Toggle enabled={!!c.is_active} onChange={onToggle} />
          </div>
          <p className="text-xs text-[#8fa5b5] mt-1 truncate">
            📝 {c.title_template}
          </p>
          {times ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {times.map(t => (
                <span key={t} className="text-xs font-mono bg-[#2a475e] text-[#66c0f4] px-2 py-0.5 rounded">
                  🕐 {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#4d7a8a] mt-0.5">
              🕐 Каждые {formatMinutes(c.schedule_minutes)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit}
            className="px-3 py-1.5 text-xs bg-[#2a475e] hover:bg-[#3a5570]
                       text-[#c7d5e0] rounded-lg transition-colors">
            Изменить
          </button>
          <button onClick={onDelete}
            className="px-3 py-1.5 text-xs bg-[#2a475e] hover:bg-red-900
                       text-[#4d7a8a] hover:text-red-300 rounded-lg transition-colors">
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange }) {
  return (
    <button onClick={onChange}
      className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors shrink-0
        ${enabled ? 'bg-[#4db86e]' : 'bg-[#3d6070]'}`}>
      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow
                        transition-transform
                        ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#66c0f4] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = `w-full bg-[#1b2838] text-white rounded-lg px-3 py-2 text-sm
  border border-[#3d6070] focus:outline-none focus:border-[#66c0f4]
  placeholder-[#4d7a8a]`;

function formatMinutes(m) {
  if (!m || m === 0) return '—';
  if (m < 60)  return `${m} мин`;
  if (m < 120) return '1 час';
  if (m % 60 === 0) return `${m / 60} ч`;
  return `${m} мин`;
}

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
  );
}
