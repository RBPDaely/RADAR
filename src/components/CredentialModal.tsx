import React, { useState, useEffect, useMemo } from 'react';
import { ThemeMode } from '../types/market';
import { ethers } from 'ethers';
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
  BookOpen,
  Check,
  HelpCircle,
  Info,
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

  const [activeTab, setActiveTab] = useState<'form' | 'guide'>('form');

  const [funderAddress, setFunderAddress] = useState<string>('');
  const [signerPrivateKey, setSignerPrivateKey] = useState<string>('');
  const [builderSignerAddress, setBuilderSignerAddress] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');
  const [apiPassphrase, setApiPassphrase] = useState<string>('');
  const [signatureType, setSignatureType] = useState<number>(2); // 2 = POLY_GNOSIS_SAFE

  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [showSecret, setShowSecret] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{
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
  } | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Compute derived signer address in real-time from private key
  const derivedSignerAddress = useMemo(() => {
    try {
      const clean = signerPrivateKey.trim();
      if (!clean) return null;
      const formatted = clean.startsWith('0x') ? clean : `0x${clean}`;
      if (formatted.length === 66) {
        const w = new ethers.Wallet(formatted);
        return w.address;
      }
    } catch {
      return null;
    }
    return null;
  }, [signerPrivateKey]);

  // Check if derived signer address matches builder signer address
  const doesSignerMatchBuilder = useMemo(() => {
    if (!derivedSignerAddress || !builderSignerAddress.trim()) return null;
    return derivedSignerAddress.toLowerCase() === builderSignerAddress.trim().toLowerCase();
  }, [derivedSignerAddress, builderSignerAddress]);

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
        if (data.builderSignerAddress) {
          setBuilderSignerAddress(data.builderSignerAddress);
        }
        if (data.signatureType !== undefined) {
          setSignatureType(data.signatureType);
        }
      }
    } catch (e) {
      console.warn('[CredentialModal] Sidecar offline');
    }
  }

  async function handleSave() {
    if (!signerPrivateKey.trim()) {
      setFeedback({
        type: 'error',
        message: 'Signer Private Key wajib diisi untuk menandatangani EIP-712 order ke Polymarket CLOB.',
      });
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
          builderSignerAddress: builderSignerAddress.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          apiSecret: apiSecret.trim() || undefined,
          apiPassphrase: apiPassphrase.trim() || undefined,
          signatureType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', message: data.message || 'Kredensial berhasil disimpan dan diverifikasi!' });
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
        setBuilderSignerAddress('');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden font-mono flex flex-col max-h-[92vh] ${
          isDark ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#dbe0e7] text-slate-800'
        }`}
      >
        {/* Header Modal */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? 'border-[#2a2e39]' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-[#f0b90b]" />
            <span className="font-black text-sm text-white tracking-wide">KREDENSIAL TRADING POLYMARKET</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-700/40 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex border-b text-xs font-bold ${isDark ? 'border-[#2a2e39] bg-[#181c27]' : 'border-slate-200 bg-slate-100'}`}>
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex-1 py-2.5 px-4 text-center border-b-2 transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'form'
                ? 'border-[#f0b90b] text-[#f0b90b] bg-transparent font-black'
                : 'border-transparent text-[#787b86] hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Form Input Kredensial</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-2.5 px-4 text-center border-b-2 transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'guide'
                ? 'border-[#f0b90b] text-[#f0b90b] bg-transparent font-black'
                : 'border-transparent text-[#787b86] hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Panduan Akun Email / 2FA (Magic Link)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'guide' ? (
            /* =================== TAB 2: PANDUAN LENGKAP =================== */
            <div className="space-y-4 leading-relaxed">
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 text-xs flex items-start space-x-2.5">
                <Info className="w-5 h-5 text-[#f0b90b] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block mb-1">Mengapa Menu BUILDER Saja Belum Cukup?</strong>
                  Menu <strong>BUILDER</strong> di Polymarket memberikan Anda API KEY L2 dan Public Address (Alamat Signer).
                  Namun, pesanan trading Polymarket adalah smart contract order berbasis <strong>EIP-712</strong> yang wajib ditandatangani dengan <strong>Private Key</strong>. Menu Builder sengaja tidak menampilkan Private Key demi keamanan browser Anda.
                </div>
              </div>

              <div className="space-y-3 text-[#d1d4dc]">
                <h4 className="font-bold text-white text-sm flex items-center space-x-2">
                  <span className="w-5 h-5 rounded-full bg-[#f0b90b] text-black text-[11px] font-black flex items-center justify-center">1</span>
                  <span>Ambil Signer Private Key dari Portal Resmi Magic Link:</span>
                </h4>
                <p className="text-[#787b86] pl-7">
                  Polymarket menggunakan <strong>Magic Link</strong> untuk akun Email + 2FA / Google. Magic menyediakan portal resmi mandiri untuk mengekspor Private Key Anda:
                </p>
                <div className="pl-7">
                  <a
                    href="https://reveal.magic.link/polymarket"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 font-bold transition-colors"
                  >
                    <span>https://reveal.magic.link/polymarket</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <ul className="list-disc pl-11 space-y-1 text-[#787b86]">
                  <li>Buka link di atas di browser Anda.</li>
                  <li>Masukkan <strong>alamat email</strong> yang sama persis dengan akun Polymarket Anda.</li>
                  <li>Masukkan kode 6 digit verifikasi (OTP) dari email / 2FA Anda.</li>
                  <li>
                    Magic Link akan menampilkan:
                    <br />
                    - <strong>Public Address</strong>: Alamat ini <em>pasti sama</em> dengan <code>Alamat Signer</code> di menu BUILDER Anda.
                    <br />
                    - <strong>Private Key</strong>: Kode rahasia 64 karakter (diawali <code>0x...</code>).
                  </li>
                  <li>Salin <strong>Private Key</strong> tersebut ke kolom Form Input RADAR.</li>
                </ul>

                <h4 className="font-bold text-white text-sm flex items-center space-x-2 pt-2 border-t border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-[#f0b90b] text-black text-[11px] font-black flex items-center justify-center">2</span>
                  <span>Ambil Alamat Safe / Funder (Tempat Saldo USDC.e):</span>
                </h4>
                <p className="text-[#787b86] pl-7">
                  Buka profil Polymarket Anda di{' '}
                  <a
                    href="https://polymarket.com/profile"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#f0b90b] underline"
                  >
                    polymarket.com/profile
                  </a>
                  . Salin alamat dompet profil Anda (misal <code>0x...</code>). Ini adalah dompet smart contract yang memegang saldo modal USDC.e Anda.
                </p>

                <h4 className="font-bold text-white text-sm flex items-center space-x-2 pt-2 border-t border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-[#f0b90b] text-black text-[11px] font-black flex items-center justify-center">3</span>
                  <span>Salin API Key &amp; Secret dari Menu BUILDER:</span>
                </h4>
                <p className="text-[#787b86] pl-7">
                  Di akun Polymarket Anda pada menu <strong>Settings -&gt; BUILDER</strong>:
                  <br />
                  - Salin <strong>API KEY</strong>, <strong>secret</strong>, dan <strong>passphrase</strong> ke form RADAR.
                  <br />
                  - Kredensial ini digunakan untuk autentikasi level 2 CLOB tanpa perlu query sign-in berulang.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className="w-full py-2 rounded-lg bg-[#f0b90b] text-black font-black text-xs hover:bg-[#e0ad0a] transition-colors"
                  >
                    Saya Mengerti, Lanjutkan ke Form Input →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* =================== TAB 1: FORM INPUT =================== */
            <div className="space-y-4">
              {/* Security Banner */}
              <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 text-[11px] flex items-start space-x-2">
                <ShieldCheck className="w-4 h-4 text-[#089981] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block mb-0.5">Keamanan Lokal 100% (Zero-Leak):</strong>
                  Kredensial disimpan terisolasi di berkas lokal sistem Anda (izin 0600). Kunci privat hanya digunakan sidecar lokal pada <code>127.0.0.1</code> untuk menandatangani EIP-712 payload ke smart contract Polymarket.
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-3">
                {/* 1. Funder / Safe Address */}
                <div>
                  <label className="block text-[10px] text-[#787b86] font-bold uppercase mb-1">
                    1. FUNDER ADDRESS (Alamat Safe Profil Polymarket): *
                  </label>
                  <input
                    type="text"
                    placeholder="0x... (Alamat dompet profil Anda tempat saldo USDC.e berada)"
                    value={funderAddress}
                    onChange={(e) => setFunderAddress(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition-all ${
                      isDark
                        ? 'bg-[#1e222d] border-[#2a2e39] text-white focus:border-[#f0b90b]'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-[#f0b90b]'
                    }`}
                  />
                  <span className="text-[10px] text-[#787b86] mt-0.5 block">
                    Cek di{' '}
                    <a
                      href="https://polymarket.com/profile"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#f0b90b] underline inline-flex items-center space-x-0.5"
                    >
                      <span>polymarket.com/profile</span>
                      <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                    </a>
                  </span>
                </div>

                {/* 2. Signer Private Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-[#787b86] font-bold uppercase">
                      2. SIGNER PRIVATE KEY (Export dari Magic Link): *
                    </label>
                    <div className="flex items-center space-x-2">
                      <a
                        href="https://reveal.magic.link/polymarket"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center space-x-0.5 font-bold"
                      >
                        <span>Buka Magic Link ↗</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        className="text-[10px] text-[#f0b90b] flex items-center space-x-1 hover:underline"
                      >
                        {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showPrivateKey ? 'Sembunyikan' : 'Tampilkan'}</span>
                      </button>
                    </div>
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
                  {derivedSignerAddress && (
                    <div className="mt-1 p-1.5 rounded bg-blue-950/30 border border-blue-500/30 text-[10px] text-blue-300 flex items-center justify-between">
                      <span>
                        Alamat Publik Terdeteksi: <strong className="text-white font-mono">{derivedSignerAddress}</strong>
                      </span>
                      {doesSignerMatchBuilder === true && (
                        <span className="text-emerald-400 font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Cocok dengan Builder!</span>
                        </span>
                      )}
                      {doesSignerMatchBuilder === false && (
                        <span className="text-rose-400 font-bold flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Beda dari Alamat Builder!</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Alamat Signer dari Builder Menu (Opsional Validasi) */}
                <div>
                  <label className="block text-[10px] text-[#787b86] font-bold uppercase mb-1">
                    3. ALAMAT SIGNER DARI MENU BUILDER (RELAYER_API_KEY_ADDRESS) (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="0x... (Alamat yang tertulis pada menu BUILDER -> Alamat Signer)"
                    value={builderSignerAddress}
                    onChange={(e) => setBuilderSignerAddress(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition-all ${
                      isDark
                        ? 'bg-[#1e222d] border-[#2a2e39] text-white focus:border-[#f0b90b]'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-[#f0b90b]'
                    }`}
                  />
                </div>

                {/* 4. Menu BUILDER Credentials */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#787b86] font-bold uppercase">
                      4. KREDENSIAL DARI MENU BUILDER (L2 API Credentials):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-[10px] text-[#f0b90b] flex items-center space-x-1 hover:underline"
                    >
                      {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showSecret ? 'Sembunyikan Secret' : 'Tampilkan Secret'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-[#787b86] mb-0.5">API KEY:</label>
                      <input
                        type="text"
                        placeholder="Salin dari menu BUILDER"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-lg border text-[11px] font-mono ${
                          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] text-[#787b86] mb-0.5">PASSPHRASE:</label>
                      <input
                        type={showSecret ? 'text' : 'password'}
                        placeholder="Salin dari menu BUILDER"
                        value={apiPassphrase}
                        onChange={(e) => setApiPassphrase(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-lg border text-[11px] font-mono ${
                          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-[#787b86] mb-0.5">SECRET:</label>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      placeholder="Salin dari menu BUILDER"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      className={`w-full px-2 py-1.5 rounded-lg border text-[11px] font-mono ${
                        isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                      }`}
                    />
                  </div>
                </div>

                {/* 5. Tipe Dompet / Signature Type */}
                <div className="pt-2 border-t border-slate-800">
                  <label className="block text-[10px] text-[#787b86] font-bold uppercase mb-1">
                    5. TIPE TANDA TANGAN (SIGNATURE TYPE):
                  </label>
                  <select
                    value={signatureType}
                    onChange={(e) => setSignatureType(parseInt(e.target.value, 10))}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${
                      isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-slate-300'
                    }`}
                  >
                    <option value={2}>POLY_GNOSIS_SAFE (Rekomendasi - Akun Email/Google)</option>
                    <option value={1}>POLY_PROXY (Akun Email Generasi Lama)</option>
                    <option value={0}>EOA (Metamask / Private Key Standar)</option>
                  </select>
                </div>
              </div>

              {/* Current Status Card */}
              {status && status.hasCredentials && (
                <div className="p-3 rounded-xl border border-[#089981]/40 bg-[#089981]/10 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[#089981] font-bold">
                    <div className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Kredensial Aktif &amp; Terhubung</span>
                    </div>
                    {status.clobAuthValid && (
                      <span className="text-[10px] bg-[#089981]/20 text-[#089981] px-2 py-0.5 rounded border border-[#089981]/40 font-mono">
                        CLOB AUTH OK
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#787b86]">
                    Funder (Safe):{' '}
                    <span className="text-white font-mono">
                      {status.funderAddress?.slice(0, 10)}...{status.funderAddress?.slice(-6)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#787b86]">
                    Signer EOA:{' '}
                    <span className="text-white font-mono">
                      {status.signerAddress?.slice(0, 10)}...{status.signerAddress?.slice(-6)}
                    </span>
                    {status.signerMatchesBuilder && (
                      <span className="ml-1 text-emerald-400 font-bold"> (Cocok dengan Builder)</span>
                    )}
                  </div>
                  {status.usdcBalance !== undefined && (
                    <div className="text-[10px] text-[#787b86]">
                      Saldo USDC.e (Polygon):{' '}
                      <strong className="text-[#f0b90b] text-xs">${status.usdcBalance.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback Alert */}
              {feedback && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-950/40 border-[#089981] text-emerald-300'
                      : 'bg-rose-950/40 border-[#f23645] text-rose-300'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}
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
              Tutup
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
