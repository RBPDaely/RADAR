import React, { useState, useEffect } from 'react';
import { CryptoAsset, RoundSettlementState, LatencyStats, ThemeMode } from '../types/market';
import { Clock, Zap, Sun, Moon, TrendingUp, TrendingDown, Key, Wallet } from 'lucide-react';
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

  const { secondsLeft, strikePrice, runningTwap, isUpWinning, isUrgent, isCritical, progressPct } = settlement;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedCountdown = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const timeWindowStr = settlement.currentWindowTs > 0 ? formatWindowTimeRange(settlement.currentWindowTs) : '5M';
  const isDark = theme === 'dark';

  const ASSETS: Array<{ id: CryptoAsset; label: string }> = [
    { id: 'BTC', label: 'BTC/USDT 5M' },
    { id: 'ETH', label: 'ETH/USDT 5M' },
    { id: 'SOL', label: 'SOL/USDT 5M' },
  ];

  return (
    <header
      className={`border-b px-2.5 sm:px-4 py-1.5 sticky top-0 z-30 shadow-md backdrop-blur select-none transition-colors flex-shrink-0 ${
        isDark ? 'bg-[#181d28] border-[#2a2e39]' : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
        
        {/* LEFT SECTION: Asset Switcher & Live Spot Ticker */}
        <div className="flex items-center justify-between w-full md:w-auto space-x-3">
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
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-mono font-black transition-all ${
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
          <div className="flex items-center space-x-2 font-mono">
            <div>
              <div className="text-[9px] text-[#787b86] uppercase tracking-wider font-bold">
                BINANCE SPOT
              </div>
              <div className="flex items-center space-x-1">
                <span
                  className={`text-base sm:text-lg font-black transition-colors ${
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
              </div>
            </div>

            {/* Quick Strike Delta */}
            {strikePrice > 0 && (
              <div className="hidden sm:flex flex-col text-right pl-2.5 border-l border-slate-300 dark:border-[#2a2e39]">
                <span className="text-[9px] text-[#787b86] font-bold">VS STRIKE</span>
                <span className={`text-xs font-black ${isUpWinning ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                  {settlement.strikeDelta >= 0 ? '+' : ''}${settlement.strikeDelta.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CENTER SECTION: ROUND COUNTDOWN & CHAINLINK VERDICT */}
        <div className="w-full md:w-auto flex items-center justify-center">
          <div
            className={`w-full md:w-auto px-4 sm:px-5 py-1 rounded-xl border transition-all flex items-center justify-between md:justify-center space-x-4 relative overflow-hidden shadow-sm ${
              isCritical
                ? 'bg-[#2e1219] border-[#f23645] text-rose-200'
                : isUrgent
                ? 'bg-[#382705] border-[#f0b90b] text-amber-200'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-slate-200'
                : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}
          >
            {/* Progress Background Tint */}
            <div
              className={`absolute left-0 top-0 bottom-0 opacity-20 transition-all duration-1000 ${
                isCritical ? 'bg-[#f23645]' : isUrgent ? 'bg-[#f0b90b]' : 'bg-[#089981]'
              }`}
              style={{ width: `${progressPct}%` }}
            />

            {/* Round info */}
            <div className="flex flex-col text-left relative z-10 font-mono">
              <div className="flex items-center space-x-1 text-[10px] font-bold text-[#787b86]">
                <Clock className={`w-3 h-3 ${isUrgent ? 'text-[#f23645] animate-spin' : 'text-[#f0b90b]'}`} />
                <span>COUNTDOWN</span>
              </div>
              <span className="text-[9px] text-[#787b86] font-bold">{timeWindowStr}</span>
            </div>

            {/* Digital Giant Countdown */}
            <div className="relative z-10 font-mono font-black tracking-widest text-2xl sm:text-3xl leading-none">
              <span
                className={
                  isCritical
                    ? 'text-[#f23645]'
                    : isUrgent
                    ? 'text-[#f0b90b]'
                    : 'text-[#f0b90b]'
                }
              >
                {formattedCountdown}
              </span>
            </div>

            {/* Chainlink Oracle Verdict Pill */}
            <div className="relative z-10 flex flex-col items-end font-mono">
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                  isUpWinning
                    ? 'bg-[#089981]/20 text-[#089981] border-[#089981]/40'
                    : 'bg-[#f23645]/20 text-[#f23645] border-[#f23645]/40'
                }`}
              >
                {isUpWinning ? '▲ UP WIN' : '▼ DOWN WIN'}
              </span>
              <span className="text-[8px] text-[#787b86] mt-0.5 font-bold">
                TWAP: ${runningTwap > 0 ? runningTwap.toFixed(2) : '---'}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT SECTION: Odds, Proyeksi Toggle, Theme Switcher, Latency Ping */}
        <div className="flex items-center justify-between md:justify-end w-full md:w-auto space-x-2 font-mono text-xs">
          
          {/* Quick Odds Badge */}
          <div
            className={`hidden xl:flex items-center space-x-2 px-2.5 py-1 rounded-lg border ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <span className="text-[#089981] font-black">UP {(upPrice * 100).toFixed(0)}¢</span>
            <span className="text-[#787b86]">/</span>
            <span className="text-[#f23645] font-black">DOWN {(downPrice * 100).toFixed(0)}¢</span>
          </div>

          {/* Proyeksi 30s Header Button */}
          <button
            onClick={() => setShowPrediction(!showPrediction)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black border transition-all ${
              showPrediction
                ? 'bg-[#f0b90b]/20 text-[#f0b90b] border-[#f0b90b]/60 shadow-sm'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
                : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-800'
            }`}
            title="Garis Proyeksi 30-Detik (Warna Kuning)"
          >
            <Zap className={`w-3 h-3 ${showPrediction ? 'text-[#f0b90b] animate-pulse' : ''}`} />
            <span>PROYEKSI: {showPrediction ? 'ON' : 'OFF'}</span>
          </button>

          {/* Dark / Light Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-mono font-bold border transition-colors ${
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
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-black border transition-all ${
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
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black border transition-all ${
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
            className={`flex items-center space-x-1 px-2 py-1 rounded-lg border ${
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
