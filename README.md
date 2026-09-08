# RADAR: Terminal Trading Pro Polymarket Kripto 5M UP/DOWN & Local Sidecar Engine

Terminal trading berlatensi rendah berstandar profesional untuk pasar **Polymarket Up & Down Kripto 5-Menit** (BTC, ETH, SOL). Dirancang khusus untuk penggunaan di **Localhost** pada monitor PC 1 layar penuh (zero-scroll), dilengkapi dengan **Local Trading Sidecar Server** untuk menangani eksekusi order EIP-712 tanpa membebani peramban, tombol instan **BUY / SELL**, kalkulator profit & fee real-time, grafik TradingView multi-timeframe tanpa bug, serta manajemen kredensial lokal berstandar keamanan tinggi (zero-leak).

---

## Fitur Utama RADAR

### 1. Desain 1 Layar Penuh Desktop PC (Zero-Scroll Viewport)
- Tata letak terkunci pada 1 layar penuh (`h-screen overflow-hidden`) tanpa perlu scrolling vertikal saat memantau pergerakan cepat 5 menit.
- **Kolom Kiri (~72% Layar)**: HUD Sentral Energi Duel UP/DOWN, Toolbar Timeframe, dan Kanvas TradingView Lightweight Charts v5 yang responsif.
- **Kolom Kanan (~28% Layar)**: Kartu TWAP Settlement, Panel Eksekusi Trading Instan, serta Tab Split Order Book & Live Tape.

### 2. Panel Eksekusi Order Instan & Kalkulator Profit Real-Time
- **Tombol BUY UP (Naik) & BUY DOWN (Turun)** dengan identifikasi visual warna kontras (Forest Green & Scarlet Red).
- Pilihan tipe order: **Market Order (Instan Fill)** dan **Limit Order (Antre Harga)**.
- **Preset Modal Cepat**: Tombol nominal instan `$5`, `$10`, `$25`, `$50`, `$100`, atau nominal kustom USD.
- **Kalkulator Finansial Otomatis**:
  - Harga per lembar kontrak (dalam sen ¢ dan dollar $).
  - Estimasi jumlah kontrak (shares) yang didapat.
  - Estimasi potongan fee CLOB.
  - Potensi Payout dan **Potensi Profit Bersih ($)** jika menang.
  - **Net ROI (%)** akurat sebelum menekan tombol kirim order.
  - Maksimum risiko (loss 100% modal yang dipasang).

### 3. Local Node.js / Bun Trading Sidecar Server
- Berjalan di background mesin lokal (`http://127.0.0.1:3001`).
- Mengisolasi tanda tangan kriptografis **EIP-712** dan komunikasi langsung ke `https://clob.polymarket.com`.
- **Dukungan Penuh Akun Email / Google**: Mendukung `SignatureType.POLY_PROXY` (Gnosis Safe Proxy) yang otomatis menyinkronkan saldo dompet USDC.e Anda di Polygon.
- Bebas CORS dan membuat peramban tetap ringan dengan framerate tinggi (60 FPS).

### 4. Grafik TradingView Multi-Timeframe Bebas Bug
- Pilihan resolusi: `5s`, `15s`, `30s` (mikro-candlestick), `1m`, `5m`, dan `15m`.
- Pemisahan skala harga yang bersih antara **SPOT ($)** dan **KONTRAK (¢)** tanpa tabrakan sumbu Y.
- Algoritma normalisasi timestamp *strictly ascending* yang mencegah canvas freeze atau error assertion pada lightweight-charts v5.
- Update garis harga (Strike dan Proyeksi Kecepatan 30s) berbasis mutasi options yang ringan di GPU/CPU.

### 5. Keamanan Kredensial Tanpa Celah (Zero-Leak Security)
- Kredensial (Proxy Wallet, Private Key, API Key/Secret/Passphrase) disimpan secara eksklusif di berkas lokal terproteksi (`.radar_credentials.json` berizin 0600).
- Berkas `.gitignore` diperketat untuk mencegah kunci pribadi atau kredensial terunggah ke repositori publik.
- Tombol **Hapus Kredensial (Purge)** untuk membersihkan data sensitif dari penyimpanan lokal seketika.

---

## Cara Menjalankan RADAR di Localhost

Pastikan Anda telah memasang [Bun](https://bun.sh) (atau Node.js v18+):

```bash
# 1. Jalankan Sidecar Trading Server (Terminal 1)
bun run sidecar

# 2. Jalankan Antarmuka Web Frontend (Terminal 2)
bun run dev
```

Buka peramban di `http://localhost:5173`.

---

## Panduan Pengaturan Akun Polymarket (Email / Google)

1. Buka antarmuka RADAR di `http://localhost:5173`.
2. Klik tombol **KREDENSIAL** di pojok kanan atas header.
3. Masukkan data akun Polymarket Anda:
   - **Funder Address**: Alamat dompet profil Polymarket Anda (Proxy Safe yang memegang saldo USDC.e).
   - **Signer Private Key**: Kunci privat yang diekspor dari akun Polymarket (*Settings -> Reveal Private Key*).
   - *API Key, Secret, Passphrase*: Boleh dikosongkan (server sidecar akan otomatis men-derive API key secara kriptografis).
4. Klik **Simpan & Verifikasi**. Saldo USDC.e Anda akan langsung terdeteksi pada terminal.

---

## Menjalankan Pengujian (Testing)

```bash
# Menjalankan unit test untuk TWAP Engine, Sanitasi Timestamp, dan Storage
bun test
```

---

## Lisensi
MIT License - Dibuat untuk ekosistem trading presisi tinggi Polymarket.
