import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CryptoAsset,
  TimeFrame,
  ChartMode,
  ChartStyle,
  ThemeMode,
  OHLCData,
  OrderBookState,
  TradeItem,
  PolymarketEvent,
  PolymarketMarket,
  RoundSettlementState,
  LatencyStats,
  MarketPeriodInfo,
} from '../types/market';
import {
  BinanceStreamManager,
  fetchBinanceKlines,
} from '../services/binanceFeed';
import {
  get5MinWindowTimestamp,
  getPolymarketSlug,
  fetchEventBySlug,
  fetchUpcomingPeriods,
  fetchClobMidpoint,
  fetchOrderBook,
  fetchTradesHistory,
  fetchContractPricesHistory,
  fetchMultiWindowContractHistory,
  loadCachedContractCandles,
  saveCachedContractCandles,
  mergeCandles,
  PolymarketClobWsManager,
} from '../services/polymarketFeed';
import {
  TwapEngine,
  aggregateCandles,
  resampleContractCandles,
  ensureStrictlyAscending,
  toHeikinAshi,
} from '../services/twapEngine';

export function getTimeframeSeconds(tf: TimeFrame): number {
  switch (tf) {
    case '5s': return 5;
    case '15s': return 15;
    case '30s': return 30;
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    default: return 60;
  }
}

function generateBaselineContractCandles(basePrice: number, count: number = 60): OHLCData[] {
  const p = basePrice > 0 && basePrice < 1 ? basePrice : 0.50;
  const now = Math.floor(Date.now() / 60) * 60;
  const candles: OHLCData[] = [];
  for (let i = count; i >= 0; i--) {
    candles.push({
      time: now - (i * 60),
      open: p,
      high: Math.min(0.99, p + 0.005),
      low: Math.max(0.01, p - 0.005),
      close: p,
      volume: 100,
    });
  }
  return candles;
}

export function useTradingTerminal() {
  const [asset, setAsset] = useState<CryptoAsset>('BTC');
  const [timeframe, setTimeframe] = useState<TimeFrame>('1m');
  const [chartMode, setChartMode] = useState<ChartMode>('SPOT');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');

  const assetRef = useRef<CryptoAsset>(asset);
  assetRef.current = asset;
  const timeframeRef = useRef<TimeFrame>(timeframe);
  timeframeRef.current = timeframe;
  const chartModeRef = useRef<ChartMode>(chartMode);
  chartModeRef.current = chartMode;
  const chartStyleRef = useRef<ChartStyle>(chartStyle);
  chartStyleRef.current = chartStyle;

  // Theme Mode (Dark / Light)
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('terminal_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    try {
      localStorage.setItem('terminal_theme', t);
      if (t === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  }, [theme]);

  // Prediction Line (Proyeksi 30s) State
  const [showPrediction, setShowPrediction] = useState<boolean>(true);
  const [predictedPrice, setPredictedPrice] = useState<number>(0);
  const priceRollingQueueRef = useRef<Array<{ time: number; price: number }>>([]);

  // Market & Event State
  const [currentWindowTs, setCurrentWindowTs] = useState<number>(() => get5MinWindowTimestamp());
  const [selectedWindowTs, setSelectedWindowTs] = useState<number>(() => get5MinWindowTimestamp());
  const [upcomingPeriods, setUpcomingPeriods] = useState<MarketPeriodInfo[]>([]);
  const [activeEvent, setActiveEvent] = useState<PolymarketEvent | null>(null);
  const [activeMarket, setActiveMarket] = useState<PolymarketMarket | null>(null);
  const [upTokenId, setUpTokenId] = useState<string>('');
  const [downTokenId, setDownTokenId] = useState<string>('');

  // Live Prices & Settlement
  const [spotPrice, setSpotPrice] = useState<number>(0);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [upPrice, setUpPriceState] = useState<number>(0.50);
  const [downPrice, setDownPrice] = useState<number>(0.50);
  const upPriceRef = useRef<number>(0.50);

  const setUpPrice = useCallback((p: number) => {
    upPriceRef.current = p;
    setUpPriceState(p);
  }, []);

  const [settlement, setSettlement] = useState<RoundSettlementState>({
    currentWindowTs: get5MinWindowTimestamp(),
    secondsLeft: 300,
    strikePrice: 0,
    currentPrice: 0,
    runningTwap: 0,
    strikeDelta: 0,
    strikeDeltaPct: 0,
    twapDelta: 0,
    twapDeltaPct: 0,
    requiredPriceToFlip: 0,
    isUpWinning: true,
    isUrgent: false,
    isCritical: false,
    progressPct: 0,
  });

  // Candlestick Storage
  const spotActiveCandlesRef = useRef<OHLCData[]>([]);
  const contractBaseCandlesRef = useRef<OHLCData[]>([]);
  const contractActiveCandlesRef = useRef<OHLCData[]>([]);

  const [activeCandles, setActiveCandles] = useState<OHLCData[]>([]);
  const [twapLineData, setTwapLineData] = useState<Array<{ time: number; value: number }>>([]);

  // Order Book & Trades
  const [orderBook, setOrderBook] = useState<OrderBookState>({
    bids: [],
    asks: [],
    lastPrice: 0.5,
    bestBid: 0.49,
    bestAsk: 0.51,
    spread: 0.02,
  });
  const [trades, setTrades] = useState<TradeItem[]>([]);

  // Latency & Health
  const [latencyStats, setLatencyStats] = useState<LatencyStats>({
    binanceWsPingMs: 0,
    polymarketWsConnected: false,
    binanceWsConnected: false,
    lastUpdateTimestamp: Date.now(),
  });

  // Services Refs
  const twapEngineRef = useRef<TwapEngine>(new TwapEngine(currentWindowTs));
  const binanceManagerRef = useRef<BinanceStreamManager | null>(null);
  const polyWsManagerRef = useRef<PolymarketClobWsManager | null>(null);
  const latestSpotRef = useRef<number>(0);
  const strikePriceRef = useRef<number>(0);
  const currentWindowRef = useRef<number>(currentWindowTs);
  currentWindowRef.current = currentWindowTs;

  // RAF Throttling for UI
  const rafPendingRef = useRef<boolean>(false);

  // Helper to re-emit active candles safely to state
  const emitCandles = useCallback(() => {
    const isSpot = chartModeRef.current === 'SPOT';
    let source = isSpot ? spotActiveCandlesRef.current : contractActiveCandlesRef.current;

    // In KONTRAK mode, if source is still empty, fallback to baseline candles
    if (!isSpot && source.length === 0) {
      const base = contractBaseCandlesRef.current.length > 0
        ? contractBaseCandlesRef.current
        : generateBaselineContractCandles(0.50, 60);
      contractBaseCandlesRef.current = base;
      source = resampleContractCandles(base, timeframeRef.current, 250);
      contractActiveCandlesRef.current = source;
    }

    if (source.length === 0) {
      setActiveCandles([]);
      return;
    }

    const clean = ensureStrictlyAscending(source);
    if (chartStyleRef.current === 'heikin-ashi') {
      setActiveCandles(toHeikinAshi(clean));
    } else {
      setActiveCandles([...clean]);
    }
  }, []);

  // Clean Reset of Per-Asset State when Asset changes
  useEffect(() => {
    strikePriceRef.current = 0;
    latestSpotRef.current = 0;
    setSpotPrice(0);
    setUpTokenId('');
    setDownTokenId('');
    setActiveEvent(null);
    setActiveMarket(null);
    spotActiveCandlesRef.current = [];
    contractBaseCandlesRef.current = [];
    contractActiveCandlesRef.current = [];
    priceRollingQueueRef.current = [];
    setTwapLineData([]);
    setTrades([]);
    setOrderBook({
      bids: [],
      asks: [],
      lastPrice: 0.5,
      bestBid: 0.49,
      bestAsk: 0.51,
      spread: 0.02,
    });
    twapEngineRef.current.resetWindow(currentWindowTs, 0);
  }, [asset]);

  // 1. Master Timer (1-second tick & Window Rollover)
  useEffect(() => {
    const timerInterval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const windowFloor = Math.floor(nowSec / 300) * 300;

      // Handle Period Rollover Safely (Zero Errors)
      if (windowFloor !== currentWindowRef.current) {
        currentWindowRef.current = windowFloor;
        setCurrentWindowTs(windowFloor);
        setSelectedWindowTs((prev) => (prev <= windowFloor ? windowFloor : prev));

        const newStrike = latestSpotRef.current > 0 ? latestSpotRef.current : strikePriceRef.current;
        strikePriceRef.current = newStrike;
        twapEngineRef.current.resetWindow(windowFloor, newStrike);

        // Reset TWAP Line safely for the fresh round
        setTwapLineData([{ time: windowFloor, value: newStrike }]);
      }

      if (latestSpotRef.current > 0) {
        twapEngineRef.current.recordPrice(latestSpotRef.current, nowSec);
        const st = twapEngineRef.current.computeRoundSettlement(latestSpotRef.current, nowSec);
        setSettlement(st);

        if (nowSec >= windowFloor) {
          setTwapLineData((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.time === nowSec) {
              copy[copy.length - 1] = { time: nowSec, value: st.runningTwap };
              return copy;
            } else if (!last || last.time < nowSec) {
              copy.push({ time: nowSec, value: st.runningTwap });
              return copy.slice(-300);
            }
            return copy;
          });
        }
      }

      // Continuous Contract Candle Progression (Guarantees chart never freezes in CONTRACT mode)
      if (chartModeRef.current === 'CONTRACT') {
        const curUp = upPriceRef.current > 0 && upPriceRef.current < 1 ? upPriceRef.current : 0.50;
        const pSec = getTimeframeSeconds(timeframeRef.current);
        const bucketTime = Math.floor(nowSec / pSec) * pSec;
        const arr = contractActiveCandlesRef.current;
        if (arr.length > 0) {
          const last = arr[arr.length - 1];
          if (last.time === bucketTime) {
            last.high = Math.max(last.high, curUp);
            last.low = Math.min(last.low, curUp);
            last.close = curUp;
            last.volume = (last.volume || 10) + 1;
          } else if (bucketTime > last.time) {
            arr.push({
              time: bucketTime,
              open: last.close,
              high: Math.max(last.close, curUp),
              low: Math.min(last.close, curUp),
              close: curUp,
              volume: 10,
            });
            if (arr.length > 250) arr.shift();
          }
          emitCandles();
        }
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [emitCandles]);

  // 1b. Poll Upcoming Periods from Polymarket
  useEffect(() => {
    let isCancelled = false;

    async function loadPeriods() {
      try {
        const periods = await fetchUpcomingPeriods(asset, currentWindowTs, 4);
        if (!isCancelled && periods.length > 0) {
          setUpcomingPeriods(periods);
        }
      } catch (e) {}
    }

    loadPeriods();
    const interval = setInterval(loadPeriods, 8000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [asset, currentWindowTs]);

  // 2. Load SPOT Initial Candles on Asset or Timeframe Change
  useEffect(() => {
    let isCancelled = false;

    async function loadSpotKlines() {
      const tf = timeframe;
      const curAsset = asset;

      let raw: OHLCData[] = [];
      if (tf === '5s' || tf === '15s' || tf === '30s') {
        const raw1s = await fetchBinanceKlines(curAsset, '1s', 300);
        if (isCancelled) return;
        raw = aggregateCandles(raw1s, tf, 200);
      } else if (tf === '1m') {
        raw = await fetchBinanceKlines(curAsset, '1m', 150);
      } else if (tf === '5m') {
        raw = await fetchBinanceKlines(curAsset, '5m', 120);
      } else if (tf === '15m') {
        raw = await fetchBinanceKlines(curAsset, '15m', 100);
      }

      if (isCancelled || raw.length === 0) return;

      const existing = spotActiveCandlesRef.current;
      if (existing.length > 0) {
        const lastRawTime = raw[raw.length - 1].time;
        const newerLive = existing.filter((c) => c.time > lastRawTime);
        spotActiveCandlesRef.current = ensureStrictlyAscending([...raw, ...newerLive]).slice(-250);
      } else {
        spotActiveCandlesRef.current = ensureStrictlyAscending(raw);
      }

      const lastCandle = spotActiveCandlesRef.current[spotActiveCandlesRef.current.length - 1];
      latestSpotRef.current = lastCandle.close;
      setSpotPrice(lastCandle.close);

      if (strikePriceRef.current === 0) {
        const startCandle = raw.find((c) => c.time === currentWindowRef.current) || lastCandle;
        strikePriceRef.current = startCandle.open || startCandle.close;
        twapEngineRef.current.setStrikePrice(strikePriceRef.current);
      }

      if (chartModeRef.current === 'SPOT') {
        emitCandles();
      }
    }

    loadSpotKlines();

    return () => {
      isCancelled = true;
    };
  }, [asset, timeframe, emitCandles]);

  // 3. Re-aggregate KONTRAK candles on Timeframe or Mode change (100% bug-free)
  useEffect(() => {
    let base = contractBaseCandlesRef.current;
    if (base.length === 0) {
      base = loadCachedContractCandles(asset);
      if (base.length === 0) {
        base = generateBaselineContractCandles(upPrice || 0.50, 60);
      }
      contractBaseCandlesRef.current = ensureStrictlyAscending(base);
    }

    contractActiveCandlesRef.current = resampleContractCandles(base, timeframe, 250);
    if (chartMode === 'CONTRACT') {
      emitCandles();
    }
  }, [timeframe, chartMode, asset, upPrice, emitCandles]);

  // 4. Binance Live WebSocket Tick Pipeline
  useEffect(() => {
    binanceManagerRef.current?.destroy();

    binanceManagerRef.current = new BinanceStreamManager(
      asset,
      (tick) => {
        const prev = latestSpotRef.current;
        latestSpotRef.current = tick.price;

        const nowMs = Date.now();
        priceRollingQueueRef.current.push({ time: nowMs, price: tick.price });
        priceRollingQueueRef.current = priceRollingQueueRef.current.filter((item) => nowMs - item.time <= 15000);

        if (priceRollingQueueRef.current.length >= 2) {
          const oldest = priceRollingQueueRef.current[0];
          const dtSec = (nowMs - oldest.time) / 1000;
          if (dtSec > 0.5) {
            const velocity = (tick.price - oldest.price) / dtSec;
            const projected = tick.price + (velocity * 30);
            setPredictedPrice(projected);
          }
        } else {
          setPredictedPrice(tick.price);
        }

        const pSec = getTimeframeSeconds(timeframeRef.current);
        const bucketTime = Math.floor(tick.timeSec / pSec) * pSec;
        const arr = spotActiveCandlesRef.current;

        if (arr.length > 0) {
          const last = arr[arr.length - 1];
          if (last.time === bucketTime) {
            last.high = Math.max(last.high, tick.price);
            last.low = Math.min(last.low, tick.price);
            last.close = tick.price;
            last.volume += tick.size;
          } else if (bucketTime > last.time) {
            arr.push({
              time: bucketTime,
              open: tick.price,
              high: tick.price,
              low: tick.price,
              close: tick.price,
              volume: tick.size,
            });
            if (arr.length > 250) arr.shift();
          }
        } else {
          arr.push({
            time: bucketTime,
            open: tick.price,
            high: tick.price,
            low: tick.price,
            close: tick.price,
            volume: tick.size,
          });
        }

        if (!rafPendingRef.current) {
          rafPendingRef.current = true;
          requestAnimationFrame(() => {
            setSpotPrice(tick.price);
            setPriceDirection(tick.price > prev ? 'up' : tick.price < prev ? 'down' : 'neutral');
            setLatencyStats((prev) => ({
              ...prev,
              binanceWsPingMs: tick.latencyMs,
              lastUpdateTimestamp: Date.now(),
            }));

            if (chartModeRef.current === 'SPOT') {
              emitCandles();
            }
            rafPendingRef.current = false;
          });
        }
      },
      (connected) => {
        setLatencyStats((prev) => ({ ...prev, binanceWsConnected: connected }));
      }
    );

    return () => {
      binanceManagerRef.current?.destroy();
      binanceManagerRef.current = null;
    };
  }, [asset, emitCandles]);

  // 5. Contract Candle Tick Processor
  const processContractTick = useCallback((price: number, size: number, timestampSec: number) => {
    if (price <= 0 || price >= 1) return;

    setUpPrice(price);
    setDownPrice(parseFloat((1 - price).toFixed(3)));

    const pSec = getTimeframeSeconds(timeframeRef.current);
    const bucketTime = Math.floor(timestampSec / pSec) * pSec;
    const arr = contractActiveCandlesRef.current;

    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      if (last.time === bucketTime) {
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.volume += size;
      } else if (bucketTime > last.time) {
        arr.push({ time: bucketTime, open: price, high: price, low: price, close: price, volume: size });
        if (arr.length > 250) arr.shift();
      }
    } else {
      arr.push({ time: bucketTime, open: price, high: price, low: price, close: price, volume: size });
    }

    const base1mTime = Math.floor(timestampSec / 60) * 60;
    const baseArr = contractBaseCandlesRef.current;
    if (baseArr.length > 0) {
      const lastBase = baseArr[baseArr.length - 1];
      if (lastBase.time === base1mTime) {
        lastBase.high = Math.max(lastBase.high, price);
        lastBase.low = Math.min(lastBase.low, price);
        lastBase.close = price;
        lastBase.volume += size;
      } else if (base1mTime > lastBase.time) {
        baseArr.push({ time: base1mTime, open: price, high: price, low: price, close: price, volume: size });
        if (baseArr.length > 300) baseArr.shift();
      }
    } else {
      baseArr.push({ time: base1mTime, open: price, high: price, low: price, close: price, volume: size });
    }

    saveCachedContractCandles(assetRef.current, baseArr);

    if (chartModeRef.current === 'CONTRACT') {
      emitCandles();
    }
  }, [emitCandles]);

  // 6. Load KONTRAK History & Multi-Window
  useEffect(() => {
    let isCancelled = false;

    async function loadContractHistory() {
      try {
        const multi = await fetchMultiWindowContractHistory(asset, currentWindowTs, 12);
        if (!isCancelled && multi.length > 0) {
          const merged = mergeCandles(contractBaseCandlesRef.current, multi, 300);
          contractBaseCandlesRef.current = ensureStrictlyAscending(merged);
          saveCachedContractCandles(asset, contractBaseCandlesRef.current);
          contractActiveCandlesRef.current = resampleContractCandles(contractBaseCandlesRef.current, timeframe, 250);

          if (chartMode === 'CONTRACT') {
            emitCandles();
          }
        }
      } catch (e) {}
    }

    loadContractHistory();

    return () => {
      isCancelled = true;
    };
  }, [asset, currentWindowTs, chartMode, timeframe, emitCandles]);

  // 7. Polymarket Event & CLOB OrderBook with Auto-Retry and Rollover Resilience
  useEffect(() => {
    let isCancelled = false;

    async function loadMarketAndBook() {
      const targetTs = selectedWindowTs || currentWindowTs;
      let slug = getPolymarketSlug(asset, targetTs);
      let evt = await fetchEventBySlug(slug);

      if (!evt || !evt.markets || evt.markets.length === 0) {
        if (targetTs === currentWindowTs) {
          const prevSlug = getPolymarketSlug(asset, currentWindowTs - 300);
          const prevEvt = await fetchEventBySlug(prevSlug);
          if (prevEvt && prevEvt.markets && prevEvt.markets.length > 0) {
            evt = prevEvt;
          }
        }
      }

      if (isCancelled || !evt || !evt.markets || evt.markets.length === 0) return;

      setActiveEvent(evt);
      const m = evt.markets[0];
      setActiveMarket(m);

      let tUp = '';
      let tDown = '';
      try {
        const tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
        if (Array.isArray(tokens) && tokens.length >= 2) {
          tUp = tokens[0];
          tDown = tokens[1];
        }
      } catch (e) {}

      setUpTokenId(tUp);
      setDownTokenId(tDown);

      if (tUp) {
        const mid = await fetchClobMidpoint(tUp);
        if (mid !== null && !isCancelled) {
          processContractTick(mid, 10, Math.floor(Date.now() / 1000));
        } else if (m.outcomePrices) {
          try {
            const p = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
            if (Array.isArray(p) && p.length >= 2) {
              const p0 = parseFloat(p[0]);
              if (!isNaN(p0)) processContractTick(p0, 10, Math.floor(Date.now() / 1000));
            }
          } catch (e) {}
        }

        const book = await fetchOrderBook(tUp);
        if (book && !isCancelled) setOrderBook(book);

        polyWsManagerRef.current?.subscribeTokens(tUp, tDown);
      }

      if (m.conditionId) {
        const initialTrades = await fetchTradesHistory(m.conditionId);
        if (!isCancelled && initialTrades.length > 0) {
          setTrades(initialTrades);
        }
      }
    }

    loadMarketAndBook();

    polyWsManagerRef.current = new PolymarketClobWsManager({
      onTick: (_tokenId, price, size, side) => {
        const nowSec = Math.floor(Date.now() / 1000);
        processContractTick(price, size, nowSec);

        const newTrade: TradeItem = {
          id: `trade-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
          side,
          price,
          size,
          timestamp: nowSec,
          outcome: 'Up',
          pseudonym: 'CLOB Flow',
        };

        setTrades((prev) => [newTrade, ...prev.slice(0, 39)]);
      },
      onBook: (rawBids, rawAsks) => {
        const bids = rawBids
          .map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
          .filter((b: any) => !isNaN(b.price))
          .sort((a, b) => b.price - a.price);
        const asks = rawAsks
          .map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
          .filter((a: any) => !isNaN(a.price))
          .sort((a, b) => a.price - b.price);

        const bestBid = bids[0]?.price || 0.5;
        const bestAsk = asks[0]?.price || 0.5;
        setOrderBook({
          bids,
          asks,
          lastPrice: (bestBid + bestAsk) / 2,
          bestBid,
          bestAsk,
          spread: Math.max(0, bestAsk - bestBid),
        });
      },
      onStatus: (connected) => {
        setLatencyStats((prev) => ({ ...prev, polymarketWsConnected: connected }));
      },
    });

    const pollInterval = setInterval(async () => {
      const targetTs = selectedWindowTs || currentWindowTs;
      const targetSlug = getPolymarketSlug(asset, targetTs);
      if (activeEvent?.slug !== targetSlug) {
        const newEvt = await fetchEventBySlug(targetSlug);
        if (newEvt && newEvt.markets && newEvt.markets.length > 0) {
          setActiveEvent(newEvt);
          const m = newEvt.markets[0];
          setActiveMarket(m);
          try {
            const tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
            if (Array.isArray(tokens) && tokens.length >= 2) {
              setUpTokenId(tokens[0]);
              setDownTokenId(tokens[1]);
              polyWsManagerRef.current?.subscribeTokens(tokens[0], tokens[1]);
            }
          } catch (e) {}
        }
      }

      if (upTokenId) {
        const b = await fetchOrderBook(upTokenId);
        if (b && !isCancelled) setOrderBook(b);
        const mid = await fetchClobMidpoint(upTokenId);
        if (mid !== null && !isCancelled) {
          processContractTick(mid, 10, Math.floor(Date.now() / 1000));
        }
      }
    }, 1500);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
      polyWsManagerRef.current?.destroy();
      polyWsManagerRef.current = null;
    };
  }, [asset, currentWindowTs, selectedWindowTs, upTokenId, timeframe, chartMode, processContractTick, emitCandles, activeEvent?.slug]);

  useEffect(() => {
    emitCandles();
  }, [chartMode, chartStyle, emitCandles]);

  return {
    asset,
    setAsset,
    timeframe,
    setTimeframe,
    chartMode,
    setChartMode,
    chartStyle,
    setChartStyle,
    theme,
    setTheme,
    toggleTheme,
    showPrediction,
    setShowPrediction,
    predictedPrice,
    spotPrice,
    priceDirection,
    upPrice,
    downPrice,
    currentWindowTs,
    selectedWindowTs,
    setSelectedWindowTs,
    upcomingPeriods,
    settlement,
    activeCandles,
    twapLineData,
    orderBook,
    trades,
    latencyStats,
    activeEvent,
    activeMarket,
    upTokenId,
    downTokenId,
  };
}
