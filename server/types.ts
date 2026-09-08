export interface RadarCredentials {
  funderAddress: string; // Polymarket Gnosis Safe / Proxy address
  signerPrivateKey: string; // Exported private key from reveal.magic.link/polymarket
  builderSignerAddress?: string; // Optional: RELAYER_API_KEY_ADDRESS from Builder menu to verify match
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
  signatureType?: number; // 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE (default 2)
}

export interface OrderRequest {
  asset: 'BTC' | 'ETH' | 'SOL';
  outcome: 'UP' | 'DOWN';
  tokenId: string;
  orderType: 'MARKET' | 'LIMIT';
  amountUsd?: number;
  shares?: number;
  side?: 'BUY' | 'SELL';
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
  builderSignerAddress?: string;
  signerMatchesBuilder?: boolean;
  signatureType?: number;
  clobAuthValid?: boolean;
  usdcBalance?: number;
  proxyAllowance?: boolean;
  error?: string;
}
