#!/usr/bin/env bash
# 预下载 Router 的 Python 依赖为 wheels，供 Docker 构建时离线安装，确保一次成功。
# 用法：bash scripts/download-router-wheels.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROUTER_DIR="$PROJECT_ROOT/router"
WHEELS_DIR="$ROUTER_DIR/wheels"

[ -f "$ROUTER_DIR/requirements.txt" ] || { echo "未找到 router/requirements.txt"; exit 1; }
mkdir -p "$WHEELS_DIR"

echo "正在下载 Router 依赖到 router/wheels/ ..."
(cd "$ROUTER_DIR" && pip download -r requirements.txt -d wheels)
COUNT=$(find "$WHEELS_DIR" -name "*.whl" 2>/dev/null | wc -l)
echo "已下载 $COUNT 个 wheel。执行 docker compose up -d --build 将离线安装，构建一次成功。"
