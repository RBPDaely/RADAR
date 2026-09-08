import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  LineSeries,
  IPriceLine,
} from 'lightweight-charts';
import { OHLCData, TimeFrame, ChartMode, ChartStyle, ThemeMode, RoundSettlementState } from '../types/market';
import { ensureStrictlyAscending } from '../services/twapEngine';
import {
  Maximize2,
  Minimize2,
  BarChart2,
  Activity,
  Layers,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface ProTradingChartProps {
  data: OHLCData[];
  twapData?: Array<{ time: number; value: number }>;
  timeframe: TimeFrame;
  setTimeframe: (tf: TimeFrame) => void;
  chartMode: ChartMode;
  setChartMode: (cm: ChartMode) => void;
  chartStyle: ChartStyle;
  setChartStyle: (cs: ChartStyle) => void;
  theme: ThemeMode;
  lastPrice: number;
  strikePrice: number;
  runningTwap?: number;
  showPrediction: boolean;
  setShowPrediction: (sp: boolean) => void;
  predictedPrice: number;
  assetName: string;
  upPrice: number;
  downPrice: number;
  settlement: RoundSettlementState;
}

export const ProTradingChart: React.FC<ProTradingChartProps> = ({
  data,
  twapData = [],
  timeframe,
  setTimeframe,
  chartMode,
  setChartMode,
  chartStyle,
  setChartStyle,
  theme,
  lastPrice,
  strikePrice,
  runningTwap,
  showPrediction,
  setShowPrediction,
  predictedPrice,
  assetName,
  upPrice,
  downPrice,
  settlement,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Series refs
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const twapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const strikeLineRef = useRef<IPriceLine | null>(null);
  const predictionLineRef = useRef<IPriceLine | null>(null);

  // State tracking refs to prevent backwards jump or disappearing bars
  const prevTimeframeRef = useRef<TimeFrame>(timeframe);
  const prevModeRef = useRef<ChartMode>(chartMode);
  const prevStyleRef = useRef<ChartStyle>(chartStyle);
  const prevAssetRef = useRef<string>(assetName);
  const isInitializedRef = useRef<boolean>(false);

  // Hover state for interactive legend
  const [hoveredCandle, setHoveredCandle] = useState<OHLCData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTwapLine, setShowTwapLine] = useState<boolean>(true);
  const [showStrike, setShowStrike] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);

  // Manual Volume Scaling State (5% to 60% of chart height)
  const [volScalePct, setVolScalePct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('chart_vol_scale');
      return saved ? parseInt(saved, 10) : 20;
    } catch (e) {
      return 20;
    }
  });

  const updateVolScale = (newScale: number) => {
    const clamped = Math.max(5, Math.min(60, newScale));
    setVolScalePct(clamped);
    try {
      localStorage.setItem('chart_vol_scale', clamped.toString());
    } catch (e) {}
  };

  // Real-time tick change flash tracking for UP/DOWN values
  const validUpPrice = Math.max(0.01, Math.min(0.99, isNaN(upPrice) ? 0.50 : upPrice));
  const validDownPrice = Math.max(0.01, Math.min(0.99, isNaN(downPrice) ? 0.50 : downPrice));
  const upCents = (validUpPrice * 100).toFixed(1);
  const downCents = (validDownPrice * 100).toFixed(1);
  const upRoi = ((1 / validUpPrice) - 1) * 100;
  const downRoi = ((1 / validDownPrice) - 1) * 100;

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
  const { isUpWinning } = settlement;

  const TIMEFRAMES: Array<{ id: TimeFrame; label: string }> = [
    { id: '5s', label: '5s' },
    { id: '15s', label: '15s' },
    { id: '30s', label: '30s' },
    { id: '1m', label: '1m' },
    { id: '5m', label: '5m' },
    { id: '15m', label: '15m' },
  ];

  const isDark = theme === 'dark';

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isSpot = chartMode === 'SPOT';

    const bg = isDark ? '#131722' : '#ffffff';
    const gridColor = isDark ? '#1e222d' : '#edf0f4';
    const textColor = isDark ? '#d1d4dc' : '#474d57';
    const borderColor = isDark ? '#2a2e39' : '#dbe0e7';

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 800,
      height: chartContainerRef.current.clientHeight || 450,
      layout: {
        background: { color: bg },
        textColor: textColor,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: isDark ? '#758696' : '#959dad',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#2a2e39' : '#dcdfe6',
        },
        horzLine: {
          color: isDark ? '#758696' : '#959dad',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#2a2e39' : '#dcdfe6',
        },
      },
      rightPriceScale: {
        borderColor: borderColor,
        autoScale: true,
        borderVisible: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.2,
        },
        alignLabels: true,
      },
      timeScale: {
        borderColor: borderColor,
        timeVisible: true,
        secondsVisible: timeframe === '5s' || timeframe === '15s' || timeframe === '30s',
        borderVisible: true,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 2,
      },
    });

    // Add Volume Histogram Series
    const topMargin = Math.max(0.4, 1 - (volScalePct / 100));
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: isDark ? '#2a2e39' : '#cbd5e1',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: topMargin,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Price Format configuration
    const priceFormatConfig: any = isSpot
      ? { type: 'price', precision: 2, minMove: 0.01 }
      : {
          type: 'custom',
          formatter: (price: number) => `${(price * 100).toFixed(1)}¢`,
        };

    // Add Main Price Series
    if (chartStyle === 'area') {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: isSpot ? 'rgba(240, 185, 11, 0.3)' : 'rgba(8, 153, 129, 0.3)',
        bottomColor: 'rgba(240, 185, 11, 0.0)',
        lineColor: isSpot ? '#f0b90b' : '#089981',
        lineWidth: 2,
        priceFormat: priceFormatConfig,
      });
      areaSeriesRef.current = areaSeries;
      candleSeriesRef.current = null;
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        priceFormat: priceFormatConfig,
      });
      candleSeriesRef.current = candleSeries;
      areaSeriesRef.current = null;
    }

    // Add TWAP Series (Only active in SPOT mode)
    const twapSeries = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 2,
      lineStyle: 0,
      priceScaleId: 'right',
      title: 'TWAP',
      priceFormat: priceFormatConfig,
    });
    twapSeriesRef.current = twapSeries;

    chartRef.current = chart;
    isInitializedRef.current = false;
    strikeLineRef.current = null;
    predictionLineRef.current = null;

    // Crosshair listener
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        setHoveredCandle(null);
      } else {
        const activeSeries = candleSeriesRef.current || areaSeriesRef.current;
        if (activeSeries) {
          const bar = param.seriesData.get(activeSeries) as any;
          if (bar) {
            setHoveredCandle({
              time: Number(param.time),
              open: bar.open ?? bar.value,
              high: bar.high ?? bar.value,
              low: bar.low ?? bar.value,
              close: bar.close ?? bar.value,
              volume: 0,
            });
          }
        }
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
      twapSeriesRef.current = null;
      strikeLineRef.current = null;
      predictionLineRef.current = null;
      isInitializedRef.current = false;
    };
  }, [chartMode, chartStyle, theme, isDark]);

  // Volume scale update
  useEffect(() => {
    if (chartRef.current) {
      const topMargin = Math.max(0.4, 1 - (volScalePct / 100));
      chartRef.current.priceScale('volume').applyOptions({
        scaleMargins: {
          top: topMargin,
          bottom: 0,
        },
      });
    }
  }, [volScalePct]);

  // 2. High-Precision Continuous Data Updates (100% Assertion-Safe)
  useEffect(() => {
    if (!data || data.length === 0) return;

    const modeChanged = prevModeRef.current !== chartMode;
    const timeframeChanged = prevTimeframeRef.current !== timeframe;
    const styleChanged = prevStyleRef.current !== chartStyle;
    const assetChanged = prevAssetRef.current !== assetName;

    const mustFullReset =
      !isInitializedRef.current ||
      modeChanged ||
      timeframeChanged ||
      styleChanged ||
      assetChanged;

    prevModeRef.current = chartMode;
    prevTimeframeRef.current = timeframe;
    prevStyleRef.current = chartStyle;
    prevAssetRef.current = assetName;

    const cleanData = ensureStrictlyAscending(data);
    if (cleanData.length === 0) return;

    // Update Candles Series
    if (candleSeriesRef.current) {
      const formatted = cleanData.map((d) => ({
        time: Math.floor(d.time) as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      if (mustFullReset) {
        candleSeriesRef.current.setData(formatted);
        chartRef.current?.timeScale().fitContent();
        isInitializedRef.current = true;
      } else {
        const last = formatted[formatted.length - 1];
        try {
          candleSeriesRef.current.update(last);
        } catch (e) {
          candleSeriesRef.current.setData(formatted);
        }
      }
    }

    // Update Area Series
    if (areaSeriesRef.current) {
      const formatted = cleanData.map((d) => ({
        time: Math.floor(d.time) as any,
        value: d.close,
      }));

      if (mustFullReset) {
        areaSeriesRef.current.setData(formatted);
        chartRef.current?.timeScale().fitContent();
        isInitializedRef.current = true;
      } else {
        const last = formatted[formatted.length - 1];
        try {
          areaSeriesRef.current.update(last);
        } catch (e) {
          areaSeriesRef.current.setData(formatted);
        }
      }
    }

    // Update Volume Series
    if (volumeSeriesRef.current && showVolume) {
      const volFormatted = cleanData.map((d) => ({
        time: Math.floor(d.time) as any,
        value: d.volume || 10,
        color: d.close >= d.open ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)',
      }));

      if (mustFullReset) {
        volumeSeriesRef.current.setData(volFormatted);
      } else {
        const last = volFormatted[volFormatted.length - 1];
        try {
          volumeSeriesRef.current.update(last);
        } catch (e) {
          volumeSeriesRef.current.setData(volFormatted);
        }
      }
    }

    // Update TWAP Series (Only in SPOT mode)
    if (twapSeriesRef.current) {
      if (showTwapLine && twapData.length > 0 && chartMode === 'SPOT') {
        const formattedTwap = twapData
          .filter((pt) => pt.value > 0)
          .map((pt) => ({
            time: Math.floor(pt.time) as any,
            value: pt.value,
          }));
        twapSeriesRef.current.setData(formattedTwap);
      } else {
        twapSeriesRef.current.setData([]);
      }
    }

    const targetSeries = candleSeriesRef.current || areaSeriesRef.current;

    // Optimized Strike Price Line (Mutation via applyOptions, ZERO re-creation thrashing)
    if (targetSeries) {
      if (showStrike) {
        const isSpot = chartMode === 'SPOT';
        const targetPrice = isSpot ? strikePrice : 0.50;
        const titleText = isSpot && strikePrice > 0
          ? `STRIKE $${strikePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : 'PARITAS 50.0¢';

        if (targetPrice > 0) {
          if (strikeLineRef.current) {
            strikeLineRef.current.applyOptions({
              price: targetPrice,
              title: titleText,
            });
          } else {
            strikeLineRef.current = targetSeries.createPriceLine({
              price: targetPrice,
              color: '#f0b90b',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: titleText,
            });
          }
        }
      } else if (strikeLineRef.current) {
        targetSeries.removePriceLine(strikeLineRef.current);
        strikeLineRef.current = null;
      }
    }

    // Optimized 30s Prediction Line (Mutation via applyOptions)
    if (targetSeries) {
      if (showPrediction && predictedPrice > 0) {
        const isSpot = chartMode === 'SPOT';
        const titleText = isSpot
          ? `PROYEKSI $${predictedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `PROYEKSI ${(predictedPrice * 100).toFixed(1)}¢`;

        if (predictionLineRef.current) {
          predictionLineRef.current.applyOptions({
            price: predictedPrice,
            title: titleText,
          });
        } else {
          predictionLineRef.current = targetSeries.createPriceLine({
            price: predictedPrice,
            color: '#38bdf8',
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: false,
            title: titleText,
          });
        }
      } else if (predictionLineRef.current) {
        targetSeries.removePriceLine(predictionLineRef.current);
        predictionLineRef.current = null;
      }
    }
  }, [
    data,
    twapData,
    chartMode,
    timeframe,
    chartStyle,
    assetName,
    strikePrice,
    showTwapLine,
    showStrike,
    showVolume,
    showPrediction,
    predictedPrice,
  ]);

  const toggleFullscreen = () => {
    if (!chartWrapperRef.current) return;
    if (!document.fullscreenElement) {
      chartWrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const activeCandle = hoveredCandle || (data.length > 0 ? data[data.length - 1] : null);
  const isUpFromOpen = activeCandle ? activeCandle.close >= activeCandle.open : true;
  const candleChange = activeCandle ? activeCandle.close - activeCandle.open : 0;
  const candleChangePct = activeCandle && activeCandle.open > 0 ? (candleChange / activeCandle.open) * 100 : 0;

  const isSpotMode = chartMode === 'SPOT';
  const effectiveBenchmark = isSpotMode ? strikePrice : 0.50;
  const deltaFromBenchmark = activeCandle && effectiveBenchmark > 0 ? activeCandle.close - effectiveBenchmark : 0;
  const isAboveBenchmark = deltaFromBenchmark >= 0;

  return (
    <div
      ref={chartWrapperRef}
      className={`relative w-full h-full flex flex-col rounded-xl overflow-hidden shadow-2xl transition-colors ${
        isDark ? 'bg-[#131722] border border-[#2a2e39]' : 'bg-white border border-[#dbe0e7]'
      } ${isFullscreen ? 'p-2' : ''}`}
    >
      {/* 1. TOP TOOLBAR: Timeframe, Mode, Style, Feature Toggles, Manual Volume Scale */}
      <div
        className={`flex flex-wrap items-center justify-between px-2.5 py-1.5 border-b gap-1.5 z-10 select-none flex-shrink-0 ${
          isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-[#fafafa] border-[#eaecef]'
        }`}
      >
        {/* Left: Timeframe Switcher */}
        <div
          className={`flex items-center space-x-1 p-0.5 rounded-lg border ${
            isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
          }`}
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-2.5 py-0.5 text-xs font-mono font-black rounded transition-all ${
                timeframe === tf.id
                  ? 'bg-[#f0b90b] text-slate-950 font-black shadow-sm'
                  : isDark
                  ? 'text-[#787b86] hover:text-[#d1d4dc]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Center: Mode & Style Switcher */}
        <div className="flex items-center space-x-1.5">
          {/* Mode Switcher */}
          <div
            className={`flex items-center p-0.5 rounded-lg border text-xs font-mono ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <button
              onClick={() => setChartMode('SPOT')}
              className={`px-3 py-0.5 rounded transition-colors font-black ${
                chartMode === 'SPOT'
                  ? 'bg-[#f0b90b] text-slate-950 shadow-sm'
                  : isDark
                  ? 'text-[#787b86] hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              SPOT ($)
            </button>
            <button
              onClick={() => setChartMode('CONTRACT')}
              className={`px-3 py-0.5 rounded transition-colors font-black ${
                chartMode === 'CONTRACT'
                  ? 'bg-[#089981] text-white shadow-sm'
                  : isDark
                  ? 'text-[#787b86] hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              KONTRAK (¢)
            </button>
          </div>

          {/* Style Switcher */}
          <div
            className={`hidden sm:flex items-center p-0.5 rounded-lg border text-xs font-mono ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <button
              onClick={() => setChartStyle('candles')}
              className={`p-1 rounded transition-colors ${
                chartStyle === 'candles'
                  ? 'bg-[#f0b90b] text-slate-950 font-bold'
                  : isDark
                  ? 'text-[#787b86] hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
              title="Candlestick Chart"
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartStyle('heikin-ashi')}
              className={`p-1 rounded transition-colors ${
                chartStyle === 'heikin-ashi'
                  ? 'bg-[#f0b90b] text-slate-950 font-bold'
                  : isDark
                  ? 'text-[#787b86] hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
              title="Heikin Ashi Chart"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartStyle('area')}
              className={`p-1 rounded transition-colors ${
                chartStyle === 'area'
                  ? 'bg-[#f0b90b] text-slate-950 font-bold'
                  : isDark
                  ? 'text-[#787b86] hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
              title="Area Line Chart"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Feature Toggles & Manual Volume Scale */}
        <div className="flex items-center space-x-1">
          {/* Proyeksi 30s Toggle */}
          <button
            onClick={() => setShowPrediction(!showPrediction)}
            className={`flex items-center space-x-1 px-2.5 py-0.5 text-xs font-mono font-black rounded border transition-all ${
              showPrediction
                ? 'bg-[#f0b90b]/20 text-[#f0b90b] border-[#f0b90b]/60 shadow-sm'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
                : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-800'
            }`}
            title="Garis Proyeksi 30 Detik (Biru Langit)"
          >
            <Zap className={`w-3 h-3 ${showPrediction ? 'animate-pulse text-[#f0b90b]' : ''}`} />
            <span>PROYEKSI: {showPrediction ? 'ON' : 'OFF'}</span>
          </button>

          {/* TWAP Toggle (Only in SPOT mode) */}
          {chartMode === 'SPOT' && (
            <button
              onClick={() => setShowTwapLine(!showTwapLine)}
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
                showTwapLine
                  ? 'bg-[#a855f7]/20 border-[#a855f7]/60 text-[#c084fc]'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86]'
                  : 'bg-slate-100 border-slate-300 text-slate-500'
              }`}
              title="Chainlink TWAP Line"
            >
              TWAP
            </button>
          )}

          {/* Strike Toggle */}
          <button
            onClick={() => setShowStrike(!showStrike)}
            className={`hidden sm:inline px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
              showStrike
                ? 'bg-[#f0b90b]/20 border-[#f0b90b]/60 text-[#f0b90b]'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86]'
                : 'bg-slate-100 border-slate-300 text-slate-500'
            }`}
            title="Strike Benchmark Line"
          >
            STRIKE
          </button>

          {/* Volume Toggle & Manual Scaler */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
                showVolume
                  ? 'bg-[#2a2e39] border-[#3e4652] text-slate-200'
                  : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86]'
                  : 'bg-slate-100 border-slate-300 text-slate-500'
              }`}
              title="Toggle Volume Histogram"
            >
              VOL
            </button>

            {showVolume && (
              <div
                className={`flex items-center space-x-0.5 px-1 py-0.5 rounded border text-[10px] font-mono ${
                  isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
                }`}
                title="Skala Manual Tinggi Histogram Volume"
              >
                <button
                  onClick={() => updateVolScale(volScalePct - 5)}
                  className="px-1 text-[#787b86] hover:text-[#f0b90b] font-black hover:bg-[#2a2e39] rounded transition-colors"
                >
                  -
                </button>
                <span className="text-[#f0b90b] font-bold px-0.5 min-w-[26px] text-center">
                  {volScalePct}%
                </span>
                <button
                  onClick={() => updateVolScale(volScalePct + 5)}
                  className="px-1 text-[#787b86] hover:text-[#f0b90b] font-black hover:bg-[#2a2e39] rounded transition-colors"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className={`p-1 border rounded transition-colors ${
              isDark
                ? 'bg-[#1e222d] hover:bg-[#2a2e39] border-[#2a2e39] text-[#d1d4dc]'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
            }`}
            title="Layar Penuh"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 2. FLOATING HUD DI DALAM CHART: KOTAK UP & DOWN */}
      <div className="w-full px-2 pt-1.5 pb-1 flex justify-center z-20 flex-shrink-0">
        <div
          className={`w-full max-w-4xl rounded-xl border p-1.5 shadow-xl backdrop-blur-md transition-all ${
            isDark ? 'bg-[#131722]/90 border-[#2a2e39]' : 'bg-white/95 border-[#dbe0e7]'
          }`}
        >
          <div className="grid grid-cols-2 gap-1.5 items-stretch">
            {/* UP CARD */}
            <div
              className={`relative overflow-hidden rounded-lg px-2.5 py-1.5 border transition-all duration-300 flex items-center justify-between ${
                isUpWinning
                  ? isDark
                    ? 'bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-[#089981]/30 via-[#0d2b20] to-[#131722] border-[#089981] shadow-[0_0_20px_rgba(8,153,129,0.4)] ring-1 ring-[#089981]'
                    : 'bg-emerald-50 border-[#089981] shadow-md ring-1 ring-[#089981]'
                  : isDark
                  ? 'bg-[#1e222d]/60 border-[#2a2e39]'
                  : 'bg-white border-slate-200'
              } ${upFlash ? 'scale-[1.01] brightness-125' : ''}`}
            >
              <div className="flex flex-col justify-center relative z-10">
                <div className="flex items-center space-x-1">
                  <div className="p-0.5 rounded bg-[#089981]/20 text-[#089981]">
                    <ArrowUpRight className="w-3 h-3 font-black" />
                  </div>
                  <span className="text-[10px] font-mono font-black uppercase text-[#089981]">
                    UP (NAIK)
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 text-[9px] font-mono text-[#787b86]">
                  <span>ROI:</span>
                  <span className="font-black text-[#089981]">+{upRoi.toFixed(0)}%</span>
                  <span className="hidden sm:inline">(${validUpPrice.toFixed(3)})</span>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 relative z-10 pl-2">
                {isUpWinning && (
                  <span className="hidden sm:flex items-center space-x-0.5 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-black bg-[#089981] text-slate-950 uppercase tracking-wider animate-pulse shadow-[0_0_8px_#089981]">
                    <TrendingUp className="w-2.5 h-2.5" />
                    <span>LEAD</span>
                  </span>
                )}
                <div
                  className={`text-2xl sm:text-3xl font-mono font-black tracking-tight text-[#089981] transition-all duration-200 ${
                    isUpWinning
                      ? 'drop-shadow-[0_0_15px_rgba(8,153,129,0.9)]'
                      : 'drop-shadow-[0_0_6px_rgba(8,153,129,0.4)]'
                  } ${upFlash === 'up' ? 'text-[#00ff88] drop-shadow-[0_0_25px_#00ff88]' : ''}`}
                >
                  {upCents}¢
                </div>
              </div>
            </div>

            {/* DOWN CARD */}
            <div
              className={`relative overflow-hidden rounded-lg px-2.5 py-1.5 border transition-all duration-300 flex items-center justify-between ${
                !isUpWinning
                  ? isDark
                    ? 'bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-[#f23645]/30 via-[#2e1219] to-[#131722] border-[#f23645] shadow-[0_0_20px_rgba(242,54,69,0.4)] ring-1 ring-[#f23645]'
                    : 'bg-rose-50 border-[#f23645] shadow-md ring-1 ring-[#f23645]'
                  : isDark
                  ? 'bg-[#1e222d]/60 border-[#2a2e39]'
                  : 'bg-white border-slate-200'
              } ${downFlash ? 'scale-[1.01] brightness-125' : ''}`}
            >
              <div className="flex items-center space-x-1.5 relative z-10 pr-2">
                <div
                  className={`text-2xl sm:text-3xl font-mono font-black tracking-tight text-[#f23645] transition-all duration-200 ${
                    !isUpWinning
                      ? 'drop-shadow-[0_0_15px_rgba(242,54,69,0.9)]'
                      : 'drop-shadow-[0_0_6px_rgba(242,54,69,0.4)]'
                  } ${downFlash === 'up' ? 'text-[#ff3b69] drop-shadow-[0_0_25px_#ff3b69]' : ''}`}
                >
                  {downCents}¢
                </div>
                {!isUpWinning && (
                  <span className="hidden sm:flex items-center space-x-0.5 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-black bg-[#f23645] text-white uppercase tracking-wider animate-pulse shadow-[0_0_8px_#f23645]">
                    <TrendingDown className="w-2.5 h-2.5" />
                    <span>LEAD</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col justify-center items-end relative z-10">
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-mono font-black uppercase text-[#f23645]">
                    DOWN (TURUN)
                  </span>
                  <div className="p-0.5 rounded bg-[#f23645]/20 text-[#f23645]">
                    <ArrowDownRight className="w-3 h-3 font-black" />
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 text-[9px] font-mono text-[#787b86]">
                  <span className="hidden sm:inline">(${validDownPrice.toFixed(3)})</span>
                  <span>ROI:</span>
                  <span className="font-black text-[#f23645]">+{downRoi.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Energy Duel Bar */}
          <div className="relative w-full h-1 rounded-full overflow-hidden flex bg-[#1e222d] mt-1 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-[#089981] to-[#00ff88] transition-all duration-300 shadow-[0_0_6px_#089981]"
              style={{ width: `${upPct}%` }}
            />
            <div
              className="h-full bg-gradient-to-l from-[#f23645] to-[#ff3b69] transition-all duration-300 shadow-[0_0_6px_#f23645]"
              style={{ width: `${downPct}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_6px_#ffffff] transform -translate-x-1/2 transition-all duration-300"
              style={{ left: `${upPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. FLOATING LEGENDA BILAH ATAS: OHLCV + Benchmark */}
      <div
        className={`px-3 py-1 border-b flex flex-wrap items-center justify-between text-[11px] font-mono gap-1.5 select-none flex-shrink-0 ${
          isDark ? 'bg-[#131722]/95 border-[#2a2e39]' : 'bg-[#f7f9fa]/95 border-[#eaecef]'
        }`}
      >
        <div className="flex items-center space-x-2">
          <span className={`font-black text-xs ${isDark ? 'text-[#e1e4ea]' : 'text-slate-900'}`}>
            {isSpotMode ? `${assetName}/USDT SPOT` : `${assetName}-UP KONTRAK`}
          </span>
          <span className="text-[#787b86]">•</span>
          <span className="text-[#f0b90b] font-extrabold uppercase">{timeframe}</span>
          <span className="text-[#787b86]">•</span>
          <span className={`font-black text-xs ${isUpFromOpen ? 'text-[#089981]' : 'text-[#f23645]'}`}>
            {isSpotMode
              ? `$${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `${(lastPrice * 100).toFixed(1)}¢ ($${lastPrice.toFixed(3)})`}
          </span>
          {activeCandle && (
            <span className={`text-[10px] font-extrabold ${isUpFromOpen ? 'text-[#089981]' : 'text-[#f23645]'}`}>
              ({candleChange >= 0 ? '+' : ''}{candleChangePct.toFixed(2)}%)
            </span>
          )}
        </div>

        {/* OHLC Values */}
        {activeCandle && (
          <div className="hidden md:flex items-center space-x-2.5 text-[#787b86] text-[10px]">
            <span>O: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>
              {isSpotMode ? activeCandle.open.toFixed(2) : `${(activeCandle.open * 100).toFixed(1)}¢`}
            </strong></span>
            <span>H: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>
              {isSpotMode ? activeCandle.high.toFixed(2) : `${(activeCandle.high * 100).toFixed(1)}¢`}
            </strong></span>
            <span>L: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>
              {isSpotMode ? activeCandle.low.toFixed(2) : `${(activeCandle.low * 100).toFixed(1)}¢`}
            </strong></span>
            <span>C: <strong className={isDark ? 'text-[#d1d4dc]' : 'text-slate-800'}>
              {isSpotMode ? activeCandle.close.toFixed(2) : `${(activeCandle.close * 100).toFixed(1)}¢`}
            </strong></span>
          </div>
        )}

        {/* Benchmark Reference */}
        <div className="flex items-center space-x-3">
          {isSpotMode ? (
            <>
              {strikePrice > 0 && (
                <div className="flex items-center space-x-1">
                  <span className="text-[#787b86]">STRIKE:</span>
                  <span className="font-bold text-[#f0b90b]">
                    ${strikePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[10px] font-black px-1 rounded ${
                    isAboveBenchmark ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'
                  }`}>
                    {deltaFromBenchmark >= 0 ? '+' : ''}{deltaFromBenchmark.toFixed(2)}
                  </span>
                </div>
              )}

              {runningTwap !== undefined && runningTwap > 0 && (
                <div className="flex items-center space-x-1">
                  <span className="text-[#c084fc] font-bold">TWAP:</span>
                  <span className="font-bold text-[#c084fc]">
                    ${runningTwap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center space-x-1">
              <span className="text-[#787b86]">PARITAS:</span>
              <span className="font-bold text-[#f0b90b]">50.0¢</span>
              <span className={`text-[10px] font-black px-1 rounded ${
                isAboveBenchmark ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'
              }`}>
                {deltaFromBenchmark >= 0 ? '+' : ''}{(deltaFromBenchmark * 100).toFixed(1)}¢
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 4. CANVAS GRAFIK UTAMA */}
      <div ref={chartContainerRef} className="w-full flex-1 min-h-0 relative" />
    </div>
  );
};
