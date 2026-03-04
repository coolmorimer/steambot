import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

/**
 * Collapsible detailed page guide.
 * Always visible as a compact bar; click to expand/collapse full instructions.
 * Remembers open/closed state in localStorage.
 */
export default function PageGuide({ id, emoji, title, sections }) {
  const key = `sp_guide_${id}`;
  const [open, setOpen] = useState(() => localStorage.getItem(key) === '1');

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(key, next ? '1' : '0');
  };

  return (
    <div className="rounded-2xl border border-brand-500/15 bg-gradient-to-r from-brand-600/5 to-purple-600/5 overflow-hidden transition-all">
      {/* Toggle bar — always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-600/5 transition-colors text-left"
      >
        <span className="text-xl shrink-0">{emoji || '📖'}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BookOpen className="w-4 h-4 text-brand-400 shrink-0" />
          <span className="text-sm font-bold text-white truncate">{title}</span>
        </div>
        <span className="text-xs text-gray-500 shrink-0 hidden sm:inline">
          {open ? 'Скрыть' : 'Подробнее'}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        }
      </button>

      {/* Expandable content */}
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 animate-slide-up border-t border-brand-500/10">
          {sections.map((section, si) => (
            <div key={si}>
              {section.heading && (
                <div className="flex items-center gap-2 mb-2">
                  {section.icon && <span className="text-base">{section.icon}</span>}
                  <h3 className="text-sm font-bold text-white">{section.heading}</h3>
                </div>
              )}

              {section.text && (
                <p className="text-sm text-gray-400 leading-relaxed mb-2">{section.text}</p>
              )}

              {section.steps && (
                <div className="space-y-2">
                  {section.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-brand-500/15 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="text-sm leading-relaxed">
                        {typeof step === 'string' ? (
                          <span className="text-gray-300">{step}</span>
                        ) : (
                          <>
                            <span className="font-semibold text-white">{step.title}</span>
                            {step.desc && <span className="text-gray-400"> — {step.desc}</span>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {section.items && (
                <div className="space-y-1.5 mt-1">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-brand-400 shrink-0 mt-0.5">•</span>
                      <div>
                        <span className="font-medium text-white">{item.label}</span>
                        {item.desc && <span className="text-gray-400"> — {item.desc}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {section.tip && (
                <div className="mt-2 rounded-lg bg-yellow-900/10 border border-yellow-700/20 px-3 py-2 text-xs text-yellow-300/90 flex items-start gap-2">
                  <span className="shrink-0">💡</span>
                  <span>{section.tip}</span>
                </div>
              )}

              {section.link && (
                <a href={section.link.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 font-medium mt-2 transition-colors">
                  {section.link.text} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
