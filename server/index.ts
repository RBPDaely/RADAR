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

      // 3. Save / Update Credentials
      if (url.pathname === '/api/credentials' && req.method === 'POST') {
        const body = (await req.json()) as RadarCredentials;
        if (!body.signerPrivateKey) {
          return jsonResponse({ success: false, message: 'Signer Private Key diperlukan.' }, 400);
        }

        saveCredentials(body);
        const initResult = await clobManager.initClient(body);
        if (!initResult.success) {
          return jsonResponse({ success: false, message: initResult.error || 'Gagal inisialisasi' }, 400);
        }

        const walletStatus = await clobManager.getWalletStatus();
        return jsonResponse({ success: true, message: 'Kredensial berhasil disimpan dan diverifikasi!', walletStatus });
      }

      // 4. Purge Credentials
      if (url.pathname === '/api/credentials' && req.method === 'DELETE') {
        purgeCredentials();
        clobManager.initFromStorage();
        return jsonResponse({ success: true, message: 'Seluruh kredensial lokal berhasil dihapus.' });
      }

      // 5. BUY Order
      if (url.pathname === '/api/order/buy' && req.method === 'POST') {
        const body = (await req.json()) as OrderRequest;
        const result = await clobManager.executeOrder(body, 'BUY');
        return jsonResponse(result, result.success ? 200 : 400);
      }

      // 6. SELL Order
      if (url.pathname === '/api/order/sell' && req.method === 'POST') {
        const body = (await req.json()) as OrderRequest;
        const result = await clobManager.executeOrder(body, 'SELL');
        return jsonResponse(result, result.success ? 200 : 400);
      }

      // 7. Cancel Order
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
