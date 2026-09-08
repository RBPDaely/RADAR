import React, { useState, useEffect } from 'react';
import { ThemeMode } from '../types/market';
import {
  Key,
  Shield,
  ShieldCheck,
  ShieldAlert,
  X,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wallet,
  ExternalLink,
} from 'lucide-react';

interface CredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: ThemeMode;
}

export const CredentialModal: React.FC<CredentialModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  const [funderAddress, setFunderAddress] = useState<string>('');
  const [signerPrivateKey, setSignerPrivateKey] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');
  const [apiPassphrase, setApiPassphrase] = useState<string>('');

  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [showSecret, setShowSecret] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{
    hasCredentials: boolean;
    funderAddress?: string;
    signerAddress?: string;
    usdcBalance?: number;
    proxyAllowance?: boolean;
    error?: string;
  } | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  async function fetchStatus() {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/credentials/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.funderAddress) {
          setFunderAddress(data.funderAddress);
        }
      }
    } catch (e) {
      console.warn('[CredentialModal] Sidecar offline');
    }
  }

  async function handleSave() {
    if (!signerPrivateKey.trim()) {
      setFeedback({ type: 'error', message: 'Signer Private Key wajib diisi untuk eksekusi order.' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('http://127.0.0.1:3001/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funderAddress: funderAddress.trim(),
          signerPrivateKey: signerPrivateKey.trim(),
          apiKey: apiKey.trim() || undefined,
          apiSecret: apiSecret.trim() || undefined,
          apiPassphrase: apiPassphrase.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', message: data.message || 'Kredensial berhasil disimpan!' });
        fetchStatus();
      } else {
        setFeedback({ type: 'error', message: data.message || 'Gagal memverifikasi kredensial.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Koneksi gagal: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePurge() {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh kredensial trading dari penyimpanan lokal?')) {
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:3001/api/credentials', { method: 'DELETE' });
      if (res.ok) {
        setFunderAddress('');
        setSignerPrivateKey('');
        setApiKey('');
        setApiSecret('');
        setApiPassphrase('');
        setStatus(null);
        setFeedback({ type: 'success', message: 'Seluruh kredensial lokal berhasil dihapus.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', message: 'Gagal menghubungi server sidecar.' });
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden font-mono flex flex-col max-h-[90vh] ${
          isDark ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#dbe0e7] text-slate-800'
        }`}
      >
        {/* Header Modal */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-[#f0b90b]" />
            <span className="font-black text-sm text-white">MANAJEMEN KREDENSIAL TRADING</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-700/40 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Security Notice */}
          <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 text-[11px] leading-relaxed flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-[#089981] flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block mb-0.5">Keamanan Tanpa Celah (Zero-Leak):</strong>
              Kredensial Anda disimpan 100% secara lokal pada mesin ini (berkas berizin 0600) dan hanya digunakan untuk menandatangani EIP-712 order ke Polymarket CLOB. Tidak ada data yang dikirim ke server pihak ketiga manapun.
            </div>
          </div>

          {/* Account Guide for Email/Google Users */}
          <div className={`p-3 rounded-xl border text-[11px] ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
            <span className="text-[#f0b90b] font-bold block mb-1">Panduan Akun Email / Google (Magic Link):</span>
            <ul className="list-disc pl-4 space-y-1 text-[#787b86]">
              <li>
                <strong>Funder Address</strong>: Alamat profil Polymarket Anda (Proxy Safe yang memegang saldo USDC.e).
              </li>
              <li>
                <strong>Signer Private Key</strong>: Kunci privat dari menu Polymarket <em>Settings -&gt; Export Private Key</em>.
              </li>
              <li>
                <strong>API Key &amp; Passphrase</strong>: Boleh dikosongkan jika belum ada (sidecar akan otomatis men-derive secara kriptografis melalui tanda tangan EIP-712).
              </li>
            </ul>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            {/* Funder / Proxy Address */}
            <div>
              <label className="block text-[10px] text-[#787b86] font-bold uppercase mb-1">
                Funder Address (Polymarket Proxy Wallet):
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={funderAddress}
                onChange={(e) => setFunderAddress(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition-all ${
                  isDark
                    ? 'bg-[#1e222d] border-[#2a2e39] text-white focus:border-[#f0b90b]'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-[#f0b90b]'
                }`}
              />
            </div>

            {/* Signer Private Key */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-[#787b86] font-bold uppercase">
                  Signer Private Key (Export dari Polymarket): *
                </label>
                <button
                  type="button"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="text-[10px] text-[#f0b90b] flex items-center space-x-1 hover:underline"
                >
                  {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPrivateKey ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
              </div>
              <input
                type={showPrivateKey ? 'text' : 'password'}
                placeholder="0x... (Private Key untuk menandatangani EIP-712 order)"
                value={signerPrivateKey}
                onChange={(e) => setSignerPrivateKey(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition-all ${
                  isDark
                    ? 'bg-[#1e222d] border-[#2a2e39] text-white focus:border-[#f0b90b]'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-[#f0b90b]'
                }`}
              />
            </div>

            {/* Optional API Credentials */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-[10px] text-[#787b86] font-bold block uppercase">
                API Credentials (Opsional - Auto Derived jika kosong):
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-[#787b86] mb-0.5">API KEY:</label>
                  <input
                    type="text"
                    placeholder="Auto-derived"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className={`w-full px-2 py-1.5 rounded-lg border text-[11px] ${
                      isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[9px] text-[#787b86] mb-0.5">PASSPHRASE:</label>
                  <input
                    type="password"
                    placeholder="Auto-derived"
                    value={apiPassphrase}
                    onChange={(e) => setApiPassphrase(e.target.value)}
                    className={`w-full px-2 py-1.5 rounded-lg border text-[11px] ${
                      isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-[#787b86] mb-0.5">API SECRET:</label>
                <input
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Auto-derived"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className={`w-full px-2 py-1.5 rounded-lg border text-[11px] ${
                    isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Current Status Card */}
          {status && status.hasCredentials && (
            <div className="p-3 rounded-xl border border-[#089981]/40 bg-[#089981]/10 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 text-[#089981] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Kredensial Aktif &amp; Terverifikasi</span>
              </div>
              <div className="text-[10px] text-[#787b86]">
                Proxy: <span className="text-white font-mono">{status.funderAddress?.slice(0, 10)}...{status.funderAddress?.slice(-6)}</span>
              </div>
              <div className="text-[10px] text-[#787b86]">
                Signer: <span className="text-white font-mono">{status.signerAddress?.slice(0, 10)}...{status.signerAddress?.slice(-6)}</span>
              </div>
              {status.usdcBalance !== undefined && (
                <div className="text-[10px] text-[#787b86]">
                  Saldo USDC.e: <strong className="text-[#f0b90b]">${status.usdcBalance.toFixed(2)}</strong>
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div
              className={`p-2 rounded-lg border text-xs flex items-center space-x-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/40 border-[#089981] text-emerald-300'
                  : 'bg-rose-950/40 border-[#f23645] text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`px-5 py-3.5 border-t flex items-center justify-between ${isDark ? 'bg-[#1e222d]/60 border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
          <button
            onClick={handlePurge}
            type="button"
            className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 text-xs font-bold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus Kredensial</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              type="button"
              className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-700/50 text-xs font-bold transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              type="button"
              className="px-4 py-1.5 rounded-lg bg-[#f0b90b] hover:bg-[#e0ad0a] text-black font-black text-xs transition-colors flex items-center space-x-1.5 shadow-md"
            >
              {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>Simpan &amp; Verifikasi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
