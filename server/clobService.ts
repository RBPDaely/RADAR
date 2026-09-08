import { Wallet, ethers } from 'ethers';
import { ClobClient, Side, OrderType, SignatureType, AssetType } from '@polymarket/clob-client';
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

      // Ethers v6 compatibility patch for @polymarket/clob-client
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
      let chosenSigType = creds.signatureType !== undefined ? creds.signatureType : SignatureType.POLY_PROXY;
      if (funder.toLowerCase() === this.signer.address.toLowerCase() && creds.signatureType === undefined) {
        chosenSigType = SignatureType.EOA;
      }

      // Initialize CLOB client
      this.client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        this.signer as any,
        apiCreds,
        chosenSigType,
        funder
      );

      // Check if API credentials work or need to be derived/created via L1 signature
      let testSuccess = false;
      if (apiCreds) {
        try {
          const testRes = await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          if (testRes && !testRes.error) {
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
            this.client = new ClobClient(
              'https://clob.polymarket.com',
              137,
              this.signer as any,
              apiCreds,
              chosenSigType,
              funder
            );
            console.log('[Sidecar] API Key derived successfully:', derived.key.slice(0, 8) + '...');
          }
        } catch (e: any) {
          console.warn('[Sidecar] Auto-derive API key notice:', e.message || e);
        }
      }

      // Auto-detect whether POLY_PROXY (1) or POLY_GNOSIS_SAFE (2) holds the balance
      const sigTypesToTry = [chosenSigType, SignatureType.POLY_PROXY, SignatureType.POLY_GNOSIS_SAFE];
      for (const st of sigTypesToTry) {
        try {
          const candidateClient = new ClobClient(
            'https://clob.polymarket.com',
            137,
            this.signer as any,
            apiCreds,
            st,
            funder
          );
          const balRes = await candidateClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          if (balRes && !balRes.error) {
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
}

export const clobManager = new ClobServiceManager();
