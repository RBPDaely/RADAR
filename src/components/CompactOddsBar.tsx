import React, { useEffect, useRef, useState } from 'react';
import { RoundSettlementState, ThemeMode } from '../types/market';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Zap } from 'lucide-react';

interface CompactOddsBarProps {
  upPrice: number;
  downPrice: number;
  settlement: RoundSettlementState;
  theme?: ThemeMode;
}

export const CompactOddsBar: React.FC<CompactOddsBarProps> = ({
  upPrice,
  downPrice,
  settlement,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const { isUpWinning } = settlement;

  const validUpPrice = Math.max(0.01, Math.min(0.99, isNaN(upPrice) ? 0.50 : upPrice));
  const validDownPrice = Math.max(0.01, Math.min(0.99, isNaN(downPrice) ? 0.50 : downPrice));

  const upCents = (validUpPrice * 100).toFixed(1);
  const downCents = (validDownPrice * 100).toFixed(1);

  const upRoi = ((1 / validUpPrice) - 1) * 100;
  const downRoi = ((1 / validDownPrice) - 1) * 100;

  // Real-time tick change flash tracking for dynamic lighting
  const [upFlash, setUpFlash] = useState<'up' | 'down' | null>(null);
  const [downFlash, setDownFlash] = useState<'up' | 'down' | null>(null);
  const prevUpRef = useRef<number>(validUpPrice);
  const prevDownRef = useRef<number>(validDownPrice);

  useEffect(() => {
    if (Math.abs(prevUpRef.current - validUpPrice) >= 0.001) {
      const dir = validUpPrice > prevUpRef.current ? 'up' : 'down';
      prevUpRef.current = validUpPrice;
      setUpFlash(dir);
      const timer = setTimeout(() => setUpFlash(null), 700);
      return () => clearTimeout(timer);
    }
  }, [validUpPrice]);

  useEffect(() => {
    if (Math.abs(prevDownRef.current - validDownPrice) >= 0.001) {
      const dir = validDownPrice > prevDownRef.current ? 'up' : 'down';
      prevDownRef.current = validDownPrice;
      setDownFlash(dir);
      const timer = setTimeout(() => setDownFlash(null), 700);
      return () => clearTimeout(timer);
    }
  }, [validDownPrice]);

  const upPct = Math.round(validUpPrice * 100);
  const downPct = 100 - upPct;

  return (
    <div className="w-full flex flex-col space-y-1 select-none flex-shrink-0">
      {/* Centered Battle Arena: UP and DOWN numbers meet right at the center divider */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 items-stretch">
        
        {/* UP CARD - Values aligned toward inner right (Center) */}
        <div
          className={`relative overflow-hidden rounded-xl px-3 py-2 border transition-all duration-300 flex items-center justify-between ${
            isUpWinning
              ? isDark
                ? 'bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-[#089981]/30 via-[#0d2b20] to-[#131722] border-[#089981] shadow-[0_0_25px_rgba(8,153,129,0.45)] ring-1 ring-[#089981]'
                : 'bg-emerald-50 border-[#089981] shadow-md ring-1 ring-[#089981]'
              : isDark
              ? 'bg-[#131722] border-[#2a2e39]'
              : 'bg-white border-slate-200'
          } ${upFlash ? 'scale-[1.01] brightness-125' : ''}`}
        >
          {/* Subtle Ambient Backlight Glow Aura */}
          {isUpWinning && (
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#089981]/25 to-transparent pointer-events-none" />
          )}

          {/* Left info (Label & ROI) */}
          <div className="flex flex-col justify-center space-y-0.5 relative z-10">
            <div className="flex items-center space-x-1.5">
              <div className="p-1 rounded-md bg-[#089981]/20 text-[#089981]">
                <ArrowUpRight className="w-3.5 h-3.5 font-black" />
              </div>
              <span className="text-[11px] font-mono font-black uppercase tracking-wider text-[#089981]">
                UP (NAIK)
              </span>
            </div>

            <div className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-[#787b86]">ROI:</span>
              <span className="font-black text-[#089981]">+{upRoi.toFixed(0)}%</span>
              <span className="text-[#787b86]">(${validUpPrice.toFixed(3)})</span>
            </div>
          </div>

          {/* Right: Focused Giant Luminous Number (Meets Center) */}
          <div className="flex items-center space-x-2 relative z-10 pl-2">
            {isUpWinning && (
              <span className="hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-black bg-[#089981] text-slate-950 uppercase tracking-wider animate-pulse shadow-[0_0_10px_#089981]">
                <TrendingUp className="w-3 h-3" />
                <span>LEAD</span>
              </span>
            )}

            <div className="text-right">
              <div
                className={`text-3xl sm:text-4xl font-mono font-black tracking-tight text-[#089981] transition-all duration-200 ${
                  isUpWinning
                    ? 'drop-shadow-[0_0_15px_rgba(8,153,129,0.9)]'
                    : 'drop-shadow-[0_0_6px_rgba(8,153,129,0.4)]'
                } ${upFlash === 'up' ? 'text-[#00ff88] drop-shadow-[0_0_25px_#00ff88]' : ''}`}
              >
                {upCents}¢
              </div>
            </div>
          </div>
        </div>

        {/* DOWN CARD - Values aligned toward inner left (Center) */}
        <div
          className={`relative overflow-hidden rounded-xl px-3 py-2 border transition-all duration-300 flex items-center justify-between ${
            !isUpWinning
              ? isDark
                ? 'bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-[#f23645]/30 via-[#2e1219] to-[#131722] border-[#f23645] shadow-[0_0_25px_rgba(242,54,69,0.45)] ring-1 ring-[#f23645]'
                : 'bg-rose-50 border-[#f23645] shadow-md ring-1 ring-[#f23645]'
              : isDark
              ? 'bg-[#131722] border-[#2a2e39]'
              : 'bg-white border-slate-200'
          } ${downFlash ? 'scale-[1.01] brightness-125' : ''}`}
        >
          {/* Subtle Ambient Backlight Glow Aura */}
          {!isUpWinning && (
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#f23645]/25 to-transparent pointer-events-none" />
          )}

          {/* Left: Focused Giant Luminous Number (Meets Center) */}
          <div className="flex items-center space-x-2 relative z-10 pr-2">
            <div className="text-left">
              <div
                className={`text-3xl sm:text-4xl font-mono font-black tracking-tight text-[#f23645] transition-all duration-200 ${
                  !isUpWinning
                    ? 'drop-shadow-[0_0_15px_rgba(242,54,69,0.9)]'
                    : 'drop-shadow-[0_0_6px_rgba(242,54,69,0.4)]'
                } ${downFlash === 'up' ? 'text-[#ff3b69] drop-shadow-[0_0_25px_#ff3b69]' : ''}`}
              >
                {downCents}¢
              </div>
            </div>

            {!isUpWinning && (
              <span className="hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-black bg-[#f23645] text-white uppercase tracking-wider animate-pulse shadow-[0_0_10px_#f23645]">
                <TrendingDown className="w-3 h-3" />
                <span>LEAD</span>
              </span>
            )}
          </div>

          {/* Right info (Label & ROI) */}
          <div className="flex flex-col justify-center items-end space-y-0.5 relative z-10">
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-mono font-black uppercase tracking-wider text-[#f23645]">
                DOWN (TURUN)
              </span>
              <div className="p-1 rounded-md bg-[#f23645]/20 text-[#f23645]">
                <ArrowDownRight className="w-3.5 h-3.5 font-black" />
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-[#787b86]">(${validDownPrice.toFixed(3)})</span>
              <span className="text-[#787b86]">ROI:</span>
              <span className="font-black text-[#f23645]">+{downRoi.toFixed(0)}%</span>
            </div>
          </div>
        </div>

      </div>

      {/* Luminous Duel Energy Proportion Laser Bar */}
      <div className="relative w-full h-1.5 rounded-full overflow-hidden flex bg-[#1e222d] shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-[#089981] to-[#00ff88] transition-all duration-300 shadow-[0_0_8px_#089981]"
          style={{ width: `${upPct}%` }}
        />
        <div
          className="h-full bg-gradient-to-l from-[#f23645] to-[#ff3b69] transition-all duration-300 shadow-[0_0_8px_#f23645]"
          style={{ width: `${downPct}%` }}
        />
        {/* Center needle glow */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#ffffff] transform -translate-x-1/2 transition-all duration-300"
          style={{ left: `${upPct}%` }}
        />
      </div>
    </div>
  );
};
