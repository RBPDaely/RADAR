import React, { useState, useEffect } from 'react';
import { CryptoAsset, RoundSettlementState, LatencyStats, ThemeMode } from '../types/market';
import { Zap, Sun, Moon, TrendingUp, TrendingDown, Key, Wallet } from 'lucide-react';
import { formatWindowTimeRange } from '../services/polymarketFeed';
import { getSidecarUrl } from '../config';

interface ProHeaderProps {
  asset: CryptoAsset;
  setAsset: (a: CryptoAsset) => void;
  spotPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
  settlement: RoundSettlementState;
  latencyStats: LatencyStats;
  upPrice: number;
  downPrice: number;
  theme: ThemeMode;
  toggleTheme: () => void;
  showPrediction: boolean;
  setShowPrediction: (sp: boolean) => void;
  onOpenSettings?: () => void;
}

export const ProHeader: React.FC<ProHeaderProps> = ({
  asset,
  setAsset,
  spotPrice,
  priceDirection,
  settlement,
  latencyStats,
  upPrice,
  downPrice,
  theme,
  toggleTheme,
  showPrediction,
  setShowPrediction,
  onOpenSettings,
}) => {
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function checkBalance() {
      try {
        const res = await fetch(`${getSidecarUrl()}/api/credentials/status`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.usdcBalance !== undefined) {
            setUsdcBalance(data.usdcBalance);
          }
        }
      } catch {}
    }
    checkBalance();
    const interval = setInterval(checkBalance, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const { strikePrice, runningTwap, isUpWinning } = settlement;

  const timeWindowStr = settlement.currentWindowTs > 0 ? formatWindowTimeRange(settlement.currentWindowTs) : '5M';
  const isDark = theme === 'dark';

  const ASSETS: Array<{ id: CryptoAsset; label: string }> = [
    { id: 'BTC', label: 'BTC/USDT 5M' },
    { id: 'ETH', label: 'ETH/USDT 5M' },
    { id: 'SOL', label: 'SOL/USDT 5M' },
  ];

  return (
    <header
      className={`border-b px-2.5 sm:px-3 py-1 sticky top-0 z-30 shadow-sm backdrop-blur select-none transition-colors flex-shrink-0 ${
        isDark ? 'bg-[#181d28] border-[#2a2e39]' : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-1.5">
        
        {/* LEFT SECTION: Asset Switcher & Live Spot Ticker */}
        <div className="flex items-center justify-between w-full md:w-auto space-x-2.5">
          {/* Asset Switcher */}
          <div
            className={`flex items-center p-0.5 rounded-lg border ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            {ASSETS.map((item) => (
              <button
                key={item.id}
                onClick={() => setAsset(item.id)}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-mono font-black transition-all ${
                  asset === item.id
                    ? 'bg-[#f0b90b] text-slate-950 shadow-sm font-black'
                    : isDark
                    ? 'text-[#787b86] hover:text-[#d1d4dc]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Live Price Flash Card */}
          <div className="flex items-center space-x-1.5 font-mono">
            <span className="text-[9px] text-[#787b86] uppercase font-bold hidden sm:inline">SPOT:</span>
            <span
              className={`text-sm sm:text-base font-black transition-colors ${
                priceDirection === 'up'
                  ? 'text-[#089981]'
                  : priceDirection === 'down'
                  ? 'text-[#f23645]'
                  : isDark
                  ? 'text-white'
                  : 'text-slate-900'
              }`}
            >
              ${spotPrice > 0 ? spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---.--'}
            </span>
            {priceDirection === 'up' && <TrendingUp className="w-3.5 h-3.5 text-[#089981]" />}
            {priceDirection === 'down' && <TrendingDown className="w-3.5 h-3.5 text-[#f23645]" />}

            {/* Quick Strike Delta */}
            {strikePrice > 0 && (
              <span className={`text-[10px] font-black pl-1.5 border-l border-slate-700/50 ${isUpWinning ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                {settlement.strikeDelta >= 0 ? '+' : ''}${settlement.strikeDelta.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* CENTER SECTION: ROUND INFO & ORACLE TWAP LEAD */}
        <div className="hidden md:flex items-center space-x-2 font-mono text-xs">
          <span className="text-[10px] font-bold text-[#787b86] px-1.5 py-0.5 rounded border border-slate-700/40">
            PERIODE: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>{timeWindowStr}</strong>
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
              isUpWinning
                ? 'bg-[#089981]/20 text-[#089981] border-[#089981]/40'
                : 'bg-[#f23645]/20 text-[#f23645] border-[#f23645]/40'
            }`}
          >
            {isUpWinning ? '▲ UP MEMIMPIN' : '▼ DOWN MEMIMPIN'}
          </span>
          {runningTwap > 0 && (
            <span className="text-[10px] text-[#787b86] font-bold">
              TWAP: <strong className="text-purple-400">${runningTwap.toFixed(2)}</strong>
            </span>
          )}
        </div>

        {/* RIGHT SECTION: Odds, Proyeksi Toggle, Theme Switcher, Latency Ping */}
        <div className="flex items-center justify-between md:justify-end w-full md:w-auto space-x-1.5 font-mono text-xs">
          
          {/* Quick Odds Badge */}
          <div
            className={`hidden xl:flex items-center space-x-1.5 px-2 py-0.5 rounded-lg border ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <span className="text-[#089981] font-black">UP {(upPrice * 100).toFixed(0)}¢</span>
            <span className="text-[#787b86]">/</span>
            <span className="text-[#f23645] font-black">DOWN {(downPrice * 100).toFixed(0)}¢</span>
          </div>

          {/* Proyeksi Header Button */}
          <button
            onClick={() => setShowPrediction(!showPrediction)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-mono font-black border transition-all ${
              showPrediction
                ? 'bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/60 shadow-sm'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
                : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-800'
            }`}
            title="Garis Proyeksi Flip (Cyan)"
          >
            <Zap className={`w-3 h-3 ${showPrediction ? 'text-[#06b6d4] animate-pulse' : ''}`} />
            <span>PROYEKSI: {showPrediction ? 'ON' : 'OFF'}</span>
          </button>

          {/* Dark / Light Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
              isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc] hover:text-white'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-black'
            }`}
            title={isDark ? 'Beralih ke Mode Terang (Light)' : 'Beralih ke Mode Gelap (Dark)'}
          >
            {isDark ? <Sun className="w-3 h-3 text-[#f0b90b]" /> : <Moon className="w-3 h-3 text-blue-600" />}
            <span className="font-black">{isDark ? 'LIGHT' : 'DARK'}</span>
          </button>

          {/* Live USDC Balance Display */}
          {usdcBalance !== null && (
            <button
              onClick={onOpenSettings}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-mono font-black border transition-all ${
                isDark
                  ? 'bg-emerald-950/40 border-[#089981]/60 text-[#089981] hover:border-[#089981]'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-700'
              }`}
              title="Saldo USDC Aktif (Klik untuk Kelola Kredensial)"
            >
              <Wallet className="w-3.5 h-3.5 text-[#089981]" />
              <span>${usdcBalance.toFixed(2)}</span>
            </button>
          )}

          {/* Kredensial Settings Button */}
          <button
            onClick={onOpenSettings}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-mono font-black border transition-all ${
              isDark
                ? 'bg-[#1e222d] hover:bg-[#2a2e39] border-[#2a2e39] text-[#f0b90b] hover:border-[#f0b90b]/50'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-amber-700'
            }`}
            title="Pengaturan Kredensial Polymarket"
          >
            <Key className="w-3 h-3 text-[#f0b90b]" />
            <span className="hidden sm:inline">KREDENSIAL</span>
          </button>

          {/* Latency Ping Badge */}
          <div
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-lg border ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <span className="text-[10px] font-bold text-[#787b86]">
              {latencyStats.binanceWsPingMs > 0 ? `${latencyStats.binanceWsPingMs}ms` : '<20ms'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                latencyStats.binanceWsConnected ? 'bg-[#089981] animate-pulse' : 'bg-[#f0b90b]'
              }`}
            />
          </div>

        </div>

      </div>
    </header>
  );
};
