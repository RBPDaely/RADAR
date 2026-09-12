import { CryptoAsset } from '../types/market';

export interface SpotTick {
  price: number;
  size: number;
  timeSec: number;
  latencyMs: number;
  source: 'BINANCE' | 'COINBASE';
}

export interface MultiFeedStatus {
  connected: boolean;
  activeSource: 'BINANCE' | 'COINBASE';
  binanceOk: boolean;
  coinbaseOk: boolean;
}

const BINANCE_SYMBOLS: Record<CryptoAsset, string> = {
  BTC: 'btcusdt',
  ETH: 'ethusdt',
  SOL: 'solusdt',
};

const COINBASE_PRODUCTS: Record<CryptoAsset, string> = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
};

/**
 * Robust Multi-Feed Stream Manager.
 * Streams real-time ticks from Binance with automatic zero-lag fallback to Coinbase Exchange.
 */
export class MultiFeedStreamManager {
  private currentAsset: CryptoAsset;
  private onTickCallback: (tick: SpotTick) => void;
  private onStatusCallback?: (status: MultiFeedStatus) => void;

  private binanceWs: WebSocket | null = null;
  private coinbaseWs: WebSocket | null = null;

  private binanceConnected = false;
  private coinbaseConnected = false;
  private activeSource: 'BINANCE' | 'COINBASE' = 'BINANCE';

  private lastBinanceTickTime = 0;
  private lastCoinbaseTickTime = 0;
  private watchdogTimer: any = null;
  private isDestroyed = false;

  constructor(
    asset: CryptoAsset,
    onTick: (tick: SpotTick) => void,
    onStatus?: (status: MultiFeedStatus) => void
  ) {
    this.currentAsset = asset;
    this.onTickCallback = onTick;
    this.onStatusCallback = onStatus;

    this.connectBinance();
    this.connectCoinbase();
    this.startWatchdog();
  }

  public switchAsset(newAsset: CryptoAsset) {
    if (this.currentAsset === newAsset) return;
    this.currentAsset = newAsset;

    this.disconnectAll();
    this.connectBinance();
    this.connectCoinbase();
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.disconnectAll();
  }

  private disconnectAll() {
    if (this.binanceWs) {
      try { this.binanceWs.close(); } catch {}
      this.binanceWs = null;
    }
    if (this.coinbaseWs) {
      try { this.coinbaseWs.close(); } catch {}
      this.coinbaseWs = null;
    }
    this.binanceConnected = false;
    this.coinbaseConnected = false;
  }

  private notifyStatus() {
    this.onStatusCallback?.({
      connected: this.binanceConnected || this.coinbaseConnected,
      activeSource: this.activeSource,
      binanceOk: this.binanceConnected,
      coinbaseOk: this.coinbaseConnected,
    });
  }

  // --- Binance WebSocket ---
  private connectBinance() {
    if (this.isDestroyed) return;
    const stream = BINANCE_SYMBOLS[this.currentAsset];
    const wsUrl = `wss://stream.binance.com:9443/ws/${stream}@aggTrade`;

    try {
      this.binanceWs = new WebSocket(wsUrl);

      this.binanceWs.onopen = () => {
        this.binanceConnected = true;
        this.notifyStatus();
      };

      this.binanceWs.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          if (d.p) {
            const now = Date.now();
            this.lastBinanceTickTime = now;
            const price = parseFloat(d.p);
            const size = parseFloat(d.q || '0');
            const eventTime = d.E || now;
            const timeSec = Math.floor(eventTime / 1000);
            const latencyMs = Math.max(0, now - eventTime);

            // If Binance is active or recovers, route ticks
            if (this.activeSource === 'BINANCE' || (now - this.lastCoinbaseTickTime > 4000)) {
              this.activeSource = 'BINANCE';
              this.onTickCallback({
                price,
                size,
                timeSec,
                latencyMs,
                source: 'BINANCE',
              });
            }
          }
        } catch {}
      };

      this.binanceWs.onerror = () => {
        this.binanceConnected = false;
        this.notifyStatus();
      };

      this.binanceWs.onclose = () => {
        this.binanceConnected = false;
        this.notifyStatus();
        if (!this.isDestroyed) {
          setTimeout(() => this.connectBinance(), 2500);
        }
      };
    } catch {
      this.binanceConnected = false;
    }
  }

  // --- Coinbase WebSocket (Failover / Redundancy) ---
  private connectCoinbase() {
    if (this.isDestroyed) return;
    const productId = COINBASE_PRODUCTS[this.currentAsset];

    try {
      this.coinbaseWs = new WebSocket('wss://ws-feed.exchange.coinbase.com');

      this.coinbaseWs.onopen = () => {
        this.coinbaseConnected = true;
        this.coinbaseWs?.send(JSON.stringify({
          type: 'subscribe',
          product_ids: [productId],
          channels: ['ticker'],
        }));
        this.notifyStatus();
      };

      this.coinbaseWs.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          if (d.type === 'ticker' && d.price) {
            const now = Date.now();
            this.lastCoinbaseTickTime = now;
            const price = parseFloat(d.price);
            const size = parseFloat(d.last_size || '0');
            const eventTime = d.time ? new Date(d.time).getTime() : now;
            const timeSec = Math.floor(eventTime / 1000);
            const latencyMs = Math.max(0, now - eventTime);

            // Only emit Coinbase ticks if Binance has stalled (> 3000ms without tick)
            if (this.activeSource === 'COINBASE' || (now - this.lastBinanceTickTime > 3000)) {
              this.activeSource = 'COINBASE';
              this.onTickCallback({
                price,
                size,
                timeSec,
                latencyMs,
                source: 'COINBASE',
              });
            }
          }
        } catch {}
      };

      this.coinbaseWs.onerror = () => {
        this.coinbaseConnected = false;
        this.notifyStatus();
      };

      this.coinbaseWs.onclose = () => {
        this.coinbaseConnected = false;
        this.notifyStatus();
        if (!this.isDestroyed) {
          setTimeout(() => this.connectCoinbase(), 3000);
        }
      };
    } catch {
      this.coinbaseConnected = false;
    }
  }

  // --- Health Watchdog ---
  private startWatchdog() {
    this.watchdogTimer = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();

      // Check if Binance has gone silent for > 3.5s while Coinbase is alive
      if (this.binanceConnected && (now - this.lastBinanceTickTime > 3500) && this.coinbaseConnected) {
        if (this.activeSource !== 'COINBASE') {
          console.warn('[MultiFeed] Binance heartbeat stalled. Auto-failover to Coinbase stream.');
          this.activeSource = 'COINBASE';
          this.notifyStatus();
        }
      } else if (this.activeSource === 'COINBASE' && (now - this.lastBinanceTickTime <= 2000)) {
        console.log('[MultiFeed] Binance stream restored. Switching back to primary feed.');
        this.activeSource = 'BINANCE';
        this.notifyStatus();
      }
    }, 1500);
  }
}
