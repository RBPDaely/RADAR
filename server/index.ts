import { clobManager } from './clobService';
import { loadCredentials, saveCredentials, purgeCredentials } from './storage';
import { RadarCredentials, OrderRequest } from './types';

const PORT = parseInt(process.env.SIDECAR_PORT || '3001', 10);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      // 1. Health check
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return jsonResponse({ status: 'ok', timestamp: Date.now(), sidecar: 'RADAR Local Trading Engine' });
      }

      // 2. Wallet & Credentials Status
      if (url.pathname === '/api/credentials/status' && req.method === 'GET') {
        const status = await clobManager.getWalletStatus();
        return jsonResponse(status);
      }

      // 2b. Auto-resolve Funder / Proxy Address from Signer Address
      if (url.pathname === '/api/credentials/resolve-funder' && req.method === 'GET') {
        const signerAddress = url.searchParams.get('signerAddress');
        if (!signerAddress) {
          return jsonResponse({ error: 'signerAddress is required' }, 400);
        }
        const proxyWallet = await clobManager.resolveProxyWallet(signerAddress);
        return jsonResponse({
          signerAddress,
          proxyWallet: proxyWallet || signerAddress,
          isDetected: !!proxyWallet,
        });
      }

      // 3. Save / Update Credentials
      if (url.pathname === '/api/credentials' && req.method === 'POST') {
        const body = (await req.json()) as RadarCredentials;
        const existing = loadCredentials();
        const rawKey = (body.signerPrivateKey || existing?.signerPrivateKey || '').trim().replace(/^["']|["']$/g, '');
        if (!rawKey) {
          return jsonResponse({
            success: false,
            message: 'Signer Private Key diperlukan untuk menandatangani EIP-712 order. Ekspor dari https://reveal.magic.link/polymarket dengan email akun Anda.',
          }, 400);
        }

        const effectiveKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;

        const mergedCreds: RadarCredentials = {
          funderAddress: body.funderAddress?.trim() || existing?.funderAddress || '',
          signerPrivateKey: effectiveKey,
          builderSignerAddress: body.builderSignerAddress?.trim() || existing?.builderSignerAddress,
          apiKey: body.apiKey?.trim() || existing?.apiKey,
          apiSecret: body.apiSecret?.trim() || existing?.apiSecret,
          apiPassphrase: body.apiPassphrase?.trim() || existing?.apiPassphrase,
          signatureType: (body.signatureType !== undefined && body.signatureType >= 0)
            ? body.signatureType
            : (existing?.signatureType ?? 1),
          isActive: true,
        };

        saveCredentials(mergedCreds);
        const initResult = await clobManager.initClient(mergedCreds);
        if (!initResult.success) {
          return jsonResponse({ success: false, message: initResult.error || 'Gagal inisialisasi' }, 400);
        }

        const walletStatus = await clobManager.getWalletStatus();
        let message = 'Kredensial berhasil disimpan dan diverifikasi!';
        const isSuccess = Boolean(walletStatus.clobAuthValid);
        if (isSuccess) {
          message = walletStatus.usdcBalance !== undefined
            ? `Kredensial diverifikasi! Saldo terdeteksi: $${walletStatus.usdcBalance.toFixed(2)}`
            : 'Kredensial berhasil disimpan dan terhubung ke Polymarket CLOB!';
        } else {
          message = walletStatus.error
            ? `Kredensial disimpan lokal, namun verifikasi CLOB gagal: ${walletStatus.error}`
            : 'Kredensial disimpan lokal, namun otentikasi CLOB Polymarket belum aktif. Jika memakai akun Email/Google, pastikan Funder Address diisi dengan alamat deposit Safe Anda.';
        }

        return jsonResponse({
          success: isSuccess,
          message,
          walletStatus,
        }, isSuccess ? 200 : 400);
      }

      // 4. Purge Credentials
      if (url.pathname === '/api/credentials' && req.method === 'DELETE') {
        purgeCredentials();
        clobManager.purgeState();
        return jsonResponse({ success: true, message: 'Seluruh kredensial dan sesi aktif berhasil dihapus dari perangkat ini.' });
      }

      // 4b. Toggle Active Status (Nonaktifkan / Aktifkan di Perangkat Ini)
      if (url.pathname === '/api/credentials/toggle' && req.method === 'POST') {
        const body = (await req.json()) as { active: boolean };
        await clobManager.toggleActive(!!body.active);
        const walletStatus = await clobManager.getWalletStatus();
        return jsonResponse({
          success: true,
          isActive: !!body.active,
          message: body.active
            ? 'Kredensial berhasil diaktifkan kembali di perangkat ini.'
            : 'Kredensial berhasil dinonaktifkan di perangkat ini. Terminal beralih ke mode Read-Only.',
          walletStatus,
        });
      }

      // 5. Positions
      if (url.pathname === '/api/positions' && req.method === 'GET') {
        const positions = await clobManager.getUserPositions();
        return jsonResponse({ success: true, positions });
      }

      // 6. BUY Order
      if (url.pathname === '/api/order/buy' && req.method === 'POST') {
        const body = (await req.json()) as OrderRequest;
        const result = await clobManager.executeOrder(body, 'BUY');
        return jsonResponse(result, result.success ? 200 : 400);
      }

      // 7. SELL Order
      if (url.pathname === '/api/order/sell' && req.method === 'POST') {
        const body = (await req.json()) as OrderRequest;
        const result = await clobManager.executeOrder(body, 'SELL');
        return jsonResponse(result, result.success ? 200 : 400);
      }

      // 8. Cancel Order
      if (url.pathname.startsWith('/api/order/') && req.method === 'DELETE') {
        const orderId = url.pathname.replace('/api/order/', '');
        if (!orderId) return jsonResponse({ success: false, message: 'Order ID tidak ditemukan' }, 400);
        const result = await clobManager.cancelOrder(orderId);
        return jsonResponse(result);
      }

      return jsonResponse({ error: 'Route not found' }, 404);
    } catch (err: any) {
      console.error('[Sidecar HTTP] Error handling request:', err);
      return jsonResponse({ success: false, message: err.message || 'Internal server error' }, 500);
    }
  },
});

console.log(`[RADAR Sidecar] Server listening on http://127.0.0.1:${PORT}`);
