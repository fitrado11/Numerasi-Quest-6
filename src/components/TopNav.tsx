import React from 'react';

export type ActiveView = 'map' | 'quiz' | 'stats' | 'teacher';

interface TopNavProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  hasActiveSession: boolean;
  onPrimaryAction: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onNavigate,
  hasActiveSession,
  onPrimaryAction,
}) => {
  const navItems: { id: ActiveView; label: string }[] = [
    { id: 'map', label: 'Daftar Numerasi' },
    { id: 'stats', label: 'Rekap Nilai' },
    { id: 'teacher', label: 'Mode Guru' },
  ];

  const ctaLabel =
    activeView === 'quiz'
      ? 'Daftar Numerasi'
      : hasActiveSession
        ? 'Lanjut Latihan'
        : 'Mulai Latihan';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-8 px-6 py-3.5">
        <button
          type="button"
          onClick={() => onNavigate('map')}
          className="text-left text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 rounded"
        >
          TKA Numerasi SD
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'border-sky-600 text-slate-950 font-semibold'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 bg-sky-600 text-white hover:bg-sky-700"
          >
            {ctaLabel}
          </button>
        </div>
      </div>

      {/* Mobile quick nav */}
      <nav className="flex md:hidden items-center justify-around border-t border-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
        {navItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`px-2 py-1 rounded whitespace-nowrap shrink-0 ${
                active ? 'text-sky-700 font-semibold bg-sky-50' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
