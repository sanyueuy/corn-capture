#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PROJECT_PATH="/projects"
BACKEND_LOG="$ROOT_DIR/backend/backend-dev.log"
FRONTEND_LOG="$ROOT_DIR/frontend/frontend-dev.log"

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1"
    exit 1
  fi
}

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

detect_lan_ip() {
  python3 - <<'PY'
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    sock.connect(("8.8.8.8", 80))
    print(sock.getsockname()[0])
except OSError:
    print("127.0.0.1")
finally:
    sock.close()
PY
}

print_qr() {
  local url="$1"
  "$ROOT_DIR/.venv/bin/python" - "$url" <<'PY'
import sys

import qrcode

url = sys.argv[1]
qr = qrcode.QRCode(border=1)
qr.add_data(url)
qr.make(fit=True)
for row in qr.get_matrix():
    line = "".join("██" if cell else "  " for cell in row)
    print(line)
PY
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local attempts=40
  local delay=0.5

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  echo "$name 启动超时，请查看日志："
  echo "  $BACKEND_LOG"
  echo "  $FRONTEND_LOG"
  return 1
}

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

require_command python3
require_command npm
require_command curl
require_command lsof

if port_in_use "$BACKEND_PORT"; then
  echo "端口 $BACKEND_PORT 已被占用，请先释放后再启动。"
  exit 1
fi

if port_in_use "$FRONTEND_PORT"; then
  echo "端口 $FRONTEND_PORT 已被占用，请先释放后再启动。"
  exit 1
fi

if [[ ! -d "$ROOT_DIR/.venv" ]]; then
  echo "创建 Python 虚拟环境..."
  python3 -m venv "$ROOT_DIR/.venv"
fi

if [[ ! -f "$ROOT_DIR/.venv/.backend-ready" ]]; then
  echo "安装后端依赖..."
  "$ROOT_DIR/.venv/bin/pip" install -r "$ROOT_DIR/backend/requirements.txt"
  touch "$ROOT_DIR/.venv/.backend-ready"
fi

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "安装前端依赖..."
  (cd "$ROOT_DIR/frontend" && npm install)
fi

LAN_IP="$(detect_lan_ip)"
BACKEND_LOCAL_URL="http://127.0.0.1:${BACKEND_PORT}"
BACKEND_LAN_URL="http://${LAN_IP}:${BACKEND_PORT}"
FRONTEND_LOCAL_URL="http://127.0.0.1:${FRONTEND_PORT}${PROJECT_PATH}"
FRONTEND_LAN_URL="http://${LAN_IP}:${FRONTEND_PORT}${PROJECT_PATH}"

trap cleanup EXIT INT TERM

echo "启动后端..."
"$ROOT_DIR/.venv/bin/uvicorn" backend.app.main:app \
  --host 0.0.0.0 \
  --port "$BACKEND_PORT" \
  >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo "启动前端..."
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

wait_for_url "$BACKEND_LOCAL_URL/api/health" "后端"
wait_for_url "$FRONTEND_LOCAL_URL" "前端"

echo
echo "前后端已启动"
echo "电脑访问地址:"
echo "  前端: $FRONTEND_LOCAL_URL"
echo "  后端: $BACKEND_LOCAL_URL"
echo
echo "手机同一局域网访问地址:"
echo "  前端: $FRONTEND_LAN_URL"
echo "  后端: $BACKEND_LAN_URL"
echo
echo "前端二维码:"
print_qr "$FRONTEND_LAN_URL"
echo
echo "日志文件:"
echo "  后端: $BACKEND_LOG"
echo "  前端: $FRONTEND_LOG"
echo
echo "按 Ctrl+C 可同时关闭前后端服务。"

if command -v open >/dev/null 2>&1; then
  open "$FRONTEND_LOCAL_URL" >/dev/null 2>&1 || true
fi

wait "$BACKEND_PID" "$FRONTEND_PID"
