export type CryptoAsset = 'BTC' | 'ETH' | 'SOL';

export type TimeFrame = '5s' | '15s' | '30s' | '1m' | '5m' | '15m';

export type ChartMode = 'SPOT' | 'CONTRACT';

export type ChartStyle = 'candles' | 'area' | 'heikin-ashi';

export type ThemeMode = 'dark' | 'light';

export interface OHLCData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TwapDataPoint {
  time: number;
  price: number;
  runningTwap: number;
}

export interface PolymarketEvent {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  resolutionSource: string;
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  liquidity: number;
  volume: number;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  liquidity: string;
  volume: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds: string[];
  active: boolean;
  closed: boolean;
}

export interface OrderLevel {
  price: number;
  size: number;
}

export interface OrderBookState {
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
}

export interface TradeItem {
  id: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  timestamp: number;
  outcome: 'Up' | 'Down';
  transactionHash?: string;
  pseudonym?: string;
}

export interface RoundSettlementState {
  currentWindowTs: number;
  secondsLeft: number;
  strikePrice: number;
  currentPrice: number;
  runningTwap: number;
  strikeDelta: number;
  strikeDeltaPct: number;
  twapDelta: number;
  twapDeltaPct: number;
  requiredPriceToFlip: number;
  isUpWinning: boolean;
  isUrgent: boolean;
  isCritical: boolean;
  progressPct: number;
}

export interface LatencyStats {
  binanceWsPingMs: number;
  polymarketWsConnected: boolean;
  binanceWsConnected: boolean;
  lastUpdateTimestamp: number;
}
