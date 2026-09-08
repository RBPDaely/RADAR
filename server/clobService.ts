import { Wallet, ethers } from 'ethers';
import { ClobClient, Side, OrderType, SignatureTypeV2, AssetType, UserOrderV2, UserMarketOrderV2 } from '@polymarket/clob-client-v2';
import { RadarCredentials, OrderRequest, OrderResponse, WalletStatus } from './types';
import { loadCredentials, saveCredentials } from './storage';

export const POLYGON_RPC_URL = 'https://polygon-bor-rpc.publicnode.com';
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

      // Ethers v6 compatibility patch for @polymarket/clob-client-v2
      (this.signer as any)._signTypedData = (domain: any, types: any, value: any) => {
        const cleanTypes = { ...types };
        delete cleanTypes.EIP712Domain;
        return (this.signer as any).signTypedData(domain, cleanTypes, value);
      };
      
      // Auto-resolve real proxy/funder wallet from Polymarket profile API
      console.log(`[Sidecar] Resolving funder/proxy wallet for signer ${this.signer.address}...`);
      const autoFunder = await this.resolveProxyWallet(this.signer.address);
      let funder = autoFunder || creds.funderAddress?.trim() || this.signer.address;
      creds.funderAddress = funder;
      console.log(`[Sidecar] Target funder address: ${funder}`);

      let apiCreds = undefined;
      if (creds.apiKey && creds.apiSecret && creds.apiPassphrase) {
        apiCreds = {
          key: creds.apiKey.trim(),
          secret: creds.apiSecret.trim(),
          passphrase: creds.apiPassphrase.trim(),
        };
      }

      // Try user signatureType or test POLY_PROXY / POLY_GNOSIS_SAFE
      let chosenSigType: SignatureTypeV2 = creds.signatureType !== undefined ? (creds.signatureType as SignatureTypeV2) : SignatureTypeV2.POLY_PROXY;
      if (funder.toLowerCase() === this.signer.address.toLowerCase() && creds.signatureType === undefined) {
        chosenSigType = SignatureTypeV2.EOA;
      }

      // Initialize CLOB v2 client
      this.client = new ClobClient({
        host: 'https://clob.polymarket.com',
        chain: 137,
        signer: this.signer as any,
        creds: apiCreds,
        signatureType: chosenSigType,
        funderAddress: funder,
        throwOnError: true,
      });

      // Check if API credentials work or need to be derived/created via L1 signature
      let testSuccess = false;
      if (apiCreds) {
        try {
          const testRes = await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          if (testRes && !(testRes as any).error) {
            testSuccess = true;
          }
        } catch (e) {
          testSuccess = false;
        }
      }

      // If credentials invalid or missing, derive via L1 signature
      if (!testSuccess) {
        try {
          console.log('[Sidecar] Deriving or creating API key from signer via L1 signature...');
          const derived = await this.client.createOrDeriveApiKey();
          if (derived && derived.key) {
            creds.apiKey = derived.key;
            creds.apiSecret = derived.secret;
            creds.apiPassphrase = derived.passphrase;
            apiCreds = {
              key: derived.key,
              secret: derived.secret,
              passphrase: derived.passphrase,
            };
            this.client = new ClobClient({
              host: 'https://clob.polymarket.com',
              chain: 137,
              signer: this.signer as any,
              creds: apiCreds,
              signatureType: chosenSigType,
              funderAddress: funder,
              throwOnError: true,
            });
            console.log('[Sidecar] API Key derived successfully:', derived.key.slice(0, 8) + '...');
          }
        } catch (e: any) {
          console.warn('[Sidecar] Auto-derive API key notice:', e.message || e);
        }
      }

      // Auto-detect whether POLY_PROXY (1) or POLY_GNOSIS_SAFE (2) holds the balance
      const sigTypesToTry = [chosenSigType, SignatureTypeV2.POLY_PROXY, SignatureTypeV2.POLY_GNOSIS_SAFE];
      for (const st of sigTypesToTry) {
        try {
          const candidateClient = new ClobClient({
            host: 'https://clob.polymarket.com',
            chain: 137,
            signer: this.signer as any,
            creds: apiCreds,
            signatureType: st,
            funderAddress: funder,
            throwOnError: true,
          });
          const balRes = await candidateClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          if (balRes && !(balRes as any).error) {
            const numBal = parseFloat(balRes.balance || '0');
            console.log(`[Sidecar] Checked signatureType ${st}: balance = ${numBal / 1e6}`);
            if (numBal > 0 || st === chosenSigType) {
              this.client = candidateClient;
              chosenSigType = st;
              break;
            }
          }
        } catch (err) {
          // continue
        }
      }

      creds.signatureType = chosenSigType;
      this.currentCreds = creds;
      saveCredentials(creds);
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

      // 1. Primary Source of Truth: CLOB balance & allowances
      if (this.client) {
        try {
          const clobBal = await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          if (clobBal && !clobBal.error) {
            clobAuthValid = true;
            if (clobBal.balance !== undefined) {
              usdcBalance = parseFloat(clobBal.balance) / 1e6;
            }
            if (clobBal.allowances) {
              hasAllowance = Object.values(clobBal.allowances).some((a: any) => {
                try {
                  return BigInt(a) > 0n;
                } catch {
                  return false;
                }
              });
            }
          }
        } catch (clobErr: any) {
          console.warn('[Sidecar] CLOB balance check notice:', clobErr.message || clobErr);
        }
      }

      // 2. Secondary fallback: On-chain RPC balance
      if (usdcBalance === 0) {
        try {
          const usdcContract = new ethers.Contract(USDC_E_POLYGON, ERC20_ABI, this.provider);
          const bal = await usdcContract.balanceOf(funder);
          const onchainBal = parseFloat(ethers.formatUnits(bal, 6));
          if (onchainBal > 0) {
            usdcBalance = onchainBal;
          }

          if (!hasAllowance) {
            const allow = await usdcContract.allowance(funder, CTF_EXCHANGE_POLYGON);
            hasAllowance = allow > 0n;
          }
        } catch (rpcErr) {
          console.warn('[Sidecar] Polygon RPC check notice:', rpcErr);
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

      // Determine base price
      let rawPrice = limitPrice && limitPrice > 0 && limitPrice < 1 ? limitPrice : 0.50;

      // If Market order, fetch latest midpoint from CLOB
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
                rawPrice = Math.min(0.99, Math.max(0.01, mid + buffer));
              }
            }
          }
        } catch (e) {
          console.warn('[Sidecar] Market price fetch fallback:', e);
        }
      }

      // Polymarket binary options tickSize is 0.01 (strictly 2 decimals)
      const executionPrice = Math.min(0.99, Math.max(0.01, Math.round(rawPrice * 100) / 100));

      let response: any;
      let shares = 0;
      let actualCost = 0;

      if (req.orderType === 'MARKET') {
        if (side === 'BUY') {
          // Polymarket CLOB V2 Market Buy:
          // 'amount' is collateral USD, must be >= $1.00 USD and has MAX 2 DECIMALS accuracy.
          actualCost = Math.round(Math.max(1.00, amountUsd || 1.00) * 100) / 100;
          shares = parseFloat((actualCost / executionPrice).toFixed(4));

          console.log(`[Sidecar] Executing MARKET BUY: $${actualCost.toFixed(2)} USD (est. ${shares} shares @ $${executionPrice})`);

          const userMarketOrder: UserMarketOrderV2 = {
            tokenID: tokenId,
            amount: actualCost, // USD collateral amount (strictly 2 decimals)
            price: executionPrice, // Max price / slippage cap (strictly 2 decimals)
            side: Side.BUY,
          };

          response = await this.client.createAndPostMarketOrder(
            userMarketOrder,
            undefined,
            OrderType.FOK
          );
        } else {
          // Polymarket CLOB V2 Market Sell:
          // 'amount' is the number of shares (contracts) to sell, rounded to 2 decimals.
          shares = Math.max(0.01, Math.round((req.shares || 1) * 100) / 100);
          actualCost = parseFloat((shares * executionPrice).toFixed(2));

          console.log(`[Sidecar] Executing MARKET SELL: ${shares} shares @ $${executionPrice} (Total: $${actualCost})`);

          const userMarketOrder: UserMarketOrderV2 = {
            tokenID: tokenId,
            amount: shares, // Shares to sell (strictly 2 decimals)
            price: executionPrice, // Min price / slippage floor (strictly 2 decimals)
            side: Side.SELL,
          };

          response = await this.client.createAndPostMarketOrder(
            userMarketOrder,
            undefined,
            OrderType.FOK
          );
        }
      } else {
        // LIMIT Order (GTC)
        if (side === 'BUY') {
          const targetUsd = Math.max(1.00, amountUsd || 1.00);
          shares = req.shares && req.shares > 0
            ? Math.round(req.shares * 100) / 100
            : Math.max(0.01, Math.round((targetUsd / executionPrice) * 100) / 100);
          actualCost = parseFloat((shares * executionPrice).toFixed(2));
        } else {
          shares = Math.max(0.01, Math.round((req.shares || 1) * 100) / 100);
          actualCost = parseFloat((shares * executionPrice).toFixed(2));
        }

        console.log(`[Sidecar] Executing LIMIT ${side}: ${shares} shares @ $${executionPrice} (Total: $${actualCost})`);

        const userOrder: UserOrderV2 = {
          tokenID: tokenId,
          price: executionPrice,
          size: shares,
          side: side === 'BUY' ? Side.BUY : Side.SELL,
        };

        response = await this.client.createAndPostOrder(
          userOrder,
          undefined,
          OrderType.GTC
        );
      }

      console.log('[Sidecar] CLOB Order Response:', response);

      // Strict validation: NEVER return success if rejected or errored
      if (!response || response.error || response.errorMsg || response.success === false || (response.status && response.status >= 400)) {
        const errorDetail = response?.errorMsg || response?.error || `HTTP ${response?.status || 'Error'}`;
        return {
          success: false,
          message: `Order ditolak Polymarket: ${typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail}`,
          rawResponse: response,
        };
      }

      const orderId = response.orderID || response.id || response.orderId;
      if (!orderId && !response.transactionsHashes?.length && !response.tradeIDs?.length) {
        return {
          success: false,
          message: `Order tidak terisi (harga tidak match atau dibatalkan oleh CLOB).`,
          rawResponse: response,
        };
      }

      const potentialPayout = side === 'BUY' ? parseFloat((shares * 1.00).toFixed(2)) : 0;
      const potentialProfit = side === 'BUY' ? parseFloat(Math.max(0, potentialPayout - actualCost).toFixed(2)) : 0;

      return {
        success: true,
        orderId: orderId || `ord-${Date.now()}`,
        shares,
        price: executionPrice,
        totalCost: actualCost,
        potentialProfit,
        message: `Order ${side} ${req.outcome} berhasil dipasang! (${shares} kontrak @ ${(executionPrice * 100).toFixed(1)}¢)`,
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

  public async resolveProxyWallet(signerAddress: string): Promise<string | null> {
    try {
      const clean = signerAddress.trim().toLowerCase();
      const res = await fetch(`https://polymarket.com/api/profile/userData?address=${clean}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.proxyWallet && ethers.isAddress(data.proxyWallet)) {
          return data.proxyWallet;
        }
      }
    } catch (e) {
      console.warn('[CLOB] Error resolving proxy wallet:', e);
    }
    return null;
  }

  public async getUserPositions(): Promise<any[]> {
    if (!this.currentCreds) return [];
    const funder = this.currentCreds.funderAddress || (this.signer ? this.signer.address : null);
    if (!funder) return [];

    try {
      const res = await fetch(`https://data-api.polymarket.com/positions?user=${funder.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.warn('[Sidecar] Error fetching positions:', err);
    }
    return [];
  }
}

export const clobManager = new ClobServiceManager();
