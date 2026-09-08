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
    currentPrice,
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
      className={`border rounded-xl p-2.5 flex flex-col font-mono text-xs shadow-md select-none transition-colors flex-shrink-0 ${
        isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#dbe0e7] text-slate-800'
      }`}
    >
      {/* Title */}
      <div className={`flex items-center justify-between pb-1.5 border-b mb-2 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className={`flex items-center space-x-1.5 font-bold text-[11px] uppercase ${isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}`}>
          <ShieldCheck className="w-3.5 h-3.5 text-[#a855f7]" />
          <span>CHAINLINK TWAP BENCHMARK</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#c084fc] font-black">
          ORACLE 60S
        </span>
      </div>

      {/* Grid of Key Benchmark Stats */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* Strike Price */}
        <div className={`p-1.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-[9px] text-[#787b86] font-bold uppercase block">STRIKE (00:00)</span>
          <span className="text-sm font-black text-[#f0b90b]">
            ${strikePrice > 0 ? strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---.--'}
          </span>
          <span className="text-[8px] text-[#787b86] block">Benchmark Ronde</span>
        </div>

        {/* Running TWAP */}
        <div className={`p-1.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-[9px] text-[#787b86] font-bold uppercase block">RUNNING TWAP</span>
          <span className="text-sm font-black text-[#c084fc]">
            ${runningTwap > 0 ? runningTwap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---.--'}
          </span>
          <span className={`text-[9px] font-black ${isUpWinning ? 'text-[#089981]' : 'text-[#f23645]'}`}>
            {twapDelta >= 0 ? '+' : ''}${twapDelta.toFixed(2)} ({twapDeltaPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Flip Target Calculator */}
      <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center space-x-1 text-[#787b86] font-bold text-[10px]">
            <Target className="w-3 h-3 text-[#f0b90b]" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>TARGET HARGA BALIK:</span>
          </div>
          <span className="text-[9px] text-[#787b86] font-medium">Sisa {secondsLeft}s</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm sm:text-base font-black text-[#f0b90b]">
            ${requiredPriceToFlip > 0 ? requiredPriceToFlip.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
          </span>
          <span className="text-[9px] text-[#787b86]">
            Spot: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>${currentPrice.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Market Link */}
      <div className={`flex items-center justify-between text-[10px] pt-1.5 border-t text-[#787b86] mt-2 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <span>Volume: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}>{volumeStr}</strong></span>
        <a
          href={`https://polymarket.com/id/event/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-1 text-[#f0b90b] hover:underline transition-colors font-bold"
        >
          <span>Polymarket</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
};
