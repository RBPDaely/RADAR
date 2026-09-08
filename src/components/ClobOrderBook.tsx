import React from 'react';
import { OrderBookState, ThemeMode } from '../types/market';
import { BookOpen } from 'lucide-react';

interface ClobOrderBookProps {
  orderBook: OrderBookState;
  theme?: ThemeMode;
}

export const ClobOrderBook: React.FC<ClobOrderBookProps> = ({ orderBook, theme = 'dark' }) => {
  const { bids, asks, lastPrice, spread } = orderBook;
  const isDark = theme === 'dark';

  const displayAsks = asks.slice(0, 6).reverse();
  const displayBids = bids.slice(0, 6);

  const maxAskSize = Math.max(...displayAsks.map((a) => a.size), 10);
  const maxBidSize = Math.max(...displayBids.map((b) => b.size), 10);
  const maxSize = Math.max(maxAskSize, maxBidSize);

  return (
    <div
      className={`border rounded-xl p-2 flex flex-col h-full min-h-0 font-mono text-xs shadow-md select-none transition-colors overflow-hidden ${
        isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#dbe0e7] text-slate-800'
      }`}
    >
      {/* Book Header */}
      <div
        className={`flex items-center justify-between pb-1 border-b mb-1 font-bold text-[10px] uppercase tracking-wider flex-shrink-0 ${
          isDark ? 'border-[#2a2e39] text-[#787b86]' : 'border-slate-200 text-slate-500'
        }`}
      >
        <div className="flex items-center space-x-1">
          <BookOpen className="w-3 h-3 text-[#f0b90b]" />
          <span className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>ORDER BOOK (CLOB)</span>
        </div>
        <span className="text-[9px] text-[#787b86] font-normal">POLYGON L2</span>
      </div>

      <div className="grid grid-cols-3 pb-0.5 text-[9px] font-bold text-[#787b86] uppercase flex-shrink-0">
        <span>HARGA</span>
        <span className="text-right">JUMLAH</span>
        <span className="text-right">TOTAL</span>
      </div>

      {/* Asks (Sell Orders - Soft Scarlet Red) */}
      <div className="flex flex-col space-y-0.5 overflow-hidden flex-1 min-h-0 justify-end">
        {displayAsks.length === 0 ? (
          <div className="text-center text-[#787b86] py-2 text-[10px]">Memuat antrean jual...</div>
        ) : (
          displayAsks.map((ask, idx) => {
            const depthPct = Math.min(100, Math.max(5, (ask.size / maxSize) * 100));
            return (
              <div
                key={`ask-${idx}`}
                className={`relative grid grid-cols-3 py-0.5 px-1 rounded cursor-pointer transition-colors text-[10px] ${
                  isDark ? 'hover:bg-[#2e1219]' : 'hover:bg-rose-50'
                }`}
              >
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[#f23645]/15 rounded-r pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative z-10 text-[#f23645] font-black">
                  ${ask.price.toFixed(3)}
                </span>
                <span className={`relative z-10 font-medium text-right ${isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}`}>
                  {ask.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="relative z-10 text-[#787b86] text-right">
                  ${(ask.price * ask.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Mid Price & Spread Bar */}
      <div
        className={`my-1 py-1 px-2 border rounded-lg flex items-center justify-between shadow-inner flex-shrink-0 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center space-x-1.5">
          <span className="text-[#787b86] text-[9px] font-bold">MID:</span>
          <span className={`font-black text-xs sm:text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
            ${lastPrice > 0 ? lastPrice.toFixed(3) : '0.500'}
          </span>
        </div>
        <div className="text-[9px] text-[#787b86] font-bold">
          SPREAD: <span className="text-[#f0b90b] font-black">${spread.toFixed(3)}</span>
        </div>
      </div>

      {/* Bids (Buy Orders - Soft Forest Green) */}
      <div className="flex flex-col space-y-0.5 overflow-hidden flex-1 min-h-0">
        {displayBids.length === 0 ? (
          <div className="text-center text-[#787b86] py-2 text-[10px]">Memuat antrean beli...</div>
        ) : (
          displayBids.map((bid, idx) => {
            const depthPct = Math.min(100, Math.max(5, (bid.size / maxSize) * 100));
            return (
              <div
                key={`bid-${idx}`}
                className={`relative grid grid-cols-3 py-0.5 px-1 rounded cursor-pointer transition-colors text-[10px] ${
                  isDark ? 'hover:bg-[#0d2b20]' : 'hover:bg-emerald-50'
                }`}
              >
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[#089981]/15 rounded-r pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative z-10 text-[#089981] font-black">
                  ${bid.price.toFixed(3)}
                </span>
                <span className={`relative z-10 font-medium text-right ${isDark ? 'text-[#d1d4dc]' : 'text-slate-700'}`}>
                  {bid.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="relative z-10 text-[#787b86] text-right">
                  ${(bid.price * bid.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
