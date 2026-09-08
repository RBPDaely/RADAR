export interface RadarCredentials {
  funderAddress: string; // Polymarket Gnosis Safe / Proxy address
  signerPrivateKey: string; // Exported private key from Polymarket
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
}

export interface OrderRequest {
  asset: 'BTC' | 'ETH' | 'SOL';
  outcome: 'UP' | 'DOWN';
  tokenId: string;
  orderType: 'MARKET' | 'LIMIT';
  amountUsd: number;
  limitPrice?: number; // Price in decimal (e.g. 0.55 for 55c)
  slippageTolerance?: number; // e.g. 0.01 for 1%
}

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  shares?: number;
  price?: number;
  totalCost?: number;
  feeEstimated?: number;
  potentialProfit?: number;
  message: string;
  rawResponse?: any;
}

export interface WalletStatus {
  hasCredentials: boolean;
  funderAddress?: string;
  signerAddress?: string;
  usdcBalance?: number;
  proxyAllowance?: boolean;
  error?: string;
}
