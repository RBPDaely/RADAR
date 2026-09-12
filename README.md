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

## Panduan Pengaturan Akun Polymarket (Email / Google)

Agar RADAR dapat mendeteksi saldo dan mengeksekusi order dengan uang riil:

1. Buka `http://localhost:5173` di browser Anda.
2. Klik tombol **KREDENSIAL** di pojok kanan atas header.
3. Masukkan data akun Polymarket Anda:
   - **Funder Address**: Alamat dompet profil Polymarket Anda (Proxy Safe yang memegang saldo USDC.e di Polygon). Dapat dilihat di profil Polymarket atau menu deposit.
   - **Signer Private Key**: Kunci privat yang diekspor dari akun Polymarket (*Menu Profile -> Settings -> Reveal Private Key*).
   - *API Key, Secret, Passphrase*: Boleh dikosongkan. Engine Sidecar lokal akan otomatis men-*derive* API key secara kriptografis dari private key Anda.
4. Klik **Simpan & Verifikasi**. Saldo USDC.e Anda akan langsung terdeteksi seketika pada header terminal.

> [!IMPORTANT]
> Kredensial Anda disimpan secara eksklusif di berkas lokal perangkat Anda (`.radar_credentials.json` dengan izin terisolasi `0600`). File ini sudah masuk dalam `.gitignore` sehingga **TIDAK AKAN PERNAH** bocor atau terunggah ke repositori publik.

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
