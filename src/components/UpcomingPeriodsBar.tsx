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
      className={`border rounded-lg px-2.5 py-1.5 flex flex-col justify-between font-mono text-xs shadow-sm select-none transition-colors h-full ${
        isDark ? 'bg-[#181d28] border-[#2a2e39]' : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      {/* Mini Header bar */}
      <div className={`flex items-center justify-between pb-1 border-b mb-1 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className="flex items-center space-x-1 font-black text-[10px] uppercase tracking-wide">
          <Clock className="w-3 h-3 text-[#f0b90b]" />
          <span className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>PERIODE BERIKUTNYA</span>
        </div>
        <div className="flex items-center space-x-1 text-[8.5px] text-[#089981] font-bold">
          <CalendarDays className="w-2.5 h-2.5 text-[#089981]" />
          <span>POLYMARKET SYNC</span>
        </div>
      </div>

      {/* Period Selection Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 flex-1 items-center">
        {upcomingPeriods.map((p) => {
          const isSelected = selectedWindowTs ? selectedWindowTs === p.windowTs : p.isCurrent;
          return (
            <button
              key={p.windowTs}
              onClick={() => onSelectPeriod(p.windowTs)}
              className={`h-full min-h-[28px] px-1 py-0.5 rounded border text-[9.5px] font-mono font-bold flex flex-col items-center justify-center transition-all ${
                isSelected
                  ? 'bg-gradient-to-b from-[#f0b90b] to-[#d9a406] text-slate-950 border-[#f0b90b] shadow-[0_0_8px_rgba(240,185,11,0.3)] font-black ring-1 ring-[#f0b90b]'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#9598a1] hover:text-white hover:border-slate-600 hover:bg-[#252a37]'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:text-black hover:bg-slate-100'
              }`}
              title={`Pantau & beli periode pasar ${p.label}`}
            >
              <span className="truncate w-full text-center leading-tight">
                {p.isCurrent ? '🟢 AKTIF' : p.label.split(' ')[0]}
              </span>
              <span className={`text-[8.5px] leading-tight ${isSelected ? 'text-slate-900 font-black' : 'opacity-80'}`}>
                {p.label.includes('(') ? p.label.split('(')[1].replace(')', '') : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
