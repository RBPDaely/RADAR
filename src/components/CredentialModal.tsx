import React, { useState, useEffect, useMemo } from 'react';
import { ThemeMode } from '../types/market';
import { getSidecarUrl } from '../config';
import { ethers } from 'ethers';
import {
  Key,
  Shield,
  ShieldCheck,
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
  Info,
  Sparkles,
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
  const [signatureType, setSignatureType] = useState<number>(-1); // -1 = Auto-Detect

  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [showSecret, setShowSecret] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResolvingFunder, setIsResolvingFunder] = useState<boolean>(false);
  const [status, setStatus] = useState<{
    hasCredentials: boolean;
    isActive?: boolean;
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

  // Automatically attempt to detect Funder Address if empty and signer address is known
  useEffect(() => {
    const candidate = derivedSignerAddress || (builderSignerAddress.trim().startsWith('0x') ? builderSignerAddress.trim() : null);
    if (candidate && !funderAddress) {
      autoDetectFunder(candidate);
    }
  }, [derivedSignerAddress, builderSignerAddress]);

  async function autoDetectFunder(targetAddr?: string) {
    const addr = targetAddr || derivedSignerAddress || (builderSignerAddress.trim().startsWith('0x') ? builderSignerAddress.trim() : null);
    if (!addr) {
      setFeedback({
        type: 'error',
        message: 'Masukkan Signer Private Key atau Alamat Signer menu Builder terlebih dahulu untuk deteksi otomatis.',
      });
      return;
    }

    setIsResolvingFunder(true);
    try {
      // 1. Try sidecar resolution
      try {
        const res = await fetch(`${getSidecarUrl()}/api/credentials/resolve-funder?signerAddress=${addr}`);
        if (res.ok) {
          const data = await res.json();
          if (data.proxyWallet && data.isDetected) {
            setFunderAddress(data.proxyWallet);
            setFeedback({
              type: 'success',
              message: `Funder Address (Proxy Safe) berhasil terdeteksi otomatis: ${data.proxyWallet.slice(0, 10)}...${data.proxyWallet.slice(-6)}`,
            });
            setIsResolvingFunder(false);
            return;
          }
        }
      } catch (e) {
        // Fallback to direct Polymarket API fetch if sidecar is unavailable
      }

      // 2. Fallback direct Gamma API query
      try {
        const gammaRes = await fetch(`https://gamma-api.polymarket.com/public-profile?address=${addr.toLowerCase()}`);
        if (gammaRes.ok) {
          const gammaData = await gammaRes.json();
          if (gammaData && gammaData.proxyWallet) {
            setFunderAddress(gammaData.proxyWallet);
            setFeedback({
              type: 'success',
              message: `Funder Address (Proxy Safe) berhasil terdeteksi via Gamma API: ${gammaData.proxyWallet.slice(0, 10)}...${gammaData.proxyWallet.slice(-6)}`,
            });
            return;
          }
        }
      } catch (ge) {}

      // 3. Fallback direct Polymarket API query
      const url = `https://polymarket.com/api/profile/userData?address=${addr.toLowerCase()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const safeAddr = data.proxyWallet || data.address;
        if (safeAddr) {
          setFunderAddress(safeAddr);
          setFeedback({
            type: 'success',
            message: `Funder Address (Proxy Safe) berhasil terdeteksi: ${safeAddr.slice(0, 10)}...${safeAddr.slice(-6)}`,
          });
          return;
        }
      }
      setFeedback({
        type: 'error',
        message: 'Tidak dapat menemukan Proxy Safe untuk Signer ini. Silakan salin Funder Address manual dari profil Polymarket Anda.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Gagal deteksi otomatis: ${err.message}`,
      });
    } finally {
      setIsResolvingFunder(false);
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${getSidecarUrl()}/api/credentials/status`);
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

  async function handleToggleActive(targetState: boolean) {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${getSidecarUrl()}/api/credentials/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: targetState }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: targetState
            ? 'Kredensial berhasil diaktifkan di perangkat ini.'
            : 'Kredensial dinonaktifkan di perangkat ini. Terminal beralih ke mode Read-Only.',
        });
        fetchStatus();
      } else {
        setFeedback({ type: 'error', message: data.message || 'Gagal mengubah status aktif kredensial.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Gagal menghubungi server sidecar: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!status?.hasCredentials && !signerPrivateKey.trim()) {
      setFeedback({
        type: 'error',
        message: 'Signer Private Key wajib diisi untuk setup awal kredensial ke Polymarket CLOB.',
      });
      return;
    }

    if (!funderAddress.trim() && signatureType !== 0) {
      const proceed = confirm(
        '⚠️ PERINGATAN FUNDER ADDRESS KOSONG!\n\n' +
        'Jika akun Polymarket Anda login via Email / Google (Magic Link), Anda WAJIB mengisi Funder Address dengan alamat deposit Polygon Anda (dari situs Polymarket -> Deposit -> Crypto).\n\n' +
        'Jika dibiarkan kosong, saldo Anda akan terbaca $0.00 dan transaksi akan ditolak CLOB.\n\n' +
        'Apakah Anda yakin ingin tetap menyimpan tanpa Funder Address?'
      );
      if (!proceed) return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`${getSidecarUrl()}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funderAddress: funderAddress.trim() || undefined,
          signerPrivateKey: signerPrivateKey.trim() || undefined,
          builderSignerAddress: builderSignerAddress.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          apiSecret: apiSecret.trim() || undefined,
          apiPassphrase: apiPassphrase.trim() || undefined,
          signatureType,
        }),
      });

      const data = await res.json();
      if (data.walletStatus) {
        setStatus(data.walletStatus);
        if (data.walletStatus.funderAddress) {
          setFunderAddress(data.walletStatus.funderAddress);
        }
        if (data.walletStatus.signatureType !== undefined) {
          setSignatureType(data.walletStatus.signatureType);
        }
      }

      if (res.ok && data.success) {
        setFeedback({ type: 'success', message: data.message || 'Kredensial berhasil disimpan dan diverifikasi!' });
        setSignerPrivateKey(''); // Clear input for security
        fetchStatus();
      } else {
        setFeedback({ type: 'error', message: data.message || 'Gagal memverifikasi kredensial ke Polymarket CLOB.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Koneksi gagal: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePurge() {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh kredensial trading dari penyimpanan lokal dan memori server perangkat ini?')) {
      return;
    }

    try {
      const res = await fetch(`${getSidecarUrl()}/api/credentials`, { method: 'DELETE' });
      if (res.ok) {
        setFunderAddress('');
        setSignerPrivateKey('');
        setBuilderSignerAddress('');
        setApiKey('');
        setApiSecret('');
        setApiPassphrase('');
        setStatus(null);
        setFeedback({ type: 'success', message: 'Seluruh kredensial dan sesi lokal berhasil dihapus total dari perangkat ini.' });
        fetchStatus();
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
            <span className={`font-black text-sm tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>
              KREDENSIAL TRADING POLYMARKET
            </span>
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
            <span>Panduan &amp; Cara Dapatkan Alamat</span>
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
                  <strong className="text-white block mb-1">Panduan Alamat Funder &amp; Signer</strong>
                  Anda tidak perlu bingung mencari Funder Address. RADAR sudah dilengkapi fitur deteksi otomatis langsung dari akun Anda!
                </div>
              </div>

              <div className="space-y-3 text-[#d1d4dc]">
                {/* Bagian Funder Address */}
                <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-2">
                  <h4 className="font-bold text-white text-sm flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span>Cara 1: Deteksi Otomatis Funder (Paling Mudah)</span>
                  </h4>
                  <p className="text-[#a0aec0] text-[11px] leading-relaxed">
                    Anda <strong>TIDAK PERLU</strong> mengisi Funder Address secara manual! Cukup masukkan <strong>Signer Private Key</strong> atau <strong>Alamat Signer</strong> menu Builder Anda, lalu klik tombol <strong>⚡ Deteksi Otomatis</strong> di form. RADAR akan memanggil API Polymarket dan mengisi Funder Address Anda secara instan.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-[#181c27] space-y-2">
                  <h4 className="font-bold text-white text-sm flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-[#f0b90b]" />
                    <span>Cara 2: Melihat Funder Address di Web Polymarket Secara Manual</span>
                  </h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-[#a0aec0] text-[11px]">
                    <li>
                      <strong>Melalui Tombol Deposit (Paling Cepat)</strong>:
                      <br />
                      Buka situs Polymarket di browser, klik tombol biru <strong>"Deposit"</strong> di pojok kanan atas.
                      Pilih tab <strong>"Crypto"</strong>. Di layar akan tertera alamat: <em>"Send to your Polygon address: <code>0x...</code>"</em>. Alamat deposit inilah Funder Address Anda!
                    </li>
                    <li>
                      <strong>Melalui Halaman Profil</strong>:
                      <br />
                      Klik avatar/foto profil Anda di pojok kanan atas -&gt; pilih <strong>"Profile"</strong>. Tepat di bawah nama pengguna Anda, ada deretan alamat <code>0x...</code> dengan tombol salin (copy).
                    </li>
                  </ul>
                </div>

                <h4 className="font-bold text-white text-sm flex items-center space-x-2 pt-2 border-t border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-[#f0b90b] text-black text-[11px] font-black flex items-center justify-center">!</span>
                  <span>Ambil Signer Private Key dari Portal Magic Link:</span>
                </h4>
                <p className="text-[#787b86] pl-7">
                  Buka portal resmi Magic Link Polymarket di browser Anda:
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
                  <li>Masukkan <strong>email akun Polymarket</strong> Anda.</li>
                  <li>Masukkan kode 6 digit OTP dari email Anda.</li>
                  <li>Salin <strong>Private Key</strong> 64 karakter (diawali <code>0x...</code>) ke form RADAR.</li>
                </ul>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className="w-full py-2.5 rounded-lg bg-[#f0b90b] text-black font-black text-xs hover:bg-[#e0ad0a] transition-colors"
                  >
                    Saya Mengerti, Kembali ke Form Input →
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-[#f0b90b] font-bold uppercase flex items-center space-x-1">
                      <span>1. FUNDER ADDRESS (Alamat Deposit Polygon Akun Anda):</span>
                      <span className="text-rose-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => autoDetectFunder()}
                      disabled={isResolvingFunder}
                      className="text-[10px] text-[#f0b90b] hover:underline flex items-center space-x-1 font-bold bg-[#f0b90b]/10 px-2 py-0.5 rounded border border-[#f0b90b]/30"
                    >
                      {isResolvingFunder ? (
                        <Loader2 className="w-3 h-3 animate-spin text-[#f0b90b]" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-[#f0b90b]" />
                      )}
                      <span>{isResolvingFunder ? 'Mendeteksi...' : '⚡ Coba Deteksi Otomatis'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="0x... (Salin dari polymarket.com -> Tombol 'Deposit' -> Tab Crypto)"
                    value={funderAddress}
                    onChange={(e) => setFunderAddress(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition-all ${
                      isDark
                        ? 'bg-[#1e222d] border-[#2a2e39] text-white focus:border-[#f0b90b]'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-[#f0b90b]'
                    }`}
                  />
                  <div className="text-[10px] text-[#a0aec0] mt-1 leading-relaxed">
                    💡 <strong>Wajib untuk Akun Email/Google (Magic Link):</strong> Buka <strong>polymarket.com</strong> -&gt; klik tombol <strong>Deposit</strong> (kanan atas) -&gt; tab <strong>Crypto</strong> -&gt; salin alamat Polygon (<code>0x...</code>) ke sini.
                  </div>
                </div>

                {/* 2. Signer Private Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-[#787b86] font-bold uppercase">
                      2. SIGNER PRIVATE KEY (Export dari Magic Link): {status?.hasCredentials ? '(Tersimpan - Boleh Kosong jika tidak diubah)' : '*'}
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
                    placeholder={
                      status?.hasCredentials
                        ? '●●●●●●●● (Kunci tersimpan aman. Kosongkan jika hanya memperbarui API Key hasil Reset Akses)'
                        : '0x... (Private Key untuk menandatangani EIP-712 order)'
                    }
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
                        Alamat Signer Anda: <strong className="text-white font-mono">{derivedSignerAddress}</strong>
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
                    <option value={-1}>Auto-Detect (Rekomendasi - Otomatis Cek Saldo Proxy/Safe/EOA)</option>
                    <option value={1}>POLY_PROXY (Polymarket Proxy Wallet - Akun Email/Google)</option>
                    <option value={2}>POLY_GNOSIS_SAFE (Gnosis Safe - Browser / Smart Contract Wallet)</option>
                    <option value={0}>EOA (Metamask / Web3 Private Key Standar)</option>
                  </select>
                </div>
              </div>

              {/* Current Status Card */}
              {status && status.hasCredentials && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                    status.isActive !== false
                      ? 'border-[#089981]/40 bg-[#089981]/10 text-emerald-300'
                      : 'border-amber-500/40 bg-amber-950/20 text-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center space-x-1.5">
                      {status.isActive !== false ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#089981]" />
                          <span className="text-[#089981]">Kredensial Aktif di Perangkat Ini</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                          <span className="text-amber-400">Kredensial Dinonaktifkan di Sini (Read-Only)</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {status.isActive !== false && (
                        status.clobAuthValid ? (
                          <span className="text-[10px] bg-[#089981]/20 text-[#089981] px-2 py-0.5 rounded border border-[#089981]/40 font-mono font-bold">
                            CLOB AUTH OK
                          </span>
                        ) : (
                          <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded border border-rose-500/40 font-mono font-bold">
                            CLOB AUTH FAILED
                          </span>
                        )
                      )}
                      {status.isActive !== false ? (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(false)}
                          disabled={isLoading}
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[11px] transition-all flex items-center space-x-1"
                        >
                          <span>⏸ Nonaktifkan di Sini</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(true)}
                          disabled={isLoading}
                          className="px-2.5 py-1 rounded bg-[#089981]/20 hover:bg-[#089981]/30 text-emerald-300 border border-[#089981]/40 font-bold text-[11px] transition-all flex items-center space-x-1"
                        >
                          <span>▶ Aktifkan Kembali</span>
                        </button>
                      )}
                    </div>
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
                  {status.isActive !== false && status.usdcBalance !== undefined && (
                    <div className="text-[10px] text-[#787b86]">
                      Saldo USDC.e / pUSD (Polygon):{' '}
                      <strong className="text-[#f0b90b] text-xs">${status.usdcBalance.toFixed(2)}</strong>
                    </div>
                  )}
                  {status.isActive !== false && !status.clobAuthValid && (
                    <div className="text-[11px] text-rose-300/90 leading-relaxed p-2.5 rounded bg-rose-950/40 border border-rose-500/30 space-y-1">
                      <div>
                        ⚠️ <strong>Koneksi Polymarket CLOB Belum Aktif:</strong> Kunci tersimpan di sistem lokal, namun autentikasi ke exchange gagal.
                      </div>
                      <div className="text-[10px] text-slate-300 pl-2 border-l border-rose-500/50">
                        {status.error ? (
                          <div className="text-rose-400 font-mono mb-1">{status.error}</div>
                        ) : null}
                        <div>Solusi cepat:</div>
                        <ul className="list-disc pl-4 space-y-0.5 mt-0.5 text-[#a0aec0]">
                          <li>Isi kolom <strong>Funder Address</strong> dengan alamat deposit Polygon dari web Polymarket.</li>
                          <li>Jika login via Email/Google, pastikan Signature Type adalah <strong>POLY_PROXY (Tipe 1)</strong>.</li>
                          <li>Pastikan jam sistem komputer Anda sinkron dengan waktu internet (NTP).</li>
                        </ul>
                      </div>
                    </div>
                  )}
                  {status.isActive === false && (
                    <div className="text-[11px] text-amber-300/90 leading-relaxed p-2 rounded bg-amber-950/40 border border-amber-500/20">
                      💡 <strong>Perangkat ini beralih ke mode pantau (Read-Only).</strong> Saldo dan posisi disembunyikan dan fungsi order dikunci, sehingga Anda dapat bebas mengoperasikan trading di perangkat lain tanpa bentrok!
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
