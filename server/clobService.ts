import { Wallet, ethers } from 'ethers';
import { ClobClient, Side, OrderType, SignatureType, AssetType } from '@polymarket/clob-client';
import { RadarCredentials, OrderRequest, OrderResponse, WalletStatus } from './types';
import { loadCredentials, saveCredentials } from './storage';

export const POLYGON_RPC_URL = 'https://polygon-rpc.com';
export const USDC_E_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
export const CTF_EXCHANGE_POLYGON = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

class ClobServiceManager {
  private client: ClobClient | null = null;
  private currentCreds: RadarCredentials | null = null;
  private signer: Wallet | null = null;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    this.initFromStorage();
  }

  public initFromStorage() {
    const creds = loadCredentials();
    if (creds && creds.signerPrivateKey) {
      this.initClient(creds);
    }
  }

  public async initClient(creds: RadarCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      let cleanKey = creds.signerPrivateKey.trim();
      if (!cleanKey.startsWith('0x')) {
        cleanKey = `0x${cleanKey}`;
      }

      this.signer = new Wallet(cleanKey, this.provider);
      const funder = creds.funderAddress ? creds.funderAddress.trim() : this.signer.address;

      let apiCreds = undefined;
      if (creds.apiKey && creds.apiSecret && creds.apiPassphrase) {
        apiCreds = {
          key: creds.apiKey.trim(),
          secret: creds.apiSecret.trim(),
          passphrase: creds.apiPassphrase.trim(),
        };
      }

      // Default to SignatureType.POLY_GNOSIS_SAFE (2) for modern email accounts, fallback to POLY_PROXY (1) or EOA (0)
      let chosenSigType = creds.signatureType !== undefined ? creds.signatureType : SignatureType.POLY_GNOSIS_SAFE;
      if (funder.toLowerCase() === this.signer.address.toLowerCase() && creds.signatureType === undefined) {
        chosenSigType = SignatureType.EOA;
      }

      // Initialize CLOB client for Polygon (Chain ID 137)
      this.client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        this.signer as any,
        apiCreds,
        chosenSigType,
        funder
      );

      // If API credentials are not provided, attempt to derive or create them via L1 signature
      if (!apiCreds && this.client) {
        try {
          console.log('[Sidecar] Deriving or creating API key from signer...');
          const derived = await this.client.createOrDeriveApiKey();
          if (derived && derived.key) {
            creds.apiKey = derived.key;
            creds.apiSecret = derived.secret;
            creds.apiPassphrase = derived.passphrase;
            saveCredentials(creds);
            console.log('[Sidecar] API Key derived successfully:', derived.key.slice(0, 8) + '...');
          }
        } catch (e: any) {
          console.warn('[Sidecar] Auto-derive API key notice:', e.message || e);
        }
      }

      // Verify CLOB L2 authentication & test signature type fallback if needed
      try {
        await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      } catch (testErr: any) {
        console.warn(`[Sidecar] Test with signatureType ${chosenSigType} notice:`, testErr.message || testErr);
        // If modern SAFE failed, try POLY_PROXY fallback
        if (chosenSigType === SignatureType.POLY_GNOSIS_SAFE) {
          try {
            console.log('[Sidecar] Testing fallback to POLY_PROXY (1)...');
            const fallbackClient = new ClobClient(
              'https://clob.polymarket.com',
              137,
              this.signer as any,
              apiCreds || (this.client as any).creds,
              SignatureType.POLY_PROXY,
              funder
            );
            await fallbackClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
            this.client = fallbackClient;
            chosenSigType = SignatureType.POLY_PROXY;
            creds.signatureType = chosenSigType;
            saveCredentials(creds);
            console.log('[Sidecar] Successfully verified using POLY_PROXY!');
          } catch (fallbackErr) {
            console.warn('[Sidecar] Fallback test notice:', fallbackErr);
          }
        }
      }

      creds.signatureType = chosenSigType;
      this.currentCreds = creds;
      return { success: true };
    } catch (err: any) {
      console.error('[Sidecar] Error initializing client:', err);
      this.client = null;
      this.signer = null;
      return { success: false, error: err.message || 'Gagal inisialisasi CLOB client' };
    }
  }

  public async getWalletStatus(): Promise<WalletStatus> {
    if (!this.currentCreds || !this.signer) {
      return { hasCredentials: false };
    }

    try {
      const funder = this.currentCreds.funderAddress || this.signer.address;
      const signerAddr = this.signer.address;
      const builderAddr = this.currentCreds.builderSignerAddress?.trim();
      const signerMatchesBuilder = builderAddr ? builderAddr.toLowerCase() === signerAddr.toLowerCase() : undefined;

      let usdcBalance = 0;
      let hasAllowance = false;
      let clobAuthValid = false;

      try {
        const usdcContract = new ethers.Contract(USDC_E_POLYGON, ERC20_ABI, this.provider);
        const bal = await usdcContract.balanceOf(funder);
        usdcBalance = parseFloat(ethers.formatUnits(bal, 6));

        const allow = await usdcContract.allowance(funder, CTF_EXCHANGE_POLYGON);
        hasAllowance = allow > 0n;
      } catch (rpcErr) {
        console.warn('[Sidecar] Polygon RPC check notice:', rpcErr);
      }

      // Check CLOB auth
      if (this.client) {
        try {
          await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          clobAuthValid = true;
        } catch (clobErr) {
          // not fatal
        }
      }

      return {
        hasCredentials: true,
        funderAddress: funder,
        signerAddress: signerAddr,
        builderSignerAddress: builderAddr,
        signerMatchesBuilder,
        signatureType: this.currentCreds.signatureType,
        clobAuthValid,
        usdcBalance,
        proxyAllowance: hasAllowance,
      };
    } catch (e: any) {
      return {
        hasCredentials: true,
        error: e.message || 'Error checking wallet status',
      };
    }
  }

  public async executeOrder(req: OrderRequest, side: 'BUY' | 'SELL'): Promise<OrderResponse> {
    if (!this.client || !this.signer) {
      return {
        success: false,
        message: 'Kredensial Polymarket belum terkonfigurasi. Buka menu Settings Kredensial untuk mengisi akun.',
      };
    }

    try {
      const { tokenId, amountUsd, limitPrice } = req;
      if (!tokenId) {
        return { success: false, message: 'Token ID pasar tidak ditemukan.' };
      }

      if (amountUsd <= 0) {
        return { success: false, message: 'Nominal modal harus lebih besar dari $0.' };
      }

      // Determine price
      let executionPrice = limitPrice && limitPrice > 0 && limitPrice < 1 ? limitPrice : 0.50;

      // If Market order, fetch latest midpoint or top ask/bid from CLOB
      if (req.orderType === 'MARKET') {
        try {
          const midRes = await fetch(`https://clob.polymarket.com/midpoint?token_id=${tokenId}`);
          if (midRes.ok) {
            const data = await midRes.json();
            if (data && data.mid) {
              const mid = parseFloat(data.mid);
              if (!isNaN(mid) && mid > 0 && mid < 1) {
                // Apply slight slippage buffer for instant fill
                const buffer = side === 'BUY' ? (req.slippageTolerance || 0.015) : -(req.slippageTolerance || 0.015);
                executionPrice = Math.min(0.99, Math.max(0.01, mid + buffer));
              }
            }
          }
        } catch (e) {
          console.warn('[Sidecar] Market price fetch fallback:', e);
        }
      }

      // Calculate shares (contracts): Amount ($) / Price ($)
      const rawShares = amountUsd / executionPrice;
      // Round shares to 2 decimals for precision
      const shares = Math.floor(rawShares * 100) / 100;
      const actualCost = parseFloat((shares * executionPrice).toFixed(4));
      const potentialPayout = side === 'BUY' ? parseFloat((shares * 1.00).toFixed(2)) : 0;
      const potentialProfit = side === 'BUY' ? parseFloat((potentialPayout - actualCost).toFixed(2)) : 0;

      console.log(`[Sidecar] Executing ${side} for ${shares} shares @ $${executionPrice} (Total: $${actualCost})`);

      // Construct order payload for Polymarket CLOB
      const userOrder = {
        tokenID: tokenId,
        price: parseFloat(executionPrice.toFixed(3)),
        size: shares,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
      };

      // Create and submit order to Polymarket CLOB
      const response = await this.client.createAndPostOrder(
        userOrder,
        undefined,
        req.orderType === 'MARKET' ? (OrderType.FOK as any) : (OrderType.GTC as any)
      );

      console.log('[Sidecar] CLOB Order Response:', response);

      return {
        success: true,
        orderId: response?.orderID || response?.id || `ord-${Date.now()}`,
        shares,
        price: executionPrice,
        totalCost: actualCost,
        potentialProfit,
        message: `Order ${side} ${req.outcome} berhasil dikirim! (${shares} kontrak @ ${(executionPrice * 100).toFixed(1)}¢)`,
        rawResponse: response,
      };
    } catch (err: any) {
      console.error('[Sidecar] Error executing order:', err);
      const errMsg = err?.response?.data?.error || err?.message || 'Gagal mengirim order ke Polymarket CLOB';
      return {
        success: false,
        message: `Gagal eksekusi: ${errMsg}`,
      };
    }
  }

  public async cancelOrder(orderId: string): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: false, message: 'CLOB Client tidak aktif' };
    }
    try {
      await this.client.cancelOrder({ orderID: orderId });
      return { success: true, message: `Order ${orderId} berhasil dibatalkan` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Gagal membatalkan order' };
    }
  }
}

export const clobManager = new ClobServiceManager();
