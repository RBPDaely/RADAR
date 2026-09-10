import React from 'react';
import { MarketPeriodInfo, ThemeMode } from '../types/market';
import { Clock, CalendarDays } from 'lucide-react';

interface UpcomingPeriodsBarProps {
  upcomingPeriods?: MarketPeriodInfo[];
  selectedWindowTs?: number;
  onSelectPeriod?: (ts: number) => void;
  theme?: ThemeMode;
}

export const UpcomingPeriodsBar: React.FC<UpcomingPeriodsBarProps> = ({
  upcomingPeriods = [],
  selectedWindowTs,
  onSelectPeriod,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  if (!upcomingPeriods || upcomingPeriods.length === 0 || !onSelectPeriod) {
    return null;
  }

  return (
    <div
      className={`border rounded-xl px-3 py-2 flex flex-col justify-between font-mono text-xs shadow-md select-none transition-colors h-full ${
        isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#dbe0e7] text-slate-800'
      }`}
    >
      {/* Header bar */}
      <div className={`flex items-center justify-between pb-1 border-b mb-1.5 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className="flex items-center space-x-1.5 font-black text-[11px] uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5 text-[#f0b90b]" />
          <span className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>WAKTU BEBERAPA PERIODE BERIKUTNYA</span>
        </div>
        <div className="flex items-center space-x-1 text-[9px] text-[#089981] font-bold">
          <CalendarDays className="w-3 h-3 text-[#089981]" />
          <span>POLYMARKET SYNC</span>
        </div>
      </div>

      {/* Period Selection Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-1 items-center">
        {upcomingPeriods.map((p) => {
          const isSelected = selectedWindowTs ? selectedWindowTs === p.windowTs : p.isCurrent;
          return (
            <button
              key={p.windowTs}
              onClick={() => onSelectPeriod(p.windowTs)}
              className={`h-full min-h-[38px] px-1.5 py-1 rounded-lg border text-[10px] font-mono font-bold flex flex-col items-center justify-center transition-all ${
                isSelected
                  ? 'bg-gradient-to-b from-[#f0b90b] to-[#d9a406] text-slate-950 border-[#f0b90b] shadow-[0_0_12px_rgba(240,185,11,0.45)] font-black ring-1 ring-[#f0b90b]'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-white hover:border-slate-600 hover:bg-[#252a37]'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-200'
              }`}
              title={`Pantau & beli periode pasar ${p.label}`}
            >
              <span className="truncate w-full text-center leading-tight">
                {p.isCurrent ? '🟢 AKTIF' : p.label.split(' ')[0]}
              </span>
              <span className={`text-[9px] leading-tight ${isSelected ? 'text-slate-900 font-extrabold' : 'opacity-80'}`}>
                {p.label.includes('(') ? p.label.split('(')[1].replace(')', '') : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
