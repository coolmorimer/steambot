import { useState } from 'react';
import { X, Lightbulb } from 'lucide-react';

/**
 * Dismissible hint banner shown on each page.
 * Persists dismissal in localStorage per hint id.
 */
export default function PageHint({ id, emoji, title, children, steps }) {
  const key = `sp_hint_${id}`;
  const [show, setShow] = useState(() => !localStorage.getItem(key));

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(key, '1');
    setShow(false);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-brand-600/8 to-purple-600/5 border border-brand-500/15 p-4 sm:p-5 animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">{emoji || '💡'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className="w-4 h-4 text-brand-400" />
            <p className="text-sm font-bold text-white">{title}</p>
          </div>
          {children && (
            <p className="text-sm text-gray-400 leading-relaxed">{children}</p>
          )}
          {steps && steps.length > 0 && (
            <div className="mt-3 space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-brand-500/15 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="text-sm text-gray-300 leading-relaxed">
                    <span className="font-medium text-white">{step.title}</span>
                    {step.desc && <span className="text-gray-400"> — {step.desc}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          className="text-gray-600 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800/60 transition-all shrink-0"
          title="Скрыть подсказку"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Reset all page hints (used from settings) */
export function resetAllHints() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('sp_hint_'));
  keys.forEach(k => localStorage.removeItem(k));
}
