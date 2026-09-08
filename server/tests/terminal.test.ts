import { describe, it, expect } from 'bun:test';
import {
  ensureStrictlyAscending,
  resampleContractCandles,
  aggregateCandles,
  TwapEngine,
} from '../../src/services/twapEngine';
import { saveCredentials, loadCredentials, purgeCredentials } from '../storage';

describe('TWAP Engine & Candle Sanitation Tests', () => {
  it('should ensure timestamps are strictly ascending without duplicates', () => {
    const rawData = [
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { time: 100, open: 1.5, high: 2.2, low: 1.2, close: 2.0, volume: 5 }, // duplicate time
      { time: 90, open: 0.8, high: 1.1, low: 0.7, close: 1.0, volume: 20 }, // out of order
      { time: 105, open: 2.0, high: 2.5, low: 1.9, close: 2.3, volume: 15 },
    ];

    const cleaned = ensureStrictlyAscending(rawData);

    expect(cleaned.length).toBe(3);
    expect(cleaned[0].time).toBe(90);
    expect(cleaned[1].time).toBe(100);
    expect(cleaned[1].high).toBe(2.2); // merged highest
    expect(cleaned[1].close).toBe(2.0); // latest close
    expect(cleaned[1].volume).toBe(15); // summed volume
    expect(cleaned[2].time).toBe(105);

    // Verify strictly ascending property
    for (let i = 1; i < cleaned.length; i++) {
      expect(cleaned[i].time).toBeGreaterThan(cleaned[i - 1].time);
    }
  });

  it('should resample micro-timeframes (5s, 15s) with strictly ascending timestamps', () => {
    const baseCandles = [
      { time: 1700000000, open: 0.50, high: 0.52, low: 0.49, close: 0.51, volume: 100 },
      { time: 1700000060, open: 0.51, high: 0.55, low: 0.50, close: 0.54, volume: 150 },
    ];

    const resampled5s = resampleContractCandles(baseCandles, '5s', 100);
    expect(resampled5s.length).toBeGreaterThan(0);

    for (let i = 1; i < resampled5s.length; i++) {
      expect(resampled5s[i].time).toBeGreaterThan(resampled5s[i - 1].time);
      expect(resampled5s[i].close).toBeGreaterThan(0);
    }
  });

  it('should compute Chainlink TWAP, leader, and flip price accurately', () => {
    const windowTs = 1700000000;
    const strike = 50000;
    const engine = new TwapEngine(windowTs, strike);

    // Record prices for 100 seconds
    for (let s = 0; s <= 100; s++) {
      // Spot drops below strike to 49000
      engine.recordPrice(49000, windowTs + s);
    }

    const state = engine.computeRoundSettlement(49000, windowTs + 100);

    expect(state.strikePrice).toBe(50000);
    expect(state.secondsLeft).toBe(200);
    expect(state.runningTwap).toBeLessThan(50000);
    expect(state.isUpWinning).toBe(false); // DOWN is leading
    expect(state.requiredPriceToFlip).toBeGreaterThan(50000); // UP needs higher price to flip
  });
});

describe('RADAR Local Storage & Security Tests', () => {
  it('should save, load, and purge credentials without exposure', () => {
    const existing = loadCredentials();

    const testCreds = {
      funderAddress: '0x1234567890123456789012345678901234567890',
      signerPrivateKey: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      apiPassphrase: 'test-passphrase',
    };

    // Save
    const saved = saveCredentials(testCreds);
    expect(saved).toBe(true);

    // Load
    const loaded = loadCredentials();
    expect(loaded).not.toBeNull();
    expect(loaded?.funderAddress).toBe(testCreds.funderAddress);
    expect(loaded?.signerPrivateKey).toBe(testCreds.signerPrivateKey);

    // Purge
    const purged = purgeCredentials();
    expect(purged).toBe(true);

    const empty = loadCredentials();
    expect(empty).toBeNull();

    // Restore existing user credentials if any
    if (existing) {
      saveCredentials(existing);
    }
  });
});
