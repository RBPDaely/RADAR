#!/usr/bin/env bash
# ==========================================================
# RADAR Trading Terminal - One-Click Launcher for Linux Mint
# ==========================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"

if ! command -v bun &> /dev/null; then
    echo "[Error] Bun runtime belum terpasang."
    echo "Pasang dengan perintah: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "======================================================"
echo "           RADAR TERMINAL PRO - POLYMARKET            "
echo "======================================================"
echo "[1/2] Menyalakan Trading Engine Sidecar (Port 3001)..."
bun run server/index.ts &
SIDECAR_PID=$!

echo "[2/2] Menyalakan Web UI Dashboard (Port 5173)..."
bun run dev &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "Menghentikan RADAR..."
    kill $SIDECAR_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "RADAR Berhasil Berjalan!"
echo "Akses Terminal di Browser: http://localhost:5173"
echo "Tekan Ctrl + C di terminal ini untuk berhenti."
echo "======================================================"

wait
