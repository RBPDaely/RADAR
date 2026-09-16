#!/usr/bin/env bash
# ==========================================================
# RADAR Trading Terminal - One-Click Launcher for Linux Mint & Ubuntu
# ==========================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v bun &> /dev/null; then
    echo "[Error] Bun runtime belum terpasang."
    echo "Pasang dengan perintah: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[Info] Folder node_modules belum ada. Memasang dependensi otomatis..."
    bun install
fi

# Pastikan port 3001 dan 5173 bebas dari sesi sebelumnya
if command -v fuser &> /dev/null; then
    fuser -k 3001/tcp &> /dev/null
    fuser -k 5173/tcp &> /dev/null
elif command -v lsof &> /dev/null; then
    lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null
    lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null
fi

echo "======================================================"
echo "           RADAR TERMINAL PRO - POLYMARKET            "
echo "======================================================"
echo "[1/2] Menyalakan Trading Engine Sidecar (Port 3001)..."
bun run server/index.ts &
SIDECAR_PID=$!

# Tunggu hingga sidecar siap merespon
for i in {1..10}; do
    if curl -s http://127.0.0.1:3001/api/health > /dev/null 2>&1; then
        break
    fi
    sleep 0.3
done

echo "[2/2] Menyalakan Web UI Dashboard (Port 5173)..."
bun run dev &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "Menghentikan RADAR..."
    kill $SIDECAR_PID $FRONTEND_PID 2>/dev/null
    if command -v fuser &> /dev/null; then
        fuser -k 3001/tcp &> /dev/null
        fuser -k 5173/tcp &> /dev/null
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "RADAR Berhasil Berjalan!"
echo "Akses Terminal di Browser: http://localhost:5173"
echo "Tekan Ctrl + C di terminal ini untuk berhenti."
echo "======================================================"

wait
