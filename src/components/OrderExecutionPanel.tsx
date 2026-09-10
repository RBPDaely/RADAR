import React, { useState, useEffect } from 'react';
import { CryptoAsset, ThemeMode, RoundSettlementState, MarketPeriodInfo } from '../types/market';
import { getSidecarUrl } from '../config';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  X,
  Plus,
  CornerDownRight,
  Clock,
} from 'lucide-react';

interface OrderExecutionPanelProps {
  asset: CryptoAsset;
  upPrice: number;
  downPrice: number;
  upTokenId: string;
  downTokenId: string;
  theme?: ThemeMode;
  onOpenSettings?: () => void;
  settlement?: RoundSettlementState;
  selectedWindowTs?: number;
  upcomingPeriods?: MarketPeriodInfo[];
  onSelectPeriod?: (ts: number) => void;
}

export const OrderExecutionPanel: React.FC<OrderExecutionPanelProps> = ({
  asset,
  upPrice,
  downPrice,
  upTokenId,
  downTokenId,
  theme = 'dark',
  onOpenSettings,
  settlement,
  selectedWindowTs,
  upcomingPeriods = [],
  onSelectPeriod,
}) => {
  const isDark = theme === 'dark';
  const [hoveredMode, setHoveredMode] = useState<'BUY' | 'SELL' | null>(null);

  // Mode: BUY (Entry) or SELL (Exit / Take Profit / Cut Loss)
  const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL'>('BUY');
  const [outcome, setOutcome] = useState<'UP' | 'DOWN'>('UP');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  
  // BUY state (String input to allow free, smooth manual typing)
  const [amountUsdInput, setAmountUsdInput] = useState<string>('5');
  
  // SELL state (String input to allow free, smooth manual typing)
  const [sharesToSellInput, setSharesToSellInput] = useState<string>('1');
  
  const [customPriceCents, setCustomPriceCents] = useState<string>('50.0');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sidecarConnected, setSidecarConnected] = useState<boolean>(false);
  const [hasCredentials, setHasCredentials] = useState<boolean>(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [userPositions, setUserPositions] = useState<any[]>([]);

  // Presets designed for flexible input starting from $1
  const BUY_PRESET_AMOUNTS = [1, 2, 5, 10, 25];
  const SELL_PERCENT_PRESETS = [25, 50, 75, 100];

  // Auto-dismiss notification after 2.5 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const fetchStatusAndPositions = async () => {
    try {
      const [statusRes, posRes] = await Promise.all([
        fetch(`${getSidecarUrl()}/api/credentials/status`),
        fetch(`${getSidecarUrl()}/api/positions`),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setSidecarConnected(true);
        setHasCredentials(Boolean(data.hasCredentials));
        if (data.usdcBalance !== undefined) {
          setUsdcBalance(data.usdcBalance);
        }
      } else {
        setSidecarConnected(false);
      }

      if (posRes.ok) {
        const posData = await posRes.json();
        if (posData.positions && Array.isArray(posData.positions)) {
          setUserPositions(posData.positions);
        }
      }
    } catch {
      setSidecarConnected(false);
    }
  };

  // Poll Sidecar health, balance & positions
  useEffect(() => {
    let isCancelled = false;

    const runCheck = async () => {
      if (!isCancelled) {
        await fetchStatusAndPositions();
      }
    };

    runCheck();
    const interval = setInterval(runCheck, 3000);
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

  const activeTokenId = outcome === 'UP' ? upTokenId : downTokenId;

  // Find active position for current token
  const matchingPosition = userPositions.find(
    (p) => p.asset?.toLowerCase() === activeTokenId?.toLowerCase()
  );
  const heldShares = matchingPosition ? parseFloat(matchingPosition.size || '0') : 0;
  const avgBuyPrice = matchingPosition ? parseFloat(matchingPosition.avgPrice || '0') : 0;

  // Auto-fill sharesToSell if switching to SELL
  useEffect(() => {
    if (tradeMode === 'SELL') {
      if (heldShares > 0) {
        setSharesToSellInput(heldShares.toString());
      } else {
        const oppositeTokenId = outcome === 'UP' ? downTokenId : upTokenId;
        const oppPos = userPositions.find((p) => p.asset?.toLowerCase() === oppositeTokenId?.toLowerCase());
        if (oppPos && parseFloat(oppPos.size || '0') > 0) {
          setOutcome(outcome === 'UP' ? 'DOWN' : 'UP');
          setSharesToSellInput(oppPos.size.toString());
        }
      }
    }
  }, [tradeMode]);

  // Calculations
  const rawPrice = outcome === 'UP' ? upPrice : downPrice;
  const currentPrice = orderType === 'MARKET'
    ? Math.max(0.01, Math.min(0.99, rawPrice || 0.50))
    : Math.max(0.01, Math.min(0.99, (parseFloat(customPriceCents) || 50) / 100));

  const contractPriceUsd = currentPrice;
  const contractPriceCents = (contractPriceUsd * 100).toFixed(1);
  const feeRatePct = 0.005; // 0.5% taker fee estimate

  // Parsed numerical values
  const parsedBuyAmount = Math.max(1, parseFloat(amountUsdInput) || 1);
  const parsedSellShares = Math.max(0, parseFloat(sharesToSellInput) || 0);

  // BUY Mode Calculations:
  // Use Math.ceil so total order value is ALWAYS strictly >= $1.00 USD (Polymarket CLOB min size requirement)
  let buyShares = contractPriceUsd > 0 ? Math.ceil((parsedBuyAmount / contractPriceUsd) * 100) / 100 : 0;
  if (buyShares * contractPriceUsd < 1.00) {
    buyShares = Math.ceil(((1.00 / contractPriceUsd) + 0.005) * 100) / 100;
  }
  const buyCost = parseFloat((buyShares * contractPriceUsd).toFixed(2));
  const buyFee = parseFloat((buyCost * feeRatePct).toFixed(3));
  const buyPayout = parseFloat((buyShares * 1.00).toFixed(2));
  const buyProfit = Math.max(0, parseFloat((buyPayout - buyCost - buyFee).toFixed(2)));
  const buyRoiPct = buyCost > 0 ? ((buyProfit / buyCost) * 100).toFixed(1) : '0';

  // SELL Mode Calculations:
  const sellGrossProceeds = parseFloat((parsedSellShares * contractPriceUsd).toFixed(2));
  const sellFee = parseFloat((sellGrossProceeds * feeRatePct).toFixed(3));
  const sellNetProceeds = Math.max(0, parseFloat((sellGrossProceeds - sellFee).toFixed(2)));
  const sellCostBasis = avgBuyPrice > 0 ? parseFloat((parsedSellShares * avgBuyPrice).toFixed(2)) : 0;
  const sellPnlEstimate = avgBuyPrice > 0 ? parseFloat((sellNetProceeds - sellCostBasis).toFixed(2)) : null;

  const handleSetSellPercentage = (pct: number) => {
    if (heldShares > 0) {
      const computed = Math.floor((heldShares * (pct / 100)) * 100) / 100;
      setSharesToSellInput(computed.toString());
    }
  };

  const handleAddAmount = (add: number) => {
    const current = parseFloat(amountUsdInput) || 0;
    setAmountUsdInput((current + add).toString());
  };

  const handleExecute = async () => {
    if (!sidecarConnected) {
      setFeedback({
        type: 'error',
        text: 'Local Trading Sidecar server tidak aktif.',
      });
      return;
    }

    if (!hasCredentials) {
      setFeedback({
        type: 'error',
        text: 'Kredensial Polymarket belum diatur. Klik Settings di header.',
      });
      onOpenSettings?.();
      return;
    }

    if (!activeTokenId) {
      setFeedback({
        type: 'error',
        text: 'Token ID ronde belum siap. Tunggu beberapa detik...',
      });
      return;
    }

    if (tradeMode === 'BUY' && parsedBuyAmount < 1.0) {
      setFeedback({ type: 'error', text: 'Nominal pembelian minimum Polymarket adalah $1.00 USD.' });
      return;
    }

    if (tradeMode === 'SELL' && parsedSellShares <= 0) {
      setFeedback({ type: 'error', text: 'Masukkan jumlah kontrak yang ingin dijual.' });
      return;
    }

    setIsExecuting(true);
    setFeedback(null);

    try {
      const endpoint = tradeMode === 'BUY' ? `${getSidecarUrl()}/api/order/buy` : `${getSidecarUrl()}/api/order/sell`;
      const payload = tradeMode === 'BUY'
        ? {
            asset,
            outcome,
            tokenId: activeTokenId,
            orderType,
            amountUsd: parsedBuyAmount,
            limitPrice: contractPriceUsd,
            slippageTolerance: 0.015,
          }
        : {
            asset,
            outcome,
            tokenId: activeTokenId,
            orderType,
            shares: parsedSellShares,
            limitPrice: contractPriceUsd,
            slippageTolerance: 0.015,
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: data.message || `Order ${tradeMode} ${outcome} berhasil dipasang!`,
        });
        setTimeout(fetchStatusAndPositions, 1000);
      } else {
        setFeedback({
          type: 'error',
          text: data.message || `Gagal mengeksekusi order ${tradeMode}.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Error: ${err.message || 'Gagal mengirim order'}`,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className={`border rounded-xl p-3 flex flex-col font-mono text-xs shadow-md select-none transition-colors relative ${
        isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#dbe0e7] text-slate-800'
      }`}
    >
      {/* Auto-Dismiss Floating Toast Notification */}
      {feedback && (
        <div
          className={`absolute top-2 left-3 right-3 z-50 p-2 rounded-lg border flex items-center justify-between shadow-xl transition-all animate-in fade-in slide-in-from-top-2 duration-200 text-[11px] font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-950/95 border-[#089981] text-emerald-200'
              : 'bg-rose-950/95 border-[#f23645] text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2 flex-1 mr-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#089981] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#f23645] flex-shrink-0" />
            )}
            <span className="line-clamp-2">{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Panel Header & Saldo */}
      <div className={`flex items-center justify-between pb-2 border-b mb-2.5 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className="flex items-center space-x-2 font-black text-xs uppercase tracking-wide">
          <Zap className="w-4 h-4 text-[#f0b90b]" />
          <span className={isDark ? 'text-white' : 'text-slate-900'}>PANEL TRADING INSTAN</span>
        </div>
        {/* Live Saldo & Status */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <span className={`w-2 h-2 rounded-full ${sidecarConnected ? 'bg-[#089981] animate-pulse' : 'bg-[#f23645]'}`} />
            <span className={`text-[10px] font-bold ${sidecarConnected ? (hasCredentials ? 'READY' : 'NO KEYS') : 'OFFLINE'}`}>
              {sidecarConnected ? (hasCredentials ? 'READY' : 'NO KEYS') : 'OFFLINE'}
            </span>
          </div>
          {usdcBalance !== null && (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-950/50 border border-[#089981]/50 text-[#089981]">
              <span className="text-[10px] font-bold text-[#787b86]">SALDO:</span>
              <strong className="text-xs font-mono text-white font-black">${usdcBalance.toFixed(2)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* 0. Multi-Period Upcoming Markets Selector (Sesuai Data Polymarket) */}
      {upcomingPeriods && upcomingPeriods.length > 0 && onSelectPeriod && (
        <div className="mb-2.5 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#787b86]">
            <span className="flex items-center space-x-1 font-bold">
              <Clock className="w-3 h-3 text-[#f0b90b]" />
              <span>PERIODE PASAR POLYMARKET:</span>
            </span>
            <span className="text-[9px] text-[#089981] font-bold">SINKRON RESMI</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 select-none">
            {upcomingPeriods.map((p) => {
              const isSelected = selectedWindowTs ? selectedWindowTs === p.windowTs : p.isCurrent;
              return (
                <button
                  key={p.windowTs}
                  onClick={() => onSelectPeriod(p.windowTs)}
                  className={`px-1.5 py-1.5 rounded-lg border text-[10px] font-mono font-bold flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-[#f0b90b] text-slate-950 border-[#f0b90b] shadow-[0_0_10px_rgba(240,185,11,0.4)] font-black ring-1 ring-[#f0b90b]'
                      : isDark
                      ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-white hover:border-slate-600'
                      : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-black'
                  }`}
                  title={`Klik untuk memantau & beli periode ${p.label}`}
                >
                  <span className="truncate w-full text-center">{p.isCurrent ? '🟢 AKTIF' : p.label.split(' ')[0]}</span>
                  <span className="text-[9px] opacity-80">{p.label.includes('(') ? p.label.split('(')[1].replace(')', '') : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. KOTAK ODDS UP & DOWN (Relokasi dari Atas Chart ke Atas Menu BUY/SELL) */}
      {(() => {
        const validUpPrice = Math.max(0.01, Math.min(0.99, isNaN(upPrice) ? 0.50 : upPrice));
        const validDownPrice = Math.max(0.01, Math.min(0.99, isNaN(downPrice) ? 0.50 : downPrice));
        const upCents = (validUpPrice * 100).toFixed(1);
        const downCents = (validDownPrice * 100).toFixed(1);
        const upRoi = ((1 / validUpPrice) - 1) * 100;
        const downRoi = ((1 / validDownPrice) - 1) * 100;
        const isUpWinning = settlement ? settlement.isUpWinning : validUpPrice >= 0.50;
        const upPct = (validUpPrice * 100).toFixed(0);
        const downPct = (validDownPrice * 100).toFixed(0);

        return (
          <div className={`p-2 rounded-xl border mb-2.5 ${isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="grid grid-cols-2 gap-1.5 items-stretch">
              {/* UP ODDS CARD */}
              <div
                className={`rounded-lg px-2.5 py-1.5 border transition-all flex items-center justify-between ${
                  isUpWinning
                    ? isDark
                      ? 'bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-[#089981]/30 via-[#0d2b20] to-[#131722] border-[#089981] shadow-[0_0_12px_rgba(8,153,129,0.3)] ring-1 ring-[#089981]'
                      : 'bg-emerald-50 border-[#089981] shadow-sm ring-1 ring-[#089981]'
                    : isDark
                    ? 'bg-[#1e222d]/60 border-[#2a2e39]'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#089981]" />
                    <span className="text-[10px] font-mono font-black uppercase text-[#089981]">UP (NAIK)</span>
                  </div>
                  <div className="text-[9px] font-mono text-[#787b86]">
                    ROI: <strong className="text-[#089981]">+{upRoi.toFixed(0)}%</strong>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-mono font-black text-[#089981]">{upCents}¢</span>
                </div>
              </div>

              {/* DOWN ODDS CARD */}
              <div
                className={`rounded-lg px-2.5 py-1.5 border transition-all flex items-center justify-between ${
                  !isUpWinning
                    ? isDark
                      ? 'bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-[#f23645]/30 via-[#2e1219] to-[#131722] border-[#f23645] shadow-[0_0_12px_rgba(242,54,69,0.3)] ring-1 ring-[#f23645]'
                      : 'bg-rose-50 border-[#f23645] shadow-sm ring-1 ring-[#f23645]'
                    : isDark
                    ? 'bg-[#1e222d]/60 border-[#2a2e39]'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-1">
                    <ArrowDownRight className="w-3.5 h-3.5 text-[#f23645]" />
                    <span className="text-[10px] font-mono font-black uppercase text-[#f23645]">DOWN (TURUN)</span>
                  </div>
                  <div className="text-[9px] font-mono text-[#787b86]">
                    ROI: <strong className="text-[#f23645]">+{downRoi.toFixed(0)}%</strong>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-mono font-black text-[#f23645]">{downCents}¢</span>
                </div>
              </div>
            </div>

            {/* Mini Energy Duel Bar */}
            <div className="relative w-full h-1.5 rounded-full overflow-hidden flex bg-[#1e222d] mt-1.5">
              <div className="h-full bg-gradient-to-r from-[#089981] to-[#00ff88]" style={{ width: `${upPct}%` }} />
              <div className="h-full bg-gradient-to-l from-[#f23645] to-[#ff3b69]" style={{ width: `${downPct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* 2. MODE SELECTOR TABS DENGAN INTERACTIVE DECISION TREE ARROWS (MODEL 1) */}
      <div className="mb-2.5">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTradeMode('BUY')}
            onMouseEnter={() => setHoveredMode('BUY')}
            onMouseLeave={() => setHoveredMode(null)}
            className={`py-2 rounded-lg font-black text-xs flex items-center justify-center space-x-2 transition-all border ${
              tradeMode === 'BUY'
                ? 'bg-[#089981] text-white border-[#089981] shadow-[0_0_15px_rgba(8,153,129,0.4)]'
                : hoveredMode === 'BUY'
                ? 'bg-[#089981]/20 text-[#089981] border-[#089981]/60'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-white'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-black'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>BELI (ENTRY POSISI)</span>
          </button>

          <button
            onClick={() => setTradeMode('SELL')}
            onMouseEnter={() => setHoveredMode('SELL')}
            onMouseLeave={() => setHoveredMode(null)}
            className={`py-2 rounded-lg font-black text-xs flex items-center justify-center space-x-2 transition-all border ${
              tradeMode === 'SELL'
                ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-[0_0_15px_rgba(234,88,12,0.4)]'
                : hoveredMode === 'SELL'
                ? 'bg-[#ea580c]/20 text-[#ea580c] border-[#ea580c]/60'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-amber-400'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-amber-600'
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            <span>JUAL (TUTUP / TAKE PROFIT)</span>
          </button>
        </div>

        {/* DECISION TREE BRANCHING ARROWS (Pohon Keputusan Visual agar Otak Tidak Keliru) */}
        {(hoveredMode === 'BUY' || (!hoveredMode && tradeMode === 'BUY')) && (
          <div className={`mt-1.5 p-2 rounded-lg border text-[11px] font-mono transition-all ${
            isDark ? 'bg-[#131722] border-[#089981]/40' : 'bg-emerald-50/70 border-[#089981]/30'
          }`}>
            <div className="flex items-center space-x-1.5 text-[#089981] font-bold text-[10px] mb-1">
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>PANDUAN ENTRY (TEBAK HARGA):</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'UP' && tradeMode === 'BUY' ? 'bg-[#089981]/25 border-[#089981] text-white font-bold' : 'border-slate-800 text-[#787b86]'
              }`}>
                <span className="text-[#089981] font-black">↳ 🟢</span>
                <span className="truncate"><strong>BELI UP</strong> (Tebak Naik)</span>
              </div>
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'DOWN' && tradeMode === 'BUY' ? 'bg-[#f23645]/25 border-[#f23645] text-white font-bold' : 'border-slate-800 text-[#787b86]'
              }`}>
                <span className="text-[#f23645] font-black">↳ 🔴</span>
                <span className="truncate"><strong>BELI DOWN</strong> (Tebak Turun)</span>
              </div>
            </div>
            <div className="text-[9.5px] text-amber-400/90 mt-1 font-sans italic text-center">
              💡 Ingat: Jika Anda memprediksi harga TURUN, pilih <strong className="text-[#f23645]">BELI DOWN</strong> (jangan tekan tab Jual).
            </div>
          </div>
        )}

        {(hoveredMode === 'SELL' || (!hoveredMode && tradeMode === 'SELL')) && (
          <div className={`mt-1.5 p-2 rounded-lg border text-[11px] font-mono transition-all ${
            isDark ? 'bg-[#131722] border-amber-500/40' : 'bg-amber-50/70 border-amber-500/30'
          }`}>
            <div className="flex items-center space-x-1.5 text-amber-500 font-bold text-[10px] mb-1">
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>PANDUAN EXIT (LEPAS POSISI):</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'UP' && tradeMode === 'SELL' ? 'bg-amber-500/25 border-amber-500 text-white font-bold' : 'border-slate-800 text-[#787b86]'
              }`}>
                <span className="text-amber-500 font-black">↳ 🟠</span>
                <span className="truncate"><strong>JUAL UP</strong> (Tutup Saham Up)</span>
              </div>
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'DOWN' && tradeMode === 'SELL' ? 'bg-orange-500/25 border-orange-500 text-white font-bold' : 'border-slate-800 text-[#787b86]'
              }`}>
                <span className="text-orange-500 font-black">↳ 🟠</span>
                <span className="truncate"><strong>JUAL DOWN</strong> (Tutup Saham Down)</span>
              </div>
            </div>
            <div className="text-[9.5px] text-amber-300 mt-1 font-sans italic text-center">
              ℹ️ Tab JUAL hanya dipakai untuk melepas saham yang sedang Anda miliki (Take Profit / Cut Loss).
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. JIKA MODE BELI: HANYA TAMPILKAN FITUR BUY SECARA LUAS & NYAMAN */}
      {tradeMode === 'BUY' && (
        <div className="space-y-2">
          {/* Outcome Selector (UP vs DOWN) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOutcome('UP')}
              className={`py-2 px-3 rounded-lg font-black text-xs flex items-center justify-center space-x-2 transition-all border ${
                outcome === 'UP'
                  ? 'bg-[#089981] text-white border-[#089981] shadow-md ring-1 ring-[#089981]'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#089981]'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-[#089981]'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <div className="flex flex-col text-left">
                <span>BELI UP ({(upPrice * 100).toFixed(1)}¢)</span>
                <span className="text-[9px] opacity-80 font-normal">🟢 TEBAK TREN NAIK</span>
              </div>
            </button>

            <button
              onClick={() => setOutcome('DOWN')}
              className={`py-2 px-3 rounded-lg font-black text-xs flex items-center justify-center space-x-2 transition-all border ${
                outcome === 'DOWN'
                  ? 'bg-[#f23645] text-white border-[#f23645] shadow-md ring-1 ring-[#f23645]'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#f23645]'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-[#f23645]'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <div className="flex flex-col text-left">
                <span>BELI DOWN ({(downPrice * 100).toFixed(1)}¢)</span>
                <span className="text-[9px] opacity-80 font-normal">🔴 TEBAK TREN TURUN</span>
              </div>
            </button>
          </div>

          {/* 2-Column Balanced Body: Left = Inputs, Right = Calculations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Left Column: Order Type & Flexible Modal Inputs */}
            <div className={`p-2.5 rounded-lg border space-y-2 ${isDark ? 'bg-[#1e222d]/60 border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#787b86] font-bold">TIPE ORDER:</span>
                <div className={`flex items-center p-0.5 rounded border text-[10px] ${isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-slate-300'}`}>
                  <button
                    onClick={() => setOrderType('MARKET')}
                    className={`px-2 py-0.5 rounded font-black transition-colors ${
                      orderType === 'MARKET' ? 'bg-[#f0b90b] text-black shadow-sm' : 'text-[#787b86]'
                    }`}
                  >
                    MARKET
                  </button>
                  <button
                    onClick={() => setOrderType('LIMIT')}
                    className={`px-2 py-0.5 rounded font-black transition-colors ${
                      orderType === 'LIMIT' ? 'bg-[#f0b90b] text-black shadow-sm' : 'text-[#787b86]'
                    }`}
                  >
                    LIMIT
                  </button>
                </div>
              </div>

              {orderType === 'LIMIT' && (
                <div className="flex items-center justify-between p-1 rounded border border-[#f0b90b]/40 bg-[#f0b90b]/10 text-[10px]">
                  <span className="font-bold text-[#f0b90b]">HARGA LIMIT:</span>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="99"
                      value={customPriceCents}
                      onChange={(e) => setCustomPriceCents(e.target.value)}
                      className={`w-14 px-1 py-0.5 text-right font-black rounded border text-xs ${
                        isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className="font-bold text-[#f0b90b]">¢</span>
                  </div>
                </div>
              )}

              {/* Free Manual USD Input (Min $1) */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-[#787b86] font-bold mb-1">
                  <span>MODAL BELI (MIN $1):</span>
                  <div className="flex items-center space-x-1">
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-xs font-black text-[#f0b90b]">$</span>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="1.00"
                        value={amountUsdInput}
                        onChange={(e) => setAmountUsdInput(e.target.value)}
                        className={`w-24 pl-5 pr-2 py-1 text-right font-black rounded-md border text-xs focus:ring-1 focus:ring-[#f0b90b] outline-none ${
                          isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Presets ($1, $2, $5, $10, $25, MAX) */}
                <div className="grid grid-cols-6 gap-1 mb-1">
                  {BUY_PRESET_AMOUNTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setAmountUsdInput(p.toString())}
                      className={`py-1 rounded font-black text-[10px] border transition-all ${
                        parseFloat(amountUsdInput) === p
                          ? 'bg-[#f0b90b] text-black border-[#f0b90b]'
                          : isDark
                          ? 'bg-[#131722] border-[#2a2e39] text-[#787b86] hover:text-white'
                          : 'bg-white border-slate-300 text-slate-600 hover:text-black'
                      }`}
                    >
                      ${p}
                    </button>
                  ))}
                  {/* MAX button */}
                  <button
                    onClick={() => {
                      if (usdcBalance && usdcBalance >= 1) {
                        setAmountUsdInput(Math.floor(usdcBalance * 100) / 100 + '');
                      }
                    }}
                    className={`py-1 rounded font-black text-[9px] border transition-all ${
                      isDark
                        ? 'bg-[#131722] border-[#089981]/50 text-[#089981] hover:bg-[#089981]/20'
                        : 'bg-emerald-50 border-[#089981]/40 text-[#089981] hover:bg-emerald-100'
                    }`}
                  >
                    MAX
                  </button>
                </div>

                {/* Quick Add Buttons (+1, +5) */}
                <div className="flex items-center space-x-1 justify-end pt-0.5">
                  <span className="text-[8px] text-[#787b86] mr-1">Tambah cepat:</span>
                  <button
                    onClick={() => handleAddAmount(1)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                      isDark ? 'bg-[#131722] border-slate-700 hover:text-white' : 'bg-white border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    +$1
                  </button>
                  <button
                    onClick={() => handleAddAmount(5)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                      isDark ? 'bg-[#131722] border-slate-700 hover:text-white' : 'bg-white border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    +$5
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Financial Calculations */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between text-[10px] space-y-1 ${isDark ? 'bg-[#1e222d]/60 border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Harga Beli (Ask):</span>
                <span className="font-bold text-white">{contractPriceCents}¢ (${contractPriceUsd.toFixed(3)})</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Jumlah Kontrak:</span>
                <span className="font-black text-[#f0b90b]">{buyShares} Lembar</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Total Biaya (+Fee):</span>
                <span>${buyCost.toFixed(2)} (<span className="text-[#787b86]">${buyFee} fee</span>)</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                <span className="text-[#787b86]">Potensi Payout:</span>
                <span className="font-bold text-white">${buyPayout.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#089981] font-bold">Potensi Profit Bersih:</span>
                <span className="font-black text-[#089981]">+${buyProfit.toFixed(2)} (+{buyRoiPct}%)</span>
              </div>
            </div>
          </div>

          {/* Big Wide Action Button */}
          <button
            onClick={handleExecute}
            disabled={isExecuting || !sidecarConnected}
            className={`w-full py-3 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-lg ${
              outcome === 'UP'
                ? 'bg-[#089981] hover:bg-[#0aa88f] text-white shadow-[0_0_15px_rgba(8,153,129,0.4)] disabled:opacity-50'
                : 'bg-[#f23645] hover:bg-[#ff3b4b] text-white shadow-[0_0_15px_rgba(242,54,69,0.4)] disabled:opacity-50'
            }`}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>MENGIRIM ORDER KE POLYMARKET...</span>
              </>
            ) : (
              <span>
                BELI {outcome} (${buyCost.toFixed(2)}) — DAPAT ~{buyShares} KONTRAK
              </span>
            )}
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. JIKA MODE JUAL: HANYA TAMPILKAN FITUR SELL SECARA LUAS & NYAMAN */}
      {/* ========================================================================= */}
      {tradeMode === 'SELL' && (
        <div className="space-y-2">
          {/* Outcome Selector (JUAL UP vs JUAL DOWN) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOutcome('UP')}
              className={`py-2 px-3 rounded-lg font-black text-xs flex items-center justify-center space-x-2 transition-all border ${
                outcome === 'UP'
                  ? 'bg-amber-600 text-white border-amber-500 shadow-md ring-1 ring-amber-400'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-amber-400'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-amber-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <div className="flex flex-col text-left">
                <span>JUAL UP ({(upPrice * 100).toFixed(1)}¢)</span>
                <span className="text-[9px] opacity-80 font-normal">🟠 TUTUP SAHAM UP</span>
              </div>
            </button>

            <button
              onClick={() => setOutcome('DOWN')}
              className={`py-2 px-3 rounded-lg font-black text-xs flex items-center justify-center space-x-2 transition-all border ${
                outcome === 'DOWN'
                  ? 'bg-orange-600 text-white border-orange-500 shadow-md ring-1 ring-orange-400'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-orange-400'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-orange-600'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <div className="flex flex-col text-left">
                <span>JUAL DOWN ({(downPrice * 100).toFixed(1)}¢)</span>
                <span className="text-[9px] opacity-80 font-normal">🟠 TUTUP SAHAM DOWN</span>
              </div>
            </button>
          </div>

          {/* Prominent Owned Position Banner */}
          <div
            className={`px-3 py-1.5 rounded-lg border flex items-center justify-between text-xs font-mono ${
              heldShares > 0
                ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86]'
                : 'bg-slate-100 border-slate-300 text-slate-500'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-[#f0b90b]" />
              <span className="font-bold">POSISI TERBUKA ({outcome}):</span>
            </div>
            <div>
              {heldShares > 0 ? (
                <span className="font-black text-white text-xs">
                  {heldShares.toFixed(2)} Lembar (~${(heldShares * contractPriceUsd).toFixed(2)})
                  {avgBuyPrice > 0 && (
                    <span className="text-amber-300 text-[10px] ml-1.5 font-normal">
                      (Beli @ {(avgBuyPrice * 100).toFixed(1)}¢)
                    </span>
                  )}
                </span>
              ) : (
                <span className="italic text-[11px]">0 Lembar (Belum ada posisi)</span>
              )}
            </div>
          </div>

          {/* 2-Column Balanced Body: Left = Shares & Presets, Right = Cash Return */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Left Column: Percentage Buttons & Quantity */}
            <div className={`p-2.5 rounded-lg border space-y-2 ${isDark ? 'bg-[#1e222d]/60 border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between text-[10px] text-[#787b86] font-bold">
                <span>JUMLAH JUAL:</span>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max={heldShares > 0 ? heldShares : 10000}
                    value={sharesToSellInput}
                    onChange={(e) => setSharesToSellInput(e.target.value)}
                    className={`w-20 px-1.5 py-0.5 text-right font-black rounded border text-xs ${
                      isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <span className="font-bold text-slate-400">Lembar</span>
                </div>
              </div>

              {/* Presets: 25%, 50%, 75%, 100% MAX */}
              <div>
                <span className="text-[9px] text-[#787b86] font-bold uppercase block mb-1">
                  TUTUP SEBAGIAN / SEMUA:
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {SELL_PERCENT_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => handleSetSellPercentage(pct)}
                      disabled={heldShares <= 0}
                      className={`py-1 rounded font-black text-[10px] border transition-all ${
                        heldShares > 0 && Math.abs(parsedSellShares - Math.floor((heldShares * (pct / 100)) * 100) / 100) < 0.05
                          ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                          : isDark
                          ? 'bg-[#131722] border-[#2a2e39] text-[#787b86] hover:text-white disabled:opacity-30'
                          : 'bg-white border-slate-300 text-slate-600 hover:text-black disabled:opacity-30'
                      }`}
                    >
                      {pct === 100 ? '100% MAX' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Financial Proceeds */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between text-[10px] space-y-1 ${isDark ? 'bg-[#1e222d]/60 border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Harga Jual (Bid):</span>
                <span className="font-bold text-white">{contractPriceCents}¢ (${contractPriceUsd.toFixed(3)})</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Kontrak Dijual:</span>
                <span className="font-black text-amber-400">{parsedSellShares} Lembar</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Estimasi Fee CLOB:</span>
                <span className="text-[#787b86]">-${sellFee.toFixed(3)}</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                <span className="text-emerald-400 font-bold">Kas Masuk ke Saldo:</span>
                <span className="font-black text-emerald-400 text-xs">+${sellNetProceeds.toFixed(2)} USDC.e</span>
              </div>

              {sellPnlEstimate !== null && (
                <div className="flex items-center justify-between">
                  <span className={sellPnlEstimate >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                    Est. Realized PnL:
                  </span>
                  <span className={`font-black ${sellPnlEstimate >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                    {sellPnlEstimate >= 0 ? `+$${sellPnlEstimate.toFixed(2)}` : `-$${Math.abs(sellPnlEstimate).toFixed(2)}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Big Wide Action Button */}
          <button
            onClick={handleExecute}
            disabled={isExecuting || !sidecarConnected || parsedSellShares <= 0}
            className="w-full py-3 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)] disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>MENGIRIM ORDER JUAL KE POLYMARKET...</span>
              </>
            ) : (
              <span>
                JUAL {outcome} ({parsedSellShares} Lembar → +${sellNetProceeds.toFixed(2)} USDC.e)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
