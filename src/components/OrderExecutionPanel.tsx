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
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  X,
  CornerDownRight,
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
        isDark ? 'bg-[#181d28] border-[#2a2e39]' : 'bg-white border-slate-200 text-slate-800'
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
      <div className={`flex items-center justify-between pb-1.5 border-b mb-2 ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
        <div className="flex items-center space-x-2 font-black text-xs uppercase tracking-wide">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className={isDark ? 'text-white' : 'text-slate-900'}>PANEL TRADING INSTAN</span>
        </div>
        {/* Live Saldo & Status */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <span className={`w-2 h-2 rounded-full ${sidecarConnected ? (isDark ? 'bg-[#089981]' : 'bg-emerald-600') : 'bg-[#f23645]'}`} />
            <span className={`text-[10px] font-bold ${sidecarConnected ? (hasCredentials ? (isDark ? 'text-[#26a69a]' : 'text-emerald-700') : 'text-amber-500') : 'text-[#f23645]'}`}>
              {sidecarConnected ? (hasCredentials ? 'READY' : 'NO KEYS') : 'OFFLINE'}
            </span>
          </div>
          {usdcBalance !== null && (
            <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-md border ${
              isDark ? 'bg-[#142621] border-[#089981]/50 text-[#26a69a]' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}>
              <span className={`text-[10px] font-bold ${isDark ? 'text-[#787b86]' : 'text-slate-500'}`}>SALDO:</span>
              <strong className={`text-xs font-mono font-black ${isDark ? 'text-white' : 'text-emerald-950'}`}>${usdcBalance.toFixed(2)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* 1. KOTAK NILAI UP & DOWN (Desain Profesional, Kontras Tajam, Nyaman di Mata & Otak) */}
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
          <div className={`p-2 rounded-xl border mb-2 transition-all ${
            isDark
              ? 'bg-[#141822] border-[#2a2e39]'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="grid grid-cols-2 gap-2 items-stretch">
              
              {/* === KOTAK NILAI UP === */}
              <div
                onClick={() => setOutcome('UP')}
                role="button"
                tabIndex={0}
                className={`relative rounded-xl p-2.5 border-2 transition-all cursor-pointer select-none ${
                  outcome === 'UP'
                    ? isDark
                      ? 'ring-2 ring-[#089981] ring-offset-1 ring-offset-[#141822]'
                      : 'ring-2 ring-emerald-600 ring-offset-1 ring-offset-white'
                    : 'opacity-95 hover:opacity-100'
                } ${
                  isDark
                    ? 'bg-[#142620] border-[#089981] text-[#e0e3eb]'
                    : 'bg-emerald-50/90 border-emerald-500 shadow-sm text-slate-900'
                }`}
                title="Klik untuk memilih UP"
              >
                {/* Top Row: Label & Status */}
                <div className="flex items-center justify-between mb-1">
                  <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider ${
                    isDark
                      ? 'bg-[#089981]/20 border border-[#089981]/40 text-[#26a69a]'
                      : 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                  }`}>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>UP (NAIK)</span>
                  </div>
                  {isUpWinning ? (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                      isDark ? 'bg-[#089981] text-white' : 'bg-emerald-700 text-white shadow-sm'
                    }`}>
                      👑 MEMIMPIN
                    </span>
                  ) : (
                    <span className={`text-[9.5px] font-mono font-bold ${
                      isDark ? 'text-[#26a69a]' : 'text-emerald-700'
                    }`}>
                      {upPct}%
                    </span>
                  )}
                </div>

                {/* Middle Row: Crisp, Ultra-Sharp Price Display (NO BLUR, NO FOG) */}
                <div className="flex items-baseline justify-between mt-1">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-[#787b86]' : 'text-slate-600'}`}>
                    NILAI KONTRAK:
                  </span>
                  <div className="flex items-baseline space-x-0.5">
                    <span className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${
                      isDark ? 'text-[#26a69a]' : 'text-emerald-900 font-black'
                    }`}>
                      {upCents}
                    </span>
                    <span className={`text-sm font-bold ${isDark ? 'text-[#26a69a]' : 'text-emerald-700'}`}>¢</span>
                  </div>
                </div>

                {/* Bottom Row: ROI Badge */}
                <div className={`flex items-center justify-between pt-1 mt-1 border-t text-[9.5px] font-mono ${
                  isDark ? 'border-[#089981]/30' : 'border-emerald-200'
                }`}>
                  <span className={isDark ? 'text-[#787b86]' : 'text-slate-600'}>ESTIMASI ROI:</span>
                  <strong className={`font-black ${isDark ? 'text-[#26a69a]' : 'text-emerald-800'}`}>
                    +{upRoi.toFixed(0)}%
                  </strong>
                </div>
              </div>

              {/* === KOTAK NILAI DOWN === */}
              <div
                onClick={() => setOutcome('DOWN')}
                role="button"
                tabIndex={0}
                className={`relative rounded-xl p-2.5 border-2 transition-all cursor-pointer select-none ${
                  outcome === 'DOWN'
                    ? isDark
                      ? 'ring-2 ring-[#f23645] ring-offset-1 ring-offset-[#141822]'
                      : 'ring-2 ring-rose-600 ring-offset-1 ring-offset-white'
                    : 'opacity-95 hover:opacity-100'
                } ${
                  isDark
                    ? 'bg-[#2b171c] border-[#f23645] text-[#e0e3eb]'
                    : 'bg-rose-50/90 border-rose-500 shadow-sm text-slate-900'
                }`}
                title="Klik untuk memilih DOWN"
              >
                {/* Top Row: Label & Status */}
                <div className="flex items-center justify-between mb-1">
                  <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider ${
                    isDark
                      ? 'bg-[#f23645]/20 border border-[#f23645]/40 text-[#f23645]'
                      : 'bg-rose-100 border border-rose-300 text-rose-900'
                  }`}>
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>DOWN (TURUN)</span>
                  </div>
                  {!isUpWinning ? (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                      isDark ? 'bg-[#f23645] text-white' : 'bg-rose-700 text-white shadow-sm'
                    }`}>
                      👑 MEMIMPIN
                    </span>
                  ) : (
                    <span className={`text-[9.5px] font-mono font-bold ${
                      isDark ? 'text-[#f23645]' : 'text-rose-700'
                    }`}>
                      {downPct}%
                    </span>
                  )}
                </div>

                {/* Middle Row: Crisp, Ultra-Sharp Price Display (NO BLUR, NO FOG) */}
                <div className="flex items-baseline justify-between mt-1">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-[#787b86]' : 'text-slate-600'}`}>
                    NILAI KONTRAK:
                  </span>
                  <div className="flex items-baseline space-x-0.5">
                    <span className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${
                      isDark ? 'text-[#f23645]' : 'text-rose-900 font-black'
                    }`}>
                      {downCents}
                    </span>
                    <span className={`text-sm font-bold ${isDark ? 'text-[#f23645]' : 'text-rose-700'}`}>¢</span>
                  </div>
                </div>

                {/* Bottom Row: ROI Badge */}
                <div className={`flex items-center justify-between pt-1 mt-1 border-t text-[9.5px] font-mono ${
                  isDark ? 'border-[#f23645]/30' : 'border-rose-200'
                }`}>
                  <span className={isDark ? 'text-[#787b86]' : 'text-slate-600'}>ESTIMASI ROI:</span>
                  <strong className={`font-black ${isDark ? 'text-[#f23645]' : 'text-rose-800'}`}>
                    +{downRoi.toFixed(0)}%
                  </strong>
                </div>
              </div>

            </div>

            {/* Clean Dual Power Bar */}
            <div className={`relative w-full h-2 rounded-full overflow-hidden flex mt-2 p-0.5 border ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-200 border-slate-300'
            }`}>
              <div
                className={`h-full rounded-l-full transition-all duration-300 ${
                  isDark ? 'bg-[#089981]' : 'bg-emerald-600'
                }`}
                style={{ width: `${upPct}%` }}
                title={`Kekuatan UP: ${upPct}%`}
              />
              <div
                className={`h-full rounded-r-full transition-all duration-300 ${
                  isDark ? 'bg-[#f23645]' : 'bg-rose-600'
                }`}
                style={{ width: `${downPct}%` }}
                title={`Kekuatan DOWN: ${downPct}%`}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] font-mono mt-0.5 px-0.5">
              <span className={`font-bold ${isDark ? 'text-[#26a69a]' : 'text-emerald-800'}`}>
                UP: {upPct}%
              </span>
              <span className={`text-[8.5px] uppercase tracking-wider ${isDark ? 'text-[#787b86]' : 'text-slate-500'}`}>
                Kekuatan Pasar
              </span>
              <span className={`font-bold ${isDark ? 'text-[#f23645]' : 'text-rose-800'}`}>
                DOWN: {downPct}%
              </span>
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
                ? 'bg-[#089981] text-white border-[#089981] shadow-sm'
                : hoveredMode === 'BUY'
                ? 'bg-[#089981]/20 text-[#089981] border-[#089981]/60'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#9598a1] hover:text-white'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-black'
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
                ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-sm'
                : hoveredMode === 'SELL'
                ? 'bg-[#ea580c]/20 text-[#ea580c] border-[#ea580c]/60'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#9598a1] hover:text-amber-400'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-amber-700'
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            <span>JUAL (TUTUP / TAKE PROFIT)</span>
          </button>
        </div>

        {/* DECISION TREE BRANCHING ARROWS (Pohon Keputusan Visual agar Otak Tidak Keliru) */}
        {(hoveredMode === 'BUY' || (!hoveredMode && tradeMode === 'BUY')) && (
          <div className={`mt-1.5 p-2 rounded-lg border text-[11px] font-mono transition-all ${
            isDark ? 'bg-[#142620] border-[#089981]/40' : 'bg-emerald-50 border-emerald-300 text-slate-900'
          }`}>
            <div className={`flex items-center space-x-1.5 font-bold text-[10px] mb-1 ${
              isDark ? 'text-[#26a69a]' : 'text-emerald-800'
            }`}>
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>PANDUAN ENTRY (TEBAK HARGA):</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'UP' && tradeMode === 'BUY'
                  ? isDark
                    ? 'bg-[#089981]/30 border-[#089981] text-white font-bold'
                    : 'bg-emerald-100 border-emerald-500 text-emerald-950 font-black'
                  : isDark
                  ? 'border-[#2a2e39] text-[#787b86]'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}>
                <span className={isDark ? 'text-[#26a69a] font-black' : 'text-emerald-700 font-black'}>↳ 🟢</span>
                <span className="truncate"><strong>BELI UP</strong> (Tebak Naik)</span>
              </div>
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'DOWN' && tradeMode === 'BUY'
                  ? isDark
                    ? 'bg-[#f23645]/30 border-[#f23645] text-white font-bold'
                    : 'bg-rose-100 border-rose-500 text-rose-950 font-black'
                  : isDark
                  ? 'border-[#2a2e39] text-[#787b86]'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}>
                <span className={isDark ? 'text-[#f23645] font-black' : 'text-rose-700 font-black'}>↳ 🔴</span>
                <span className="truncate"><strong>BELI DOWN</strong> (Tebak Turun)</span>
              </div>
            </div>
            <div className={`text-[9.5px] mt-1 font-sans italic text-center ${
              isDark ? 'text-amber-400/90' : 'text-amber-800 font-semibold'
            }`}>
              💡 Ingat: Jika Anda memprediksi harga TURUN, pilih <strong>BELI DOWN</strong> (jangan tekan tab Jual).
            </div>
          </div>
        )}

        {(hoveredMode === 'SELL' || (!hoveredMode && tradeMode === 'SELL')) && (
          <div className={`mt-1.5 p-2 rounded-lg border text-[11px] font-mono transition-all ${
            isDark ? 'bg-[#291b10] border-amber-500/40' : 'bg-amber-50 border-amber-300 text-slate-900'
          }`}>
            <div className={`flex items-center space-x-1.5 font-bold text-[10px] mb-1 ${
              isDark ? 'text-amber-400' : 'text-amber-900'
            }`}>
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>PANDUAN EXIT (LEPAS POSISI):</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'UP' && tradeMode === 'SELL'
                  ? isDark
                    ? 'bg-amber-500/25 border-amber-500 text-white font-bold'
                    : 'bg-amber-100 border-amber-500 text-amber-950 font-black'
                  : isDark
                  ? 'border-[#2a2e39] text-[#787b86]'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}>
                <span className={isDark ? 'text-amber-400 font-black' : 'text-amber-700 font-black'}>↳ 🟠</span>
                <span className="truncate"><strong>JUAL UP</strong> (Tutup Saham Up)</span>
              </div>
              <div className={`p-1.5 rounded flex items-center space-x-1 border ${
                outcome === 'DOWN' && tradeMode === 'SELL'
                  ? isDark
                    ? 'bg-orange-500/25 border-orange-500 text-white font-bold'
                    : 'bg-orange-100 border-orange-500 text-orange-950 font-black'
                  : isDark
                  ? 'border-[#2a2e39] text-[#787b86]'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}>
                <span className={isDark ? 'text-orange-400 font-black' : 'text-orange-700 font-black'}>↳ 🟠</span>
                <span className="truncate"><strong>JUAL DOWN</strong> (Tutup Saham Down)</span>
              </div>
            </div>
            <div className={`text-[9.5px] mt-1 font-sans italic text-center ${
              isDark ? 'text-amber-300' : 'text-amber-900 font-semibold'
            }`}>
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
                <span className={isDark ? 'text-[#787b86]' : 'text-slate-600'}>Harga Beli (Ask):</span>
                <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{contractPriceCents}¢ (${contractPriceUsd.toFixed(3)})</span>
              </div>

              <div className="flex items-center justify-between">
                <span className={isDark ? 'text-[#787b86]' : 'text-slate-600'}>Jumlah Kontrak:</span>
                <span className={`font-black ${isDark ? 'text-[#f0b90b]' : 'text-amber-700'}`}>{buyShares} Lembar</span>
              </div>

              <div className="flex items-center justify-between">
                <span className={isDark ? 'text-[#787b86]' : 'text-slate-600'}>Total Biaya (+Fee):</span>
                <span className={isDark ? 'text-white' : 'text-slate-900'}>${buyCost.toFixed(2)} (<span className={isDark ? 'text-[#787b86]' : 'text-slate-500'}>${buyFee} fee</span>)</span>
              </div>

              <div className={`flex items-center justify-between pt-1 border-t ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-[#787b86]' : 'text-slate-600'}>Potensi Payout:</span>
                <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>${buyPayout.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className={`${isDark ? 'text-[#089981]' : 'text-emerald-700'} font-bold`}>Potensi Profit Bersih:</span>
                <span className={`font-black ${isDark ? 'text-[#089981]' : 'text-emerald-700'}`}>+${buyProfit.toFixed(2)} (+{buyRoiPct}%)</span>
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
                ? isDark
                  ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
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
                <span className={`font-black text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {heldShares.toFixed(2)} Lembar (~${(heldShares * contractPriceUsd).toFixed(2)})
                  {avgBuyPrice > 0 && (
                    <span className={`text-[10px] ml-1.5 font-normal ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
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
                <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{contractPriceCents}¢ (${contractPriceUsd.toFixed(3)})</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Kontrak Dijual:</span>
                <span className={`font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{parsedSellShares} Lembar</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Estimasi Fee CLOB:</span>
                <span className="text-[#787b86]">-${sellFee.toFixed(3)}</span>
              </div>

              <div className={`flex items-center justify-between pt-1 border-t ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
                <span className={`${isDark ? 'text-emerald-400' : 'text-emerald-700'} font-bold`}>Kas Masuk ke Saldo:</span>
                <span className={`font-black text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>+${sellNetProceeds.toFixed(2)} USDC.e</span>
              </div>

              {sellPnlEstimate !== null && (
                <div className="flex items-center justify-between">
                  <span className={sellPnlEstimate >= 0 ? (isDark ? 'text-[#089981]' : 'text-emerald-700') : (isDark ? 'text-[#f23645]' : 'text-rose-700')}>
                    Est. Realized PnL:
                  </span>
                  <span className={`font-black ${sellPnlEstimate >= 0 ? (isDark ? 'text-[#089981]' : 'text-emerald-700') : (isDark ? 'text-[#f23645]' : 'text-rose-700')}`}>
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
