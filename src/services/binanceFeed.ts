import { CryptoAsset, OHLCData } from '../types/market';

export const BINANCE_REST_BASE = 'https://api.binance.com/api/v3';

export const ASSET_SYMBOLS: Record<CryptoAsset, { spotSymbol: string; streamSymbol: string; name: string }> = {
  BTC: { spotSymbol: 'BTCUSDT', streamSymbol: 'btcusdt', name: 'Bitcoin' },
  ETH: { spotSymbol: 'ETHUSDT', streamSymbol: 'ethusdt', name: 'Ethereum' },
  SOL: { spotSymbol: 'SOLUSDT', streamSymbol: 'solusdt', name: 'Solana' },
};

/**
 * Fetches historical OHLC candles from Binance REST API.
 * Supports native intervals including '1s' for micro-timeframe accuracy!
 */
export async function fetchBinanceKlines(
  asset: CryptoAsset,
  interval: '1s' | '1m' | '5m' | '15m' = '1m',
  limit: number = 200
): Promise<OHLCData[]> {
  try {
    const symbol = ASSET_SYMBOLS[asset].spotSymbol;
    const url = `${BINANCE_REST_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      time: Math.floor(item[0] / 1000), // Open time in seconds
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    }));
  } catch (err) {
    console.error(`[Binance REST] Error fetching klines for ${asset}:`, err);
    return [];
  }
}

/**
 * Ultra-low latency Binance AggTrade WebSocket Stream.
 * Delivers raw trade ticks with sub-millisecond timestamps and measured ping latency.
 */
export class BinanceStreamManager {
  private ws: WebSocket | null = null;
  private currentAsset: CryptoAsset = 'BTC';
  private reconnectTimer: any = null;
  private onTickCallback: ((tick: { price: number; size: number; timeSec: number; latencyMs: number }) => void) | null = null;
  private onStatusCallback: ((connected: boolean) => void) | null = null;
  private isDestroyed = false;

  constructor(
    asset: CryptoAsset,
    onTick: (tick: { price: number; size: number; timeSec: number; latencyMs: number }) => void,
    onStatus?: (connected: boolean) => void
  ) {
    this.currentAsset = asset;
    this.onTickCallback = onTick;
    this.onStatusCallback = onStatus || null;
    this.connect();
  }

  public switchAsset(newAsset: CryptoAsset) {
    if (this.currentAsset === newAsset) return;
    this.currentAsset = newAsset;
    this.disconnect();
    this.connect();
  }

  private connect() {
    if (this.isDestroyed) return;

    try {
      const stream = ASSET_SYMBOLS[this.currentAsset].streamSymbol;
      const wsUrl = `wss://stream.binance.com:9443/ws/${stream}@aggTrade`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.onStatusCallback?.(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          if (d.p) {
            const price = parseFloat(d.p);
            const size = parseFloat(d.q || '0');
            const eventTime = d.E || Date.now();
            const timeSec = Math.floor(eventTime / 1000);
            const latencyMs = Math.max(0, Date.now() - eventTime);

            this.onTickCallback?.({
              price,
              size,
              timeSec,
              latencyMs,
            });
          }
        } catch (e) {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.onStatusCallback?.(false);
      };

      this.ws.onclose = () => {
        this.onStatusCallback?.(false);
        if (!this.isDestroyed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 2000);
        }
      };
    } catch (err) {
      if (!this.isDestroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    }
  }

  private disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.disconnect();
    this.onTickCallback = null;
    this.onStatusCallback = null;
  }
}
