import React, { useState } from 'react';
import { useTradingTerminal } from './hooks/useTradingTerminal';
import { ProHeader } from './components/ProHeader';
import { ProTradingChart } from './components/ProTradingChart';
import { ClobOrderBook } from './components/ClobOrderBook';
import { LiveTradesTicker } from './components/LiveTradesTicker';
import { TwapAnalyticsCard } from './components/TwapAnalyticsCard';
import { UpcomingPeriodsBar } from './components/UpcomingPeriodsBar';
import { OrderExecutionPanel } from './components/OrderExecutionPanel';
import { CredentialModal } from './components/CredentialModal';
import { getPolymarketSlug } from './services/polymarketFeed';
import { BarChart2, BookOpen, Activity, ShieldCheck, Zap } from 'lucide-react';

export function App() {
  const {
    asset,
    setAsset,
    timeframe,
    setTimeframe,
    chartMode,
    setChartMode,
    chartStyle,
    setChartStyle,
    theme,
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
  } = useTradingTerminal();

  // Mobile navigation tab state
  const [mobileTab, setMobileTab] = useState<'chart' | 'trade' | 'book' | 'trades' | 'twap'>('chart');
  
  // Right Column Secondary Tab (Book vs Tape)
  const [rightPanelTab, setRightPanelTab] = useState<'book' | 'trades'>('book');

  // Credential Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const slug = getPolymarketSlug(asset, selectedWindowTs || currentWindowTs);
  const activeLastPrice = chartMode === 'SPOT' ? spotPrice : upPrice;
  const isDark = theme === 'dark';

  return (
    <div
      className={`min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden flex flex-col font-sans selection:bg-[#f0b90b] selection:text-black transition-colors ${
        isDark ? 'bg-[#0e1118] text-[#d1d4dc]' : 'bg-[#f4f6f9] text-[#191b22]'
      }`}
    >
      {/* Top Pro Sticky Header */}
      <ProHeader
        asset={asset}
        setAsset={setAsset}
        spotPrice={spotPrice}
        priceDirection={priceDirection}
        settlement={settlement}
        latencyStats={latencyStats}
        upPrice={upPrice}
        downPrice={downPrice}
        theme={theme}
        toggleTheme={toggleTheme}
        showPrediction={showPrediction}
        setShowPrediction={setShowPrediction}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Terminal Area (100% Fit in Single PC Viewport without Page Scrolling) */}
      <main className="flex-1 min-h-0 p-2 max-w-[1920px] w-full mx-auto flex flex-col lg:overflow-hidden">
        
        {/* Mobile Tab Switcher (Visible only on mobile/tablet) */}
        <div
          className={`lg:hidden flex items-center p-1 rounded-xl border text-xs font-mono select-none mb-2 ${
            isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#dbe0e7] shadow-sm'
          }`}
        >
          <button
            onClick={() => setMobileTab('chart')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1 font-bold transition-all ${
              mobileTab === 'chart'
                ? 'bg-[#f0b90b] text-black shadow font-black'
                : isDark
                ? 'text-[#787b86]'
                : 'text-slate-600'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>CHART</span>
          </button>
          <button
            onClick={() => setMobileTab('trade')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1 font-bold transition-all ${
              mobileTab === 'trade'
                ? 'bg-[#f0b90b] text-black shadow font-black'
                : isDark
                ? 'text-[#787b86]'
                : 'text-slate-600'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>ORDER</span>
          </button>
          <button
            onClick={() => setMobileTab('book')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1 font-bold transition-all ${
              mobileTab === 'book'
                ? 'bg-[#f0b90b] text-black shadow font-black'
                : isDark
                ? 'text-[#787b86]'
                : 'text-slate-600'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>BOOK</span>
          </button>
          <button
            onClick={() => setMobileTab('trades')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1 font-bold transition-all ${
              mobileTab === 'trades'
                ? 'bg-[#f0b90b] text-black shadow font-black'
                : isDark
                ? 'text-[#787b86]'
                : 'text-slate-600'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>TAPE</span>
          </button>
          <button
            onClick={() => setMobileTab('twap')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1 font-bold transition-all ${
              mobileTab === 'twap'
                ? 'bg-[#f0b90b] text-black shadow font-black'
                : isDark
                ? 'text-[#787b86]'
                : 'text-slate-600'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>TWAP</span>
          </button>
        </div>

        {/* Dual Layout Grid (Desktop vs Mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-0">
          
          {/* LEFT / PRIMARY (58% width on desktop): TradingView Chart with Integrated Top UP/DOWN HUD */}
          <section className={`lg:col-span-7 xl:col-span-7 2xl:col-span-7 flex flex-col h-full min-h-0 ${
            mobileTab === 'chart' ? 'flex' : 'hidden lg:flex'
          }`}>
            <div className="flex-1 min-h-0 h-full w-full flex flex-col">
              <ProTradingChart
                data={activeCandles}
                twapData={twapLineData}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
                chartMode={chartMode}
                setChartMode={setChartMode}
                chartStyle={chartStyle}
                setChartStyle={setChartStyle}
                theme={theme}
                lastPrice={activeLastPrice}
                strikePrice={settlement.strikePrice}
                runningTwap={settlement.runningTwap}
                showPrediction={showPrediction}
                setShowPrediction={setShowPrediction}
                predictedPrice={predictedPrice}
                assetName={asset}
                upPrice={upPrice}
                downPrice={downPrice}
                settlement={settlement}
              />
            </div>

            {/* DIPINDAHKAN KE BAWAH CHART: Chainlink TWAP Benchmark + Waktu Beberapa Periode Berikutnya */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-2 mt-2 flex-shrink-0">
              <div className="xl:col-span-7 min-w-0">
                <TwapAnalyticsCard
                  settlement={settlement}
                  eventData={activeEvent}
                  activeMarket={activeMarket}
                  slug={slug}
                  theme={theme}
                />
              </div>
              <div className="xl:col-span-5 min-w-0">
                <UpcomingPeriodsBar
                  upcomingPeriods={upcomingPeriods}
                  selectedWindowTs={selectedWindowTs}
                  onSelectPeriod={setSelectedWindowTs}
                  theme={theme}
                />
              </div>
            </div>
          </section>

          {/* RIGHT / SECONDARY (42% width on desktop): Order Execution + OrderBook/Tape */}
          <section className={`lg:col-span-5 xl:col-span-5 2xl:col-span-5 flex flex-col h-full min-h-0 space-y-2 ${
            mobileTab !== 'chart' ? 'flex' : 'hidden lg:flex'
          }`}>
            {/* Mobile-Only Tab Views */}
            <div className="lg:hidden flex-1 flex flex-col space-y-2">
              {mobileTab === 'trade' && (
                <div className="space-y-2">
                  <UpcomingPeriodsBar
                    upcomingPeriods={upcomingPeriods}
                    selectedWindowTs={selectedWindowTs}
                    onSelectPeriod={setSelectedWindowTs}
                    theme={theme}
                  />
                  <OrderExecutionPanel
                    asset={asset}
                    upPrice={upPrice}
                    downPrice={downPrice}
                    upTokenId={upTokenId}
                    downTokenId={downTokenId}
                    theme={theme}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    settlement={settlement}
                  />
                </div>
              )}
              {mobileTab === 'book' && <div className="h-[480px]"><ClobOrderBook orderBook={orderBook} theme={theme} /></div>}
              {mobileTab === 'trades' && <div className="h-[480px]"><LiveTradesTicker trades={trades} theme={theme} /></div>}
              {mobileTab === 'twap' && (
                <div className="space-y-2">
                  <TwapAnalyticsCard
                    settlement={settlement}
                    eventData={activeEvent}
                    activeMarket={activeMarket}
                    slug={slug}
                    theme={theme}
                  />
                  <UpcomingPeriodsBar
                    upcomingPeriods={upcomingPeriods}
                    selectedWindowTs={selectedWindowTs}
                    onSelectPeriod={setSelectedWindowTs}
                    theme={theme}
                  />
                </div>
              )}
            </div>

            {/* Desktop Structured View (Zero Scroll, Direct Access to BUY & SELL Menu) */}
            <div className="hidden lg:flex flex-col h-full min-h-0 space-y-2">
              {/* 1. Instant Order Execution Panel (NAIK KE ATAS, TAMPIL UTUH TANPA SCROLL) */}
              <OrderExecutionPanel
                asset={asset}
                upPrice={upPrice}
                downPrice={downPrice}
                upTokenId={upTokenId}
                downTokenId={downTokenId}
                theme={theme}
                onOpenSettings={() => setIsSettingsOpen(true)}
                settlement={settlement}
              />

              {/* 2. Tabbed Order Book & Live Trades Stream */}
              <div className="flex-1 min-h-0 flex flex-col border rounded-xl overflow-hidden shadow-md">
                {/* Book vs Tape Tab Switcher */}
                <div
                  className={`flex items-center px-2 py-1 border-b text-[10px] font-mono font-bold select-none flex-shrink-0 ${
                    isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => setRightPanelTab('book')}
                    className={`flex-1 py-1 rounded-md text-center transition-all ${
                      rightPanelTab === 'book'
                        ? isDark
                          ? 'bg-[#1e222d] text-white font-black shadow-sm'
                          : 'bg-white text-black shadow-sm font-black'
                        : 'text-[#787b86] hover:text-white'
                    }`}
                  >
                    ORDER BOOK (CLOB)
                  </button>
                  <button
                    onClick={() => setRightPanelTab('trades')}
                    className={`flex-1 py-1 rounded-md text-center transition-all ${
                      rightPanelTab === 'trades'
                        ? isDark
                          ? 'bg-[#1e222d] text-white font-black shadow-sm'
                          : 'bg-white text-black shadow-sm font-black'
                        : 'text-[#787b86] hover:text-white'
                    }`}
                  >
                    LIVE TAPE (TRADES)
                  </button>
                </div>

                <div className="flex-1 min-h-0">
                  {rightPanelTab === 'book' ? (
                    <ClobOrderBook orderBook={orderBook} theme={theme} />
                  ) : (
                    <LiveTradesTicker trades={trades} theme={theme} />
                  )}
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* Credential Management Modal */}
      <CredentialModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
      />
    </div>
  );
}

export default App;
