import { OHLCData, TimeFrame, RoundSettlementState } from '../types/market';

/**
 * Ensures candle array has strictly ascending, non-duplicate integer timestamps.
 * Merges duplicate timestamps cleanly, validates numbers, and prevents lightweight-charts crashes.
 */
export function ensureStrictlyAscending(candles: OHLCData[]): OHLCData[] {
  if (!candles || candles.length === 0) return [];
  
  // Sort primarily by time ascending
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const result: OHLCData[] = [];

  for (const c of sorted) {
    const t = Math.floor(c.time);
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const v = Number(c.volume || 0);

    if (isNaN(t) || isNaN(cl) || cl <= 0 || !isFinite(cl)) continue;

    if (result.length === 0) {
      result.push({
        time: t,
        open: !isNaN(o) && o > 0 ? o : cl,
        high: !isNaN(h) && h > 0 ? Math.max(h, cl) : cl,
        low: !isNaN(l) && l > 0 ? Math.min(l, cl) : cl,
        close: cl,
        volume: !isNaN(v) ? v : 0,
      });
    } else {
      const last = result[result.length - 1];
      if (t > last.time) {
        result.push({
          time: t,
          open: !isNaN(o) && o > 0 ? o : cl,
          high: !isNaN(h) && h > 0 ? Math.max(h, cl) : cl,
          low: !isNaN(l) && l > 0 ? Math.min(l, cl) : cl,
          close: cl,
          volume: !isNaN(v) ? v : 0,
        });
      } else if (t === last.time) {
        // Merge identical timestamp into existing bar
        last.high = Math.max(last.high, h > 0 ? h : cl);
        last.low = Math.min(last.low, l > 0 ? l : cl);
        last.close = cl;
        last.volume += !isNaN(v) ? v : 0;
      }
      // If t < last.time, ignore out-of-order older bars
    }
  }

  return result;
}

/**
 * Resamples contract candles safely for any target timeframe (including micro-timeframes 5s, 15s, 30s)
 * without leaving gaps, guaranteeing 100% ascending integer timestamps.
 */
export function resampleContractCandles(candles: OHLCData[], tf: TimeFrame, maxCount: number = 300): OHLCData[] {
  if (!candles || candles.length === 0) return [];
  const clean = ensureStrictlyAscending(candles);
  if (clean.length === 0) return [];

  const tfSecondsMap: Record<TimeFrame, number> = {
    '5s': 5,
    '15s': 15,
    '30s': 30,
    '1m': 60,
    '5m': 300,
    '15m': 900,
  };
  const targetSec = tfSecondsMap[tf] || 60;

  if (targetSec >= 60) {
    return aggregateCandles(clean, tf, maxCount);
  }

  // Aggregate ticks/1m candles into micro-second buckets
  const bucketMap = new Map<number, OHLCData>();

  for (const c of clean) {
    const bucketTime = Math.floor(c.time / targetSec) * targetSec;
    const existing = bucketMap.get(bucketTime);

    if (!existing) {
      bucketMap.set(bucketTime, {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume || 0;
    }
  }

  const sorted = Array.from(bucketMap.values()).sort((a, b) => a.time - b.time);
  return ensureStrictlyAscending(sorted).slice(-maxCount);
}

/**
 * Real-time Chainlink TWAP Accumulator
 */
export class TwapEngine {
  private windowTs: number = 0;
  private strikePrice: number = 0;
  private secondPriceMap: Map<number, number> = new Map();

  constructor(windowTs: number, initialStrike: number = 0) {
    this.resetWindow(windowTs, initialStrike);
  }

  public resetWindow(windowTs: number, strikePrice: number = 0) {
    this.windowTs = windowTs;
    this.strikePrice = strikePrice > 0 ? strikePrice : 0;
    this.secondPriceMap.clear();
  }

  public setStrikePrice(price: number) {
    if (this.strikePrice === 0 && price > 0) {
      this.strikePrice = price;
    }
  }

  public recordPrice(price: number, timestampSec: number) {
    if (price <= 0) return;

    if (timestampSec >= this.windowTs && timestampSec <= this.windowTs + 300) {
      const secondIndex = timestampSec - this.windowTs;
      this.secondPriceMap.set(secondIndex, price);

      if (this.strikePrice === 0) {
        this.strikePrice = price;
      }
    }
  }

  public computeRoundSettlement(currentPrice: number, nowSec: number): RoundSettlementState {
    const elapsedRaw = Math.max(0, nowSec - this.windowTs);
    const elapsed = Math.min(300, elapsedRaw);
    const secondsLeft = Math.max(0, 300 - elapsed);
    const progressPct = Math.min(100, Math.max(0, (elapsed / 300) * 100));

    const strike = this.strikePrice > 0 ? this.strikePrice : (currentPrice > 0 ? currentPrice : 1);

    let runningTwap = currentPrice > 0 ? currentPrice : strike;
    if (this.secondPriceMap.size > 0 && elapsed > 0) {
      let sumPrice = 0;
      let lastKnown = strike;

      for (let s = 0; s <= elapsed; s++) {
        if (this.secondPriceMap.has(s)) {
          lastKnown = this.secondPriceMap.get(s)!;
        }
        sumPrice += lastKnown;
      }
      runningTwap = sumPrice / (elapsed + 1);
    } else {
      runningTwap = strike;
    }

    const strikeDelta = currentPrice > 0 ? currentPrice - strike : 0;
    const strikeDeltaPct = strike > 0 ? (strikeDelta / strike) * 100 : 0;

    const twapDelta = runningTwap - strike;
    const twapDeltaPct = strike > 0 ? (twapDelta / strike) * 100 : 0;

    let requiredPriceToFlip = strike;
    if (secondsLeft > 0 && elapsed > 0) {
      const currentSum = runningTwap * (elapsed + 1);
      const remainingSec = Math.max(1, 300 - elapsed);
      const neededSum = (strike * 300) - currentSum;
      const target = neededSum / remainingSec;
      requiredPriceToFlip = isFinite(target) && !isNaN(target) ? Math.max(0, target) : strike;
    }

    const isUpWinning = runningTwap >= strike;
    const isUrgent = secondsLeft <= 60 && secondsLeft > 0;
    const isCritical = secondsLeft <= 15 && secondsLeft > 0;

    return {
      currentWindowTs: this.windowTs,
      secondsLeft,
      strikePrice: strike,
      currentPrice: currentPrice > 0 ? currentPrice : strike,
      runningTwap,
      strikeDelta,
      strikeDeltaPct,
      twapDelta,
      twapDeltaPct,
      requiredPriceToFlip,
      isUpWinning,
      isUrgent,
      isCritical,
      progressPct,
    };
  }
}

/**
 * Aggregates granular candles into target timeframe candles.
 */
export function aggregateCandles(candles: OHLCData[], tf: TimeFrame, maxCount: number = 300): OHLCData[] {
  if (!candles || candles.length === 0) return [];

  const tfSecondsMap: Record<TimeFrame, number> = {
    '5s': 5,
    '15s': 15,
    '30s': 30,
    '1m': 60,
    '5m': 300,
    '15m': 900,
  };

  const periodSec = tfSecondsMap[tf] || 60;
  const bucketMap = new Map<number, OHLCData>();

  for (const c of candles) {
    const bucketTime = Math.floor(c.time / periodSec) * periodSec;
    const existing = bucketMap.get(bucketTime);

    if (!existing) {
      bucketMap.set(bucketTime, {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume || 0;
    }
  }

  const sorted = Array.from(bucketMap.values()).sort((a, b) => a.time - b.time);
  return ensureStrictlyAscending(sorted).slice(-maxCount);
}

/**
 * Converts regular candlestick data to Heikin-Ashi candles.
 */
export function toHeikinAshi(candles: OHLCData[]): OHLCData[] {
  if (!candles || candles.length === 0) return [];

  const clean = ensureStrictlyAscending(candles);
  if (clean.length === 0) return [];

  const haCandles: OHLCData[] = [];
  let prevHaOpen = clean[0].open;
  let prevHaClose = clean[0].close;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    haCandles.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume || 0,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return haCandles;
}
