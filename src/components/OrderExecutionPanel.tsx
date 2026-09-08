import React, { useState, useEffect } from 'react';
import { CryptoAsset, ThemeMode } from '../types/market';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Loader2,
  DollarSign,
  Percent,
} from 'lucide-react';

interface OrderExecutionPanelProps {
  asset: CryptoAsset;
  upPrice: number;
  downPrice: number;
  upTokenId: string;
  downTokenId: string;
  theme?: ThemeMode;
  onOpenSettings?: () => void;
}

export const OrderExecutionPanel: React.FC<OrderExecutionPanelProps> = ({
  asset,
  upPrice,
  downPrice,
  upTokenId,
  downTokenId,
  theme = 'dark',
  onOpenSettings,
}) => {
  const isDark = theme === 'dark';

  const [outcome, setOutcome] = useState<'UP' | 'DOWN'>('UP');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [amountUsd, setAmountUsd] = useState<number>(25);
  const [customPriceCents, setCustomPriceCents] = useState<string>('50.0');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sidecarConnected, setSidecarConnected] = useState<boolean>(false);
  const [hasCredentials, setHasCredentials] = useState<boolean>(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  const PRESET_AMOUNTS = [5, 10, 25, 50, 100];

  // Poll Sidecar health & wallet status
  useEffect(() => {
    let isCancelled = false;

    async function checkSidecar() {
      try {
        const res = await fetch('http://127.0.0.1:3001/api/credentials/status');
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setSidecarConnected(true);
            setHasCredentials(Boolean(data.hasCredentials));
            if (data.usdcBalance !== undefined) {
              setUsdcBalance(data.usdcBalance);
            }
          }
        } else {
          if (!isCancelled) setSidecarConnected(false);
        }
      } catch (e) {
        if (!isCancelled) setSidecarConnected(false);
      }
    }

    checkSidecar();
    const interval = setInterval(checkSidecar, 3000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Set default limit price when outcome changes
  useEffect(() => {
    const defaultP = outcome === 'UP' ? (upPrice * 100).toFixed(1) : (downPrice * 100).toFixed(1);
    setCustomPriceCents(defaultP);
  }, [outcome, upPrice, downPrice]);

  // Calculations
  const rawPrice = outcome === 'UP' ? upPrice : downPrice;
  const currentPrice = orderType === 'MARKET'
    ? Math.max(0.01, Math.min(0.99, rawPrice || 0.50))
    : Math.max(0.01, Math.min(0.99, (parseFloat(customPriceCents) || 50) / 100));

  const contractPriceUsd = currentPrice;
  const contractPriceCents = (contractPriceUsd * 100).toFixed(1);

  // Shares (Contracts) = Amount / Price
  const estimatedShares = contractPriceUsd > 0 ? Math.floor((amountUsd / contractPriceUsd) * 100) / 100 : 0;
  const totalCost = parseFloat((estimatedShares * contractPriceUsd).toFixed(2));
  
  // Polymarket crypto taker fee estimate (~0.25% to ~1% depending on price deviation)
  const feeRatePct = 0.005; // 0.5% standard estimate
  const estimatedFee = parseFloat((totalCost * feeRatePct).toFixed(3));
  
  // Potential Payout if Win: Shares * $1.00
  const potentialPayout = parseFloat((estimatedShares * 1.00).toFixed(2));
  const potentialProfit = Math.max(0, parseFloat((potentialPayout - totalCost - estimatedFee).toFixed(2)));
  const netRoiPct = totalCost > 0 ? ((potentialProfit / totalCost) * 100).toFixed(1) : '0';

  const activeTokenId = outcome === 'UP' ? upTokenId : downTokenId;

  const handleExecute = async () => {
    if (!sidecarConnected) {
      setFeedback({
        type: 'error',
        text: 'Local Trading Sidecar server tidak aktif. Jalankan server background terlebih dahulu.',
      });
      return;
    }

    if (!hasCredentials) {
      setFeedback({
        type: 'error',
        text: 'Kredensial Polymarket belum diatur. Klik icon Settings di header.',
      });
      onOpenSettings?.();
      return;
    }

    if (!activeTokenId) {
      setFeedback({
        type: 'error',
        text: 'Token ID untuk ronde ini belum siap. Tunggu beberapa detik...',
      });
      return;
    }

    if (amountUsd <= 0) {
      setFeedback({ type: 'error', text: 'Masukkan nominal modal yang valid.' });
      return;
    }

    setIsExecuting(true);
    setFeedback(null);

    try {
      const payload = {
        asset,
        outcome,
        tokenId: activeTokenId,
        orderType,
        amountUsd,
        limitPrice: contractPriceUsd,
        slippageTolerance: 0.015,
      };

      const res = await fetch('http://127.0.0.1:3001/api/order/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: data.message || `Order ${outcome} berhasil dipasang!`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: data.message || 'Gagal mengeksekusi order.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Error koneksi: ${err.message || 'Gagal mengirim order'}`,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className={`border rounded-xl p-2.5 flex flex-col font-mono text-xs shadow-md select-none transition-colors flex-shrink-0 ${
        isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#dbe0e7] text-slate-800'
      }`}
    >
      {/* Panel Header */}
      <div className={`flex items-center justify-between pb-1.5 border-b mb-2 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className="flex items-center space-x-1.5 font-bold text-[11px] uppercase">
          <Zap className="w-3.5 h-3.5 text-[#f0b90b]" />
          <span className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>EKSEKUSI TRADING INSTAN</span>
        </div>
        
        {/* Status Badge */}
        <div className="flex items-center space-x-1.5">
          <span className={`w-2 h-2 rounded-full ${sidecarConnected ? 'bg-[#089981] animate-pulse' : 'bg-[#f23645]'}`} />
          <span className={`text-[9px] font-bold ${sidecarConnected ? 'text-[#089981]' : 'text-[#f23645]'}`}>
            {sidecarConnected ? (hasCredentials ? 'READY' : 'NO KEYS') : 'OFFLINE'}
          </span>
          {usdcBalance !== null && (
            <span className="text-[9px] text-[#787b86] font-bold pl-1">
              ${usdcBalance.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* 1. UP vs DOWN Tab Selector */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <button
          onClick={() => setOutcome('UP')}
          className={`py-1.5 px-2 rounded-lg font-black text-xs flex items-center justify-center space-x-1.5 transition-all border ${
            outcome === 'UP'
              ? 'bg-[#089981] text-white border-[#089981] shadow-[0_0_12px_rgba(8,153,129,0.5)]'
              : isDark
              ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#089981]'
              : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-[#089981]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>BELI UP ({(upPrice * 100).toFixed(1)}¢)</span>
        </button>

        <button
          onClick={() => setOutcome('DOWN')}
          className={`py-1.5 px-2 rounded-lg font-black text-xs flex items-center justify-center space-x-1.5 transition-all border ${
            outcome === 'DOWN'
              ? 'bg-[#f23645] text-white border-[#f23645] shadow-[0_0_12px_rgba(242,54,69,0.5)]'
              : isDark
              ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#f23645]'
              : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-[#f23645]'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>BELI DOWN ({(downPrice * 100).toFixed(1)}¢)</span>
        </button>
      </div>

      {/* 2. Order Type Toggle (Market vs Limit) */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#787b86] font-bold uppercase">TIPE ORDER:</span>
        <div className={`flex items-center p-0.5 rounded-lg border text-[10px] ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'}`}>
          <button
            onClick={() => setOrderType('MARKET')}
            className={`px-2 py-0.5 rounded font-black transition-colors ${
              orderType === 'MARKET' ? 'bg-[#f0b90b] text-black shadow-sm' : isDark ? 'text-[#787b86]' : 'text-slate-600'
            }`}
          >
            MARKET (INSTAN)
          </button>
          <button
            onClick={() => setOrderType('LIMIT')}
            className={`px-2 py-0.5 rounded font-black transition-colors ${
              orderType === 'LIMIT' ? 'bg-[#f0b90b] text-black shadow-sm' : isDark ? 'text-[#787b86]' : 'text-slate-600'
            }`}
          >
            LIMIT (ANTRE)
          </button>
        </div>
      </div>

      {/* Limit Price Input (Shown only in LIMIT mode) */}
      {orderType === 'LIMIT' && (
        <div className="mb-2 flex items-center justify-between p-1.5 rounded-lg border border-[#f0b90b]/40 bg-[#f0b90b]/10">
          <span className="text-[10px] font-bold text-[#f0b90b]">HARGA LIMIT:</span>
          <div className="flex items-center space-x-1">
            <input
              type="number"
              step="0.1"
              min="1"
              max="99"
              value={customPriceCents}
              onChange={(e) => setCustomPriceCents(e.target.value)}
              className={`w-16 px-1.5 py-0.5 text-right font-black rounded border text-xs ${
                isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
            <span className="text-xs font-bold text-[#f0b90b]">¢</span>
          </div>
        </div>
      )}

      {/* 3. Modal Nominal ($) Presets */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] text-[#787b86] font-bold mb-1">
          <span>MODAL (USD):</span>
          <div className="flex items-center space-x-0.5">
            <DollarSign className="w-3 h-3 text-[#f0b90b]" />
            <input
              type="number"
              min="1"
              max="10000"
              value={amountUsd}
              onChange={(e) => setAmountUsd(Math.max(1, parseFloat(e.target.value) || 0))}
              className={`w-16 px-1 py-0.5 text-right font-black rounded border text-xs ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {PRESET_AMOUNTS.map((p) => (
            <button
              key={p}
              onClick={() => setAmountUsd(p)}
              className={`py-1 rounded font-black text-[10px] border transition-all ${
                amountUsd === p
                  ? 'bg-[#f0b90b] text-black border-[#f0b90b]'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-black'
              }`}
            >
              ${p}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Kalkulator Finansial Transparan */}
      <div className={`p-2 rounded-lg border mb-2 space-y-1 text-[10px] ${isDark ? 'bg-[#1e222d]/60 border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[#787b86]">Harga Kontrak:</span>
          <span className="font-bold text-slate-200">{contractPriceCents}¢ (${contractPriceUsd.toFixed(3)})</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#787b86]">Jumlah Kontrak:</span>
          <span className="font-black text-[#f0b90b]">{estimatedShares} Lembar</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#787b86]">Total Modal (+Est. Fee):</span>
          <span>${totalCost.toFixed(2)} (<span className="text-[#787b86]">${estimatedFee} fee</span>)</span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
          <span className="text-[#787b86]">Potensi Payout:</span>
          <span className="font-bold">${potentialPayout.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#089981] font-bold">Potensi Profit Bersih:</span>
          <span className="font-black text-[#089981]">+${potentialProfit.toFixed(2)} (+{netRoiPct}%)</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#f23645]">Maksimum Risiko:</span>
          <span className="font-bold text-[#f23645]">-${totalCost.toFixed(2)} (100%)</span>
        </div>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={`p-1.5 rounded-lg border mb-2 flex items-start space-x-1.5 text-[10px] ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-[#089981] text-emerald-300'
              : 'bg-rose-950/40 border-[#f23645] text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#089981] flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-[#f23645] flex-shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{feedback.text}</span>
        </div>
      )}

      {/* 5. Big Execution Button */}
      <button
        onClick={handleExecute}
        disabled={isExecuting || !sidecarConnected}
        className={`w-full py-2.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-lg ${
          outcome === 'UP'
            ? 'bg-[#089981] hover:bg-[#0aa88f] text-white shadow-[0_0_15px_rgba(8,153,129,0.4)] disabled:opacity-50'
            : 'bg-[#f23645] hover:bg-[#ff3b4b] text-white shadow-[0_0_15px_rgba(242,54,69,0.4)] disabled:opacity-50'
        }`}
      >
        {isExecuting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>MENGIRIM KE CLOB...</span>
          </>
        ) : (
          <span>
            BELI {outcome} (${totalCost.toFixed(2)})
          </span>
        )}
      </button>
    </div>
  );
};
