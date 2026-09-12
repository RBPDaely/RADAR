import React from 'react';
import { RoundSettlementState, PolymarketEvent, PolymarketMarket, ThemeMode } from '../types/market';
import { ShieldCheck, ExternalLink, Target } from 'lucide-react';

interface TwapAnalyticsCardProps {
  settlement: RoundSettlementState;
  eventData: PolymarketEvent | null;
  activeMarket: PolymarketMarket | null;
  slug: string;
  theme?: ThemeMode;
}

export const TwapAnalyticsCard: React.FC<TwapAnalyticsCardProps> = ({
  settlement,
  eventData,
  activeMarket,
  slug,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  const {
    strikePrice,
    runningTwap,
    twapDelta,
    twapDeltaPct,
    requiredPriceToFlip,
    isUpWinning,
    secondsLeft,
  } = settlement;

  function formatUsd(val: any): string {
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(n) || !isFinite(n) || n <= 0) return '$0';
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  const rawVol = activeMarket?.volume || eventData?.volume || 0;
  const volumeStr = formatUsd(rawVol);

  return (
    <div
      className={`border rounded-lg px-2.5 py-1.5 flex flex-col justify-between font-mono text-xs shadow-sm select-none transition-colors flex-shrink-0 ${
        isDark ? 'bg-[#181d28] border-[#2a2e39]' : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      {/* Mini Header bar */}
      <div className={`flex items-center justify-between pb-1 border-b mb-1 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className={`flex items-center space-x-1 font-black text-[10px] uppercase ${isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}`}>
          <ShieldCheck className="w-3 h-3 text-[#a855f7]" />
          <span>CHAINLINK TWAP BENCHMARK</span>
          <span className="text-[8px] px-1 py-0.2 rounded bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#a855f7] dark:text-[#c084fc] font-bold">
            ORACLE 60S
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[9.5px] text-[#787b86]">
          <span>Vol: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}>{volumeStr}</strong></span>
          <a
            href={`https://polymarket.com/id/event/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-0.5 text-amber-600 dark:text-[#f0b90b] hover:underline font-bold"
          >
            <span>Market</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* 3 Compact Horizontal Benchmark Columns */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {/* Strike */}
        <div className={`px-1.5 py-0.5 rounded border flex flex-col justify-center ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-[8px] text-[#787b86] font-bold uppercase">STRIKE (00:00)</span>
          <span className="text-xs font-black text-amber-500 dark:text-[#f0b90b] leading-tight">
            ${strikePrice > 0 ? strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---.--'}
          </span>
        </div>

        {/* Running TWAP */}
        <div className={`px-1.5 py-0.5 rounded border flex flex-col justify-center ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-center space-x-1">
            <span className="text-[8px] text-[#787b86] font-bold uppercase">TWAP:</span>
            <span className="text-xs font-black text-purple-400 dark:text-[#c084fc] leading-tight">
              ${runningTwap > 0 ? runningTwap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---.--'}
            </span>
          </div>
          <span className={`text-[8px] font-black leading-none ${isUpWinning ? 'text-emerald-500 dark:text-[#089981]' : 'text-rose-500 dark:text-[#f23645]'}`}>
            {twapDelta >= 0 ? '+' : ''}${twapDelta.toFixed(2)} ({twapDeltaPct.toFixed(1)}%)
          </span>
        </div>

        {/* Target Flip */}
        <div className={`px-1.5 py-0.5 rounded border flex flex-col justify-center ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-center space-x-1 text-[8px] text-[#787b86] font-bold uppercase">
            <Target className="w-2.5 h-2.5 text-cyan-400" />
            <span>FLIP:</span>
            <span className="text-xs font-black text-cyan-400 leading-tight">
              ${requiredPriceToFlip > 0 ? requiredPriceToFlip.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
            </span>
          </div>
          <span className="text-[8px] text-[#787b86] leading-none">Sisa {secondsLeft}s</span>
        </div>
      </div>
    </div>
  );
};
