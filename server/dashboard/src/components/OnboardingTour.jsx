import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronRight, ChevronLeft, Rocket, PartyPopper } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   ONBOARDING TOUR — пошаговый интерактивный гайд для новых пользователей
   ═══════════════════════════════════════════════════════════════════════════ */

const LS_KEY = 'sp_onboarding_done';

const STEPS = [
  {
    target: null, // welcome — без привязки к элементу
    title: '👋 Добро пожаловать в SteamPoster!',
    body: 'Мы покажем вам основные возможности сервиса за несколько шагов. Это займёт меньше минуты!',
    emoji: '🚀',
    position: 'center',
    route: '/',
  },
  {
    target: '[data-tour="nav-overview"]',
    title: '📊 Обзор',
    body: 'Главная страница с вашей статистикой, графиками и быстрыми действиями. Здесь вы видите общую картину.',
    emoji: '📊',
    position: 'right',
    route: '/',
  },
  {
    target: '[data-tour="nav-accounts"]',
    title: '👤 Steam аккаунты',
    body: 'Добавьте Steam-аккаунты для автопостинга. Войдите через QR-код или логин/пароль — бот будет публиковать от их имени.',
    emoji: '🎮',
    position: 'right',
    route: '/',
  },
  {
    target: '[data-tour="nav-campaigns"]',
    title: '📢 Кампании',
    body: 'Создайте кампанию — это шаблон публикации + расписание. Бот сам будет публиковать объявления на форумах Steam.',
    emoji: '📢',
    position: 'right',
    route: '/',
  },
  {
    target: '[data-tour="nav-activity"]',
    title: '⚡ Активность',
    body: 'Здесь вы видите все выполненные и запланированные задания. Ошибки, успехи — всё как на ладони.',
    emoji: '⚡',
    position: 'right',
    route: '/',
  },
  {
    target: '[data-tour="nav-trades"]',
    title: '🔄 P2P Обмен',
    body: 'Обменивайте скины CS2 с другими пользователями напрямую. Безопасно и без комиссий.',
    emoji: '🔄',
    position: 'right',
    route: '/',
  },
  {
    target: '[data-tour="nav-balance"]',
    title: '💰 Баланс',
    body: 'Управляйте балансом, привяжите Steam через Trade URL. Здесь же история транзакций и вывод средств.',
    emoji: '💰',
    position: 'right',
    route: '/',
  },
  {
    target: '[data-tour="nav-subscription"]',
    title: '💎 Подписка',
    body: 'Выберите тариф и оплатите подписку. Чем выше тариф — тем больше аккаунтов, кампаний и функций.',
    emoji: '💎',
    position: 'right',
    route: '/',
  },
  {
    target: null, // finish — без привязки
    title: '🎉 Готово! Вы подготовлены!',
    body: 'Начните с привязки Steam-аккаунта и создания первой кампании. Если нужна помощь — нажмите кнопку поддержки внизу справа.',
    emoji: '🎉',
    position: 'center',
    route: '/',
    isFinal: true,
  },
];

export default function OnboardingTour({ userId }) {
  const [active, setActive]       = useState(false);
  const [step, setStep]           = useState(0);
  const [spotlight, setSpotlight] = useState(null); // { top, left, width, height }
  const [tooltipPos, setTooltipPos] = useState(null);
  const navigate   = useNavigate();
  const location   = useLocation();
  const rafRef     = useRef(null);

  // Проверяем, нужно ли показывать
  useEffect(() => {
    const key = `${LS_KEY}_${userId}`;
    if (!localStorage.getItem(key)) {
      // Небольшая задержка для красивого появления после загрузки дашборда
      const t = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(t);
    }
  }, [userId]);

  // Пересчитываем позицию spotlight/tooltip при смене шага
  const updatePositions = useCallback(() => {
    const s = STEPS[step];
    if (!s || !s.target || s.position === 'center') {
      setSpotlight(null);
      setTooltipPos(null);
      return;
    }

    const el = document.querySelector(s.target);
    if (!el) {
      setSpotlight(null);
      setTooltipPos(null);
      return;
    }

    const r = el.getBoundingClientRect();
    const pad = 6;

    setSpotlight({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });

    // Tooltip position
    const tooltipW = 340;
    const tooltipH = 200;
    let ttTop, ttLeft;

    if (s.position === 'right') {
      ttLeft = r.right + 16;
      ttTop = r.top + r.height / 2 - tooltipH / 2;
    } else if (s.position === 'bottom') {
      ttLeft = r.left + r.width / 2 - tooltipW / 2;
      ttTop = r.bottom + 16;
    } else if (s.position === 'left') {
      ttLeft = r.left - tooltipW - 16;
      ttTop = r.top + r.height / 2 - tooltipH / 2;
    } else {
      ttLeft = r.right + 16;
      ttTop = r.top;
    }

    // Keep in viewport
    ttTop = Math.max(16, Math.min(ttTop, window.innerHeight - tooltipH - 16));
    ttLeft = Math.max(16, Math.min(ttLeft, window.innerWidth - tooltipW - 16));

    setTooltipPos({ top: ttTop, left: ttLeft });
  }, [step]);

  useEffect(() => {
    if (!active) return;
    // Задержка чтобы DOM обновился (напр. при навигации)
    const t = setTimeout(updatePositions, 100);
    window.addEventListener('resize', updatePositions);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', updatePositions);
    };
  }, [active, step, updatePositions, location.pathname]);

  const finish = useCallback(() => {
    const key = `${LS_KEY}_${userId}`;
    localStorage.setItem(key, '1');
    setActive(false);
  }, [userId]);

  const goNext = () => {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    const nextStep = step + 1;
    const nextRoute = STEPS[nextStep]?.route;
    if (nextRoute && location.pathname !== nextRoute) {
      navigate(nextRoute);
    }
    setStep(nextStep);
  };

  const goPrev = () => {
    if (step <= 0) return;
    const prevStep = step - 1;
    const prevRoute = STEPS[prevStep]?.route;
    if (prevRoute && location.pathname !== prevRoute) {
      navigate(prevRoute);
    }
    setStep(prevStep);
  };

  if (!active) return null;

  const s = STEPS[step];
  const isCenter = s.position === 'center' || !s.target;
  const isFinal = s.isFinal;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[9999] onboarding-overlay">
      {/* Backdrop with cutout */}
      {spotlight ? (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="12"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(0,0,0,0.75)"
            mask="url(#tour-mask)"
            style={{ pointerEvents: 'all' }}
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          style={{ pointerEvents: 'all' }}
        />
      )}

      {/* Spotlight glow ring */}
      {spotlight && (
        <div
          className="absolute rounded-xl border-2 border-brand-400/60 shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all duration-500 ease-out pointer-events-none"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        >
          <div className="absolute inset-0 rounded-xl animate-pulse border border-brand-400/30" />
        </div>
      )}

      {/* Tooltip / Card */}
      <div
        className={`absolute z-10 transition-all duration-500 ease-out ${
          isCenter
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : ''
        }`}
        style={
          !isCenter && tooltipPos
            ? { top: tooltipPos.top, left: tooltipPos.left }
            : undefined
        }
      >
        <div className={`
          bg-gray-900/98 backdrop-blur-2xl border border-gray-700/50
          rounded-2xl shadow-2xl shadow-black/50
          onboarding-card
          ${isCenter ? 'w-[420px] max-w-[90vw] p-8' : 'w-[340px] max-w-[85vw] p-5'}
        `}>
          {/* Close button */}
          <button
            onClick={finish}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700/50 transition-all"
            title="Пропустить обучение"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Emoji */}
          {isCenter && (
            <div className="text-center mb-4">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl text-4xl ${
                isFinal
                  ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20'
                  : 'bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/20'
              } onboarding-bounce`}>
                {s.emoji}
              </div>
            </div>
          )}

          {/* Step indicator (non-center) */}
          {!isCenter && (
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400 text-sm font-bold">
                {step}
              </span>
              <span className="text-xs text-gray-500 font-medium">
                Шаг {step + 1} из {STEPS.length}
              </span>
            </div>
          )}

          {/* Title */}
          <h3 className={`font-extrabold text-white tracking-tight ${isCenter ? 'text-xl text-center' : 'text-lg'}`}>
            {s.title}
          </h3>

          {/* Body */}
          <p className={`text-gray-400 mt-2.5 leading-relaxed ${isCenter ? 'text-sm text-center' : 'text-sm'}`}>
            {s.body}
          </p>

          {/* Progress bar */}
          <div className="mt-5 mb-4">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={finish}
              className="text-xs text-gray-600 hover:text-gray-300 transition-colors font-medium"
            >
              Пропустить
            </button>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={goPrev}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
                >
                  <ChevronLeft className="w-4 h-4" /> Назад
                </button>
              )}
              <button
                onClick={goNext}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg ${
                  isFinal
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 shadow-green-600/20'
                    : 'bg-gradient-to-r from-brand-500 to-purple-600 text-white hover:from-brand-400 hover:to-purple-500 shadow-brand-600/20'
                } active:scale-95`}
              >
                {isFinal ? (
                  <>Начать работу! <PartyPopper className="w-4 h-4" /></>
                ) : (
                  <>Далее <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Кнопка для повторного запуска тура (можно вставить в настройки) */
export function RestartTourButton({ userId }) {
  const handleRestart = () => {
    const key = `${LS_KEY}_${userId}`;
    localStorage.removeItem(key);
    window.location.reload();
  };

  return (
    <button onClick={handleRestart} className="btn-ghost text-sm flex items-center gap-2">
      <Rocket className="w-4 h-4" /> Пройти обучение заново
    </button>
  );
}
