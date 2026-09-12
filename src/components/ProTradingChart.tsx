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

  // Manual Volume Scaling State (5% to 70% of chart height)
  const [volScalePct, setVolScalePct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('chart_vol_scale');
      return saved ? parseInt(saved, 10) : 25;
    } catch (e) {
      return 25;
    }
  });

  const updateVolScale = (newScale: number) => {
    const clamped = Math.max(5, Math.min(70, newScale));
    setVolScalePct(clamped);
    try {
      localStorage.setItem('chart_vol_scale', clamped.toString());
    } catch (e) {}
  };

  const zoomHorizontal = (direction: 'in' | 'out' | 'fit') => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    if (direction === 'fit') {
      timeScale.fitContent();
    } else if (direction === 'in') {
      const current = timeScale.options().barSpacing || 8;
      timeScale.applyOptions({ barSpacing: Math.min(45, current * 1.35) });
    } else {
      const current = timeScale.options().barSpacing || 8;
      timeScale.applyOptions({ barSpacing: Math.max(2, current * 0.7) });
    }
  };

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
        scaleMargins: isSpot
          ? {
              top: 0.08,
              bottom: 0.2,
            }
          : {
              top: 0.08,
              bottom: 0.12,
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

    // Add Volume Histogram Series (Pure Overlay mode - NEVER touches right price scale)
    const topMargin = Math.max(0.70, 1 - (volScalePct / 100));
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: isDark ? 'rgba(75, 85, 99, 0.35)' : 'rgba(203, 213, 225, 0.45)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // pure overlay
    });
    volumeSeries.priceScale().applyOptions({
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
          formatter: (price: number) => {
            const clamped = Math.max(0.01, Math.min(0.99, Number(price) || 0.50));
            return `${(clamped * 100).toFixed(1)}¢`;
          },
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
    if (volumeSeriesRef.current) {
      const topMargin = Math.max(0.70, 1 - (volScalePct / 100));
      volumeSeriesRef.current.priceScale().applyOptions({
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

    // In CONTRACT mode, strictly clamp OHLC values to [0.01, 0.99] (1¢ to 99¢)
    const sanitizedData =
      chartMode === 'CONTRACT'
        ? cleanData.map((d) => {
            const o = Math.max(0.01, Math.min(0.99, Number(d.open) || 0.50));
            const c = Math.max(0.01, Math.min(0.99, Number(d.close) || 0.50));
            const rawH = Math.max(0.01, Math.min(0.99, Number(d.high) || Math.max(o, c)));
            const rawL = Math.max(0.01, Math.min(0.99, Number(d.low) || Math.min(o, c)));
            return {
              ...d,
              open: o,
              high: Math.max(rawH, o, c),
              low: Math.min(rawL, o, c),
              close: c,
            };
          })
        : cleanData;

    // Update Candles Series
    if (candleSeriesRef.current) {
      const formatted = sanitizedData.map((d) => ({
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
      const formatted = sanitizedData.map((d) => ({
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
      const volFormatted = sanitizedData.map((d) => ({
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
              color: isSpot ? '#f59e0b' : '#94a3b8',
              lineWidth: 2,
              lineStyle: 2,
              axisLabelVisible: true,
            });
          } else {
            strikeLineRef.current = targetSeries.createPriceLine({
              price: targetPrice,
              color: isSpot ? '#f59e0b' : '#94a3b8',
              lineWidth: 2,
              lineStyle: 2,
              axisLabelVisible: true,
              title: titleText,
            });
          }
        }
      } else if (strikeLineRef.current) {
        targetSeries.removePriceLine(strikeLineRef.current);
        strikeLineRef.current = null;
      }
    }

    // Optimized Prediction / Flip Target Line (Mutation via applyOptions)
    if (targetSeries) {
      if (showPrediction && predictedPrice > 0) {
        const isSpot = chartMode === 'SPOT';
        const targetPrice = isSpot
          ? predictedPrice
          : Math.max(0.01, Math.min(0.99, predictedPrice));
        const titleText = isSpot
          ? `FLIP $${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `PROYEKSI ${(targetPrice * 100).toFixed(1)}¢`;

        if (predictionLineRef.current) {
          predictionLineRef.current.applyOptions({
            price: targetPrice,
            title: titleText,
            color: '#06b6d4',
            lineWidth: 2,
            lineStyle: 3,
            axisLabelVisible: true,
          });
        } else {
          predictionLineRef.current = targetSeries.createPriceLine({
            price: targetPrice,
            color: '#06b6d4',
            lineWidth: 2,
            lineStyle: 3,
            axisLabelVisible: true,
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

  const {
    secondsLeft = 300,
    isUpWinning = true,
    isCritical = false,
    isUrgent = false,
    progressPct = 0,
  } = settlement || {};
  const countdownMinutes = Math.floor(secondsLeft / 60);
  const countdownSeconds = secondsLeft % 60;
  const formattedCountdown = `${countdownMinutes.toString().padStart(2, '0')}:${countdownSeconds.toString().padStart(2, '0')}`;

  return (
    <div
      ref={chartWrapperRef}
      className={`relative w-full h-full flex flex-col rounded-xl overflow-hidden shadow-2xl transition-colors ${
        isDark ? 'bg-[#131722] border border-[#2a2e39]' : 'bg-white border border-[#dbe0e7]'
      } ${isFullscreen ? 'p-2' : ''}`}
    >
      {/* 1. TOP TOOLBAR: Timeframe, Mode, Style, Feature Toggles, Manual Volume Scale */}
      <div
        className={`flex flex-wrap items-center justify-between px-2 py-1 border-b gap-1 z-10 select-none flex-shrink-0 ${
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
          {/* Proyeksi Flip/Target Toggle */}
          <button
            onClick={() => setShowPrediction(!showPrediction)}
            className={`flex items-center space-x-1 px-2.5 py-0.5 text-xs font-mono font-black rounded border transition-all ${
              showPrediction
                ? 'bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/60 shadow-sm'
                : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
                : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-800'
            }`}
            title="Garis Proyeksi Target Balik (Cyan #06b6d4)"
          >
            <Zap className={`w-3 h-3 ${showPrediction ? 'animate-pulse text-[#06b6d4]' : ''}`} />
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

          {/* Horizontal Zoom Controls (Samping) */}
          <div
            className={`hidden sm:flex items-center space-x-0.5 px-1 py-0.5 rounded border text-[10px] font-mono ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-300'
            }`}
            title="Zoom Horizontal Lilin & Volume"
          >
            <button
              onClick={() => zoomHorizontal('out')}
              className="px-1 text-[#787b86] hover:text-[#f0b90b] font-black hover:bg-[#2a2e39] rounded transition-colors"
              title="Rapatkan Bar (Zoom Out)"
            >
              -
            </button>
            <button
              onClick={() => zoomHorizontal('fit')}
              className="px-1 text-[#787b86] hover:text-white font-bold hover:bg-[#2a2e39] rounded transition-colors text-[9px]"
              title="Reset Tampilan / Fit"
            >
              FIT
            </button>
            <button
              onClick={() => zoomHorizontal('in')}
              className="px-1 text-[#787b86] hover:text-[#f0b90b] font-black hover:bg-[#2a2e39] rounded transition-colors"
              title="Lebarkan Bar (Zoom In)"
            >
              +
            </button>
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

      {/* 3. FLOATING LEGENDA BILAH ATAS: OHLCV + Benchmark */}
      <div
        className={`px-2.5 py-0.5 border-b flex flex-wrap items-center justify-between text-[10.5px] font-mono gap-1 select-none flex-shrink-0 ${
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

        {/* Benchmark & Proyeksi Reference */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {isSpotMode ? (
            <>
              {strikePrice > 0 && (
                <div className="flex items-center space-x-1" title="Benchmark Awal Ronde 5M">
                  <span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span>
                  <span className="text-[#787b86]">STRIKE:</span>
                  <span className="font-bold text-[#f59e0b]">
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
                <div className="flex items-center space-x-1" title="Running Chainlink TWAP">
                  <span className="w-2 h-2 rounded-full bg-[#a855f7]"></span>
                  <span className="text-[#c084fc] font-bold">TWAP:</span>
                  <span className="font-bold text-[#c084fc]">
                    ${runningTwap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {showPrediction && predictedPrice > 0 && (
                <div className="flex items-center space-x-1" title="Required Price to Flip (Target Balik)">
                  <span className="w-2 h-2 rounded-full bg-[#06b6d4]"></span>
                  <span className="text-[#06b6d4] font-bold">FLIP:</span>
                  <span className="font-bold text-[#06b6d4]">
                    ${predictedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center space-x-1" title="Paritas 50¢">
                <span className="w-2 h-2 rounded-full bg-[#94a3b8]"></span>
                <span className="text-[#787b86]">PARITAS:</span>
                <span className="font-bold text-[#94a3b8]">50.0¢</span>
              </div>

              {showPrediction && predictedPrice > 0 && (
                <div className="flex items-center space-x-1" title="Fair Implied Probability">
                  <span className="w-2 h-2 rounded-full bg-[#06b6d4]"></span>
                  <span className="text-[#06b6d4] font-bold">PROYEKSI WAJAR:</span>
                  <span className="font-bold text-[#06b6d4]">
                    {(predictedPrice * 100).toFixed(1)}¢
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 4. CANVAS GRAFIK UTAMA DENGAN COUNTDOWN OVERLAY DI ATAS KOLOM HARGA */}
      <div className="w-full flex-1 min-h-0 relative">
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* COUNTDOWN OVERLAY DI DALAM CHART, DI ATAS KOLOM HARGA */}
        <div className="absolute top-2 right-2 z-20 pointer-events-none select-none flex flex-col items-end space-y-1">
          <div
            className={`px-3 py-1 rounded-lg border shadow-xl backdrop-blur-md flex items-center space-x-2.5 transition-all ${
              isCritical
                ? 'bg-[#2e1219]/90 border-[#f23645] text-rose-200 animate-pulse'
                : isUrgent
                ? 'bg-[#382705]/90 border-[#f0b90b] text-amber-200'
                : isDark
                ? 'bg-[#181d28]/85 border-[#2a2e39] text-slate-200'
                : 'bg-white/90 border-slate-300 text-slate-800'
            }`}
          >
            <div className="flex flex-col items-end">
              <span className="text-[8.5px] font-mono uppercase tracking-wider text-[#787b86] font-bold">
                COUNTDOWN 5M
              </span>
              <span
                className={`text-xl sm:text-2xl font-mono font-black tracking-widest leading-none ${
                  isCritical ? 'text-[#f23645]' : isUrgent ? 'text-[#f0b90b]' : 'text-[#f0b90b]'
                }`}
              >
                {formattedCountdown}
              </span>
            </div>

            {/* Verdict Pill */}
            <div className="flex flex-col items-end pl-2 border-l border-slate-700/40">
              <span
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-black uppercase tracking-wide border ${
                  isUpWinning
                    ? 'bg-[#089981]/25 text-[#089981] border-[#089981]/60'
                    : 'bg-[#f23645]/25 text-[#f23645] border-[#f23645]/60'
                }`}
              >
                {isUpWinning ? '▲ UP WIN' : '▼ DOWN WIN'}
              </span>
              <span className="text-[8px] font-mono text-[#787b86] mt-0.5 font-bold">
                {secondsLeft}s
              </span>
            </div>
          </div>

          {/* Micro Progress Bar */}
          <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full transition-all duration-1000 ${
                isCritical ? 'bg-[#f23645]' : isUrgent ? 'bg-[#f0b90b]' : 'bg-[#089981]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
