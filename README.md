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

## Panduan Cepat: Menjalankan RADAR pada Perangkat Baru

Gunakan langkah-langkah berikut ketika Anda mengkloning repositori ini ke komputer atau laptop baru:

### 1. Buka Terminal Bash
- Pada **Linux (Ubuntu / Linux Mint / Debian)**: Tekan kombinasi tombol `Ctrl` + `Alt` + `T` pada keyboard untuk membuka jendela terminal bash.
- Pastikan shell aktif Anda adalah bash:
  ```bash
  bash
  ```

### 2. Pastikan Runtime Bun Terpasang
RADAR menggunakan runtime performa tinggi [Bun](https://bun.sh). Jika perangkat Anda belum memiliki Bun, pasang cukup dengan 1 perintah:
```bash
curl -fsSL https://bun.sh/install | bash
```
Setelah pemasangan selesai, muat konfigurasi environment Anda:
```bash
source ~/.bashrc
```
Periksa apakah Bun sudah aktif:
```bash
bun -v
```

### 3. Kloning Repositori ke Perangkat Baru
Salin repositori ini ke folder tujuan (misal di folder Dokumen atau Home):
```bash
git clone <URL_REPO_ANDA>
cd RADAR
```

### 4. Jalankan Terminal RADAR (Cukup 1 Perintah)
Cukup jalankan script launcher berikut di terminal:
```bash
bash start.sh
```
> **Catatan Cerdas**: Script `start.sh` sudah diprogram otomatis. Jika folder `node_modules` belum ada pada perangkat baru, script akan **otomatis menjalankan `bun install`**, lalu langsung menyalakan **Trading Sidecar Server (Port 3001)** dan **Web UI Dashboard (Port 5173)** secara bersamaan!

### 5. Akses Terminal di Browser
Buka peramban (Chrome / Brave / Firefox) dan buka URL:
```
http://localhost:5173
```
*(Tekan `Ctrl + C` di jendela terminal kapan saja untuk mematikan seluruh layanan).*

---

## Panduan Pengaturan Kredensial Polymarket di Perangkat Baru

Agar RADAR dapat mendeteksi saldo dan mengeksekusi order dengan uang riil di perangkat baru:

1. Buka `http://localhost:5173` di peramban Anda.
2. Klik tombol **KREDENSIAL** (ikon perisai/kunci) di pojok kanan atas header.
3. Masukkan data akun Polymarket Anda dengan teliti:
   - **1. FUNDER ADDRESS (Alamat Deposit Polygon)**:
     - **WAJIB DIISI** jika Anda login via **Email / Google (Magic Link)**!
     - Cara ambil: Buka [polymarket.com](https://polymarket.com), klik tombol biru **Deposit** (kanan atas) -> pilih tab **Crypto** -> salin alamat Polygon (`0x...`).
     - *Catatan: Jangan kosongkan kolom ini. Akun Magic Link menyimpan saldo di Proxy Safe ini, bukan di alamat EOA Signer.*
   - **2. SIGNER PRIVATE KEY**:
     - Kunci privat dari portal Magic Link resmi Polymarket: [reveal.magic.link/polymarket](https://reveal.magic.link/polymarket).
     - Masukkan email akun Anda, ketik 6-digit OTP, lalu salin Private Key (`0x...`).
   - **3. SIGNATURE TYPE (Tipe Tanda Tangan)**:
     - Pilih **`POLY_PROXY` (Tipe 1)** jika Anda menggunakan akun **Email / Google**.
     - Pilih **`EOA` (Tipe 0)** jika Anda login menggunakan **MetaMask / Rabby / Private Key langsung**.
   - *Kolom Builder (API Key, Secret, Passphrase)*: Boleh dikosongkan. Engine Sidecar lokal akan otomatis men-*derive* API key secara kriptografis dari private key Anda.
4. Klik **Simpan & Verifikasi**.
   - Jika berhasil, badge hijau **CLOB AUTH OK** dan saldo USDC Anda akan langsung muncul di panel order!
   - Jika muncul **CLOB AUTH FAILED**, periksa pesan error spesifik yang tertera di kotak merah modal.

### Troubleshooting: Kredensial Gagal Diverifikasi di Perangkat Baru?
1. **Sidecar Belum Berjalan**: Pastikan menjalankan dengan `bash start.sh` (atau `bun run dev:all`), bukan hanya `bun run dev`. Sidecar harus aktif di port `3001`.
2. **Jam Komputer Belum Sinkron (NTP Drift)**: Polymarket CLOB menolak signature jika selisih waktu sistem >30 detik. Jalankan `sudo timedatectl set-ntp true` di Linux.
3. **Funder Address Salah**: Pastikan menyalin dari tombol **Deposit -> Crypto**, bukan alamat wallet sembarang.

> [!IMPORTANT]
> Kredensial Anda disimpan secara eksklusif di berkas lokal perangkat Anda (`.radar_credentials.json` dengan izin terisolasi `0600`). File ini sudah masuk dalam `.gitignore` sehingga **TIDAK AKAN PERNAH** bocor atau terunggah ke repositori publik. Oleh karena itu, wajar jika saat pertama kali kloning di perangkat baru statusnya adalah `NO KEYS`.

---

## Cheatsheet Perintah Terminal (Manual / Modular)

Jika Anda ingin menjalankan atau menguji komponen secara terpisah:

| Perintah | Fungsi |
| :--- | :--- |
| `bash start.sh` | **Cara Utama (1-Click)**: Otomatis install dependensi + jalankan Sidecar dan Frontend. |
| `bun run sidecar` | Menjalankan Trading Engine Sidecar (Port 3001) secara mandiri. |
| `bun run dev` | Menjalankan antarmuka web Vite (Port 5173) secara mandiri. |
| `bun run build` | Verifikasi tipe TypeScript (`tsc -b`) dan kompilasi produksi Vite. |
| `bun run lint` | Menjalankan linter kilat dengan `oxlint`. |

---

## Lisensi & Keamanan
MIT License - Dibuat untuk ekosistem trading presisi tinggi Polymarket. Seluruh modifikasi kode wajib melalui verifikasi ketat sebelum diterapkan ke repositori.
