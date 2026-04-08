import { useState, useEffect, useCallback } from 'react';

const VARS = ['{date}', '{time}', '{num}', '{profile}', '{day}'];

const EMPTY_FORM = {
  id:             null,
  name:           '',
  title_template: '',
  body_template:  '',
  schedule_times: [],
  profile_ids:    [],
};

const inputCls = `input-base`;

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [accounts,  setAccounts]  = useState([]);
  const [form,      setForm]      = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [timeError, setTimeError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genStatus,  setGenStatus]  = useState('');
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

  useEffect(() => {
    window.api?.inventoryHasOpenAIKey?.().then(r => setHasAIKey(r?.hasKey || false));
    window.api?.ollamaStatus?.().then(r => setOllamaInfo(r || { available: false, models: [], currentModel: '' }));
    window.api?.inventoryTemplates?.().then(r => { if (Array.isArray(r)) setTemplates(r); });
  }, []);

  function openCreate() {
    setForm({ ...EMPTY_FORM, schedule_times: [] });
    setTimeInput(''); setTimeError(''); setGenError(''); setGenStatus('');
  }

  function openEdit(c) {
    setForm({
      ...c,
      profile_ids:    Array.isArray(c.profile_ids)    ? c.profile_ids    : JSON.parse(c.profile_ids || '[]'),
      schedule_times: Array.isArray(c.schedule_times) ? c.schedule_times : [],
    });
    setTimeInput(''); setTimeError(''); setGenError(''); setGenStatus('');
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
    setGenerating(true); setGenError(''); setGenStatus('fetching');
    try {
      const profileId = form.profile_ids[0];
      const result = await window.api?.inventoryGeneratePost(profileId, useAI, useOllama, selTemplate);
      if (!result?.ok) throw new Error(result?.error || 'Неизвестная ошибка');
      setForm(f => ({ ...f, title_template: result.title, body_template: result.body }));
      setGenStatus('');
    } catch (err) {
      setGenError(err.message || 'Ошибка генерации');
    } finally {
      setGenerating(false); setGenStatus('');
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
    if (!/^\d{2}:\d{2}$/.test(val)) { setTimeError('Неверный формат — введите ЧЧ:ММ, например 17:00'); return; }
    const [h, m] = val.split(':').map(Number);
    if (h > 23 || m > 59) { setTimeError('Часы 0–23, минуты 0–59'); return; }
    if (form.schedule_times.includes(val)) { setTimeError('Это время уже добавлено'); return; }
    setForm(f => ({ ...f, schedule_times: [...f.schedule_times, val].sort() }));
    setTimeInput('');
  }

  function removeTime(t) {
    setForm(f => ({ ...f, schedule_times: f.schedule_times.filter(x => x !== t) }));
  }

  /* ── Форма ── */
  if (form) return (
    <div className="p-5 max-w-2xl animate-fade-in">
      <button
        onClick={() => setForm(null)}
        className="flex items-center gap-1.5 text-sm text-[#66c0f4] hover:text-white mb-5 transition-colors group"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span>
        Назад к кампаниям
      </button>

      <h2 className="text-white font-bold text-lg mb-5">
        {form.id ? 'Редактировать кампанию' : 'Новая кампания'}
      </h2>

      <form onSubmit={handleSave} className="flex flex-col gap-5">

        <FormField label="Название кампании">
          <input required className={inputCls} placeholder="CS2 Trading"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </FormField>

        <FormField label="Заголовок темы">
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {VARS.map(v => (
              <button key={v} type="button" onClick={() => insertVar(v)}
                className="px-2.5 py-1 rounded-lg bg-[#66c0f4]/10 text-[#66c0f4] text-xs font-mono
                           hover:bg-[#66c0f4]/20 transition-colors border border-[#66c0f4]/20">
                {v}
              </button>
            ))}
          </div>
          <input required className={inputCls}
            placeholder="WTS CS2 items #{num} | {date}"
            value={form.title_template}
            onChange={e => setForm(f => ({ ...f, title_template: e.target.value }))} />
        </FormField>

        <FormField label="Текст поста">
          <textarea required rows={4} className={inputCls + ' resize-none'}
            placeholder="Подробное описание вашего объявления..."
            value={form.body_template}
            onChange={e => setForm(f => ({ ...f, body_template: e.target.value }))} />

          <div className="mt-3 p-4 glass-dark rounded-xl">
            <p className="text-xs text-[#66c0f4] font-semibold mb-3 flex items-center gap-1.5">
              <span>🎒</span> Автозаполнение из инвентаря Steam
            </p>

            {templates.length > 0 && (
              <div className="mb-3">
                <label className="text-xs text-[#4d7a8a] mb-1.5 block">Шаблон поста:</label>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => setSelTemplate(t.id)}
                      title={t.desc}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors border ${
                        selTemplate === t.id
                          ? 'bg-[#66c0f4]/15 border-[#66c0f4]/50 text-[#66c0f4]'
                          : 'bg-transparent border-[#3d6070]/50 text-[#4d7a8a] hover:border-[#66c0f4]/30'
                      }`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <GenBtn
                onClick={() => generateFromInventory(false)}
                disabled={generating || form.profile_ids.length === 0}
                loading={generating && !genStatus.includes('generating')}
                icon="📦"
                label="Из инвентаря"
                color="blue"
              />
              {hasAIKey && (
                <GenBtn
                  onClick={() => generateFromInventory(true)}
                  disabled={generating || form.profile_ids.length === 0}
                  loading={generating && genStatus === 'generating'}
                  icon="🤖"
                  label="OpenAI"
                  color="purple"
                />
              )}
              {ollamaInfo.available && (
                <GenBtn
                  onClick={() => generateFromInventory(false, true)}
                  disabled={generating || form.profile_ids.length === 0}
                  loading={generating && genStatus === 'generating'}
                  icon="🧠"
                  label={`Ollama (${ollamaInfo.currentModel})`}
                  color="green"
                />
              )}
            </div>

            {genStatus === 'fetching' && (
              <p className="text-xs text-[#66c0f4] mt-2.5 animate-pulse flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Загружаю инвентарь...
              </p>
            )}
            {genStatus === 'generating' && (
              <p className="text-xs text-purple-400 mt-2.5 animate-pulse flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                AI формирует пост...
              </p>
            )}
            {genError && <p className="text-xs text-red-400 mt-2">✕ {genError}</p>}
            {!hasAIKey && !ollamaInfo.available && (
              <p className="text-xs text-[#3d6070] mt-2">
                💡 Для AI: добавьте openaiKey в config.json или запустите Ollama
              </p>
            )}
          </div>
        </FormField>

        <FormField label="Время публикаций">
          <p className="text-xs text-[#4d7a8a] mb-2.5">
            Ежедневные времена публикации. Можно добавить несколько.
          </p>
          {form.schedule_times.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {form.schedule_times.map(t => (
                <span key={t}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full
                             bg-[#66c0f4]/10 text-[#66c0f4] text-xs font-mono
                             border border-[#66c0f4]/20">
                  {'\u{1F550}'} {t}
                  <button type="button" onClick={() => removeTime(t)}
                    className="text-[#66c0f4]/50 hover:text-red-400 transition-colors ml-0.5">
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
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
                         text-sm rounded-xl transition-colors whitespace-nowrap">
              + Добавить
            </button>
          </div>
          {timeError && <p className="text-xs text-red-400 mt-1.5">x {timeError}</p>}
        </FormField>

        <FormField label="Аккаунты">
          {accounts.length === 0 ? (
            <p className="text-sm text-[#4d7a8a]">Нет аккаунтов. Добавьте их на вкладке Аккаунты.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {accounts.map(a => (
                <label key={a.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer
                              border transition-all
                              ${form.profile_ids.includes(a.id)
                                ? 'bg-[#66c0f4]/10 border-[#66c0f4]/30'
                                : 'bg-[#0e1a26]/40 border-[#3d6070]/50 hover:border-[#3d6070]'}`}>
                  <input type="checkbox"
                    checked={form.profile_ids.includes(a.id)}
                    onChange={() => toggleProfile(a.id)}
                    className="w-4 h-4 accent-[#66c0f4] shrink-0" />
                  <span className={`text-sm truncate ${form.profile_ids.includes(a.id) ? 'text-white' : 'text-[#8fa5b5]'}`}>
                    {a.name}
                  </span>
                  {!a.is_active && (
                    <span className="text-[10px] text-red-400 ml-auto shrink-0">истёкший</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </FormField>

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-[#4db86e] hover:bg-[#5dd880] text-[#0e1a26] font-bold
                       rounded-xl text-sm transition-all disabled:opacity-40
                       shadow-lg shadow-green-500/20 hover:shadow-green-500/30">
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-[#0e1a26] border-t-transparent animate-spin" />
                Сохранение...
              </span>
            ) : 'Сохранить'}
          </button>
          <button type="button" onClick={() => setForm(null)}
            className="px-6 py-2.5 glass text-[#8fa5b5] hover:text-white
                       rounded-xl text-sm transition-colors">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );

  /* ── Список ── */
  return (
    <div className="p-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="section-title">Кампании</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#2a475e] text-[#8fa5b5]">
            {campaigns.length}
          </span>
          {campaigns.filter(c => c.is_active).length > 0 && (
            <span className="badge-online text-xs px-2.5 py-0.5 rounded-full font-medium">
              {campaigns.filter(c => c.is_active).length} активн.
            </span>
          )}
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#66c0f4] hover:bg-[#7ed1ff]
                     text-[#0e1a26] font-bold rounded-xl text-sm transition-all
                     shadow-lg shadow-[#66c0f4]/20 hover:shadow-[#66c0f4]/30">
          <span className="text-base leading-none">+</span>
          Новая кампания
        </button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c, i) => (
            <CampaignCard key={c.id} c={c} index={i}
              onEdit={() => openEdit(c)}
              onToggle={() => handleToggle(c.id)}
              onDelete={() => handleDelete(c.id, c.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function GenBtn({ onClick, disabled, loading, icon, label, color }) {
  const colors = {
    blue:   'bg-[#66c0f4]/10 hover:bg-[#66c0f4]/20 text-[#66c0f4] border-[#66c0f4]/20',
    purple: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/20',
    green:  'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/20',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-40
                  flex items-center gap-1.5 border ${colors[color]}`}>
      {loading
        ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Загрузка...</>
        : <>{icon} {label}</>}
    </button>
  );
}

function CampaignCard({ c, index, onEdit, onToggle, onDelete }) {
  const times = Array.isArray(c.schedule_times) && c.schedule_times.length > 0
    ? c.schedule_times : null;

  return (
    <div
      className="card-hover glass rounded-2xl px-5 py-4 animate-slide-up"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Toggle enabled={!!c.is_active} onChange={onToggle} />
            <p className="font-semibold text-white truncate">{c.name}</p>
          </div>
          <p className="text-xs text-[#4d7a8a] truncate ml-0.5">
            {c.title_template}
          </p>
          {times ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {times.map(t => (
                <span key={t} className="text-xs font-mono px-2 py-0.5 rounded-full
                                         bg-[#66c0f4]/10 text-[#66c0f4] border border-[#66c0f4]/15">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#3d6070] mt-1">{formatMinutes(c.schedule_minutes)}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <button onClick={onEdit}
            className="px-3 py-1.5 text-xs glass hover:bg-[#3a5570]/60
                       text-[#c7d5e0] rounded-lg transition-colors">
            Изменить
          </button>
          <button onClick={onDelete}
            className="px-3 py-1.5 text-xs glass hover:bg-red-900/30
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
      className={`relative inline-flex items-center w-10 h-5 rounded-full transition-colors shrink-0
        ${enabled ? 'bg-[#4db86e]' : 'bg-[#2a475e]'}`}>
      <span className="inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }} />
    </button>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block section-title mb-2">{label}</label>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-[#2a475e]/40 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="w-8 h-8 text-[#3d6070]">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
        </svg>
      </div>
      <p className="text-[#8fa5b5] font-medium mb-1">Нет кампаний</p>
      <p className="text-sm text-[#4d7a8a]">Создайте первую кампанию</p>
    </div>
  );
}

function formatMinutes(m) {
  if (!m || m === 0) return '—';
  if (m < 60)  return `${m} min`;
  if (m < 120) return '1 час';
  if (m % 60 === 0) return `${m / 60} h`;
  return `${m} min`;
}
