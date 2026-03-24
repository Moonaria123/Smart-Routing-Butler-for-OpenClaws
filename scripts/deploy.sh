#!/usr/bin/env bash
# Smart Router Butler — Docker 一键部署（Linux / macOS / WSL）
# 拉取最新代码后用于上线/更新；验证清单见 docs/USER-VALIDATION.md
# 用法：
#   ./scripts/deploy.sh
#   SKIP_WHEELS_CHECK=1 ./scripts/deploy.sh
#   NO_CACHE=1 ./scripts/deploy.sh
#   SERVICES=dashboard ./scripts/deploy.sh
#   USE_RELEASE_IMAGES=1 ./scripts/deploy.sh   # 拉取 GHCR 预构建镜像（.env 中配置 GHCR_OWNER）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
if [[ "${USE_RELEASE_IMAGES:-}" == "1" ]]; then
  COMPOSE_FILE="docker-compose.release.yml"
fi

ENV_FILE="$ROOT/.env"
ENV_EXAMPLE="$ROOT/.env.example"
WHEELS_DIR="$ROOT/router/wheels"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "已从 .env.example 生成 .env，请按需修改敏感项后重新运行本脚本。"
    exit 0
  fi
  echo "错误：缺少 .env 和 .env.example" >&2
  exit 1
fi

echo ""
echo "[部署提示] 最小必配（.env 与 Compose 一致）："
echo "  - ENCRYPTION_KEY（32 字节随机串）"
echo "  - BETTER_AUTH_SECRET、BETTER_AUTH_URL（与访问 Dashboard 同源）"
echo "  - DATABASE_URL（与 postgres 账号库名一致）"
echo "  可选：宿主机端口默认见 compose/ports.env；冲突时在 .env 设 PROXY_PORT、DASHBOARD_PORT 等同名变量覆盖（后加载优先，CR-DEF-02）"
echo "  可选：CRON_SECRET — POST /api/cron/data-retention（Bearer）"
echo "  可选：REDIS_URL（默认 redis://redis:6379）"
echo ""
if [[ "${USE_RELEASE_IMAGES:-}" == "1" ]]; then
  echo "[预构建镜像] 使用 ${COMPOSE_FILE}；请确认 .env 中 GHCR_OWNER 为上游仓库的 GitHub 用户名（小写）。"
  echo ""
fi

ghcr_owner=""
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*GHCR_OWNER[[:space:]]*=[[:space:]]*(.+)$ ]]; then
    ghcr_owner="${BASH_REMATCH[1]//\"/}"
    ghcr_owner="${ghcr_owner//\'/}"
    ghcr_owner="$(echo "$ghcr_owner" | tr -d '[:space:]')"
  fi
done < "$ENV_FILE"
if [[ "${USE_RELEASE_IMAGES:-}" == "1" ]]; then
  if [[ -z "$ghcr_owner" || "$ghcr_owner" == "your-github-username" ]]; then
    echo "错误：USE_RELEASE_IMAGES=1 时请在 .env 中设置 GHCR_OWNER 为发布镜像的 GitHub 用户名（非占位符）。" >&2
    exit 1
  fi
fi

wheel_count=$(find "$WHEELS_DIR" -maxdepth 1 -name "*.whl" 2>/dev/null | wc -l | tr -d ' ')
if [[ "${USE_RELEASE_IMAGES:-}" != "1" && "${SKIP_WHEELS_CHECK:-}" != "1" && "$wheel_count" -eq 0 ]]; then
  echo "未检测到 router/wheels/*.whl。建议先运行: ./scripts/download-router-wheels.sh"
  echo "是否继续构建？[y/N]"
  read -r r
  if [[ ! "$r" =~ ^[yY]$ ]]; then
    exit 0
  fi
fi

DASHBOARD_PORT="3000"
PROXY_PORT="8080"
ROUTER_PORT="8001"
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*DASHBOARD_PORT[[:space:]]*=[[:space:]]*(.+)$ ]]; then
    DASHBOARD_PORT="${BASH_REMATCH[1]//\"/}"
    DASHBOARD_PORT="${DASHBOARD_PORT//\'/}"
    DASHBOARD_PORT="$(echo "$DASHBOARD_PORT" | tr -d '[:space:]')"
  fi
  if [[ "$line" =~ ^[[:space:]]*PROXY_PORT[[:space:]]*=[[:space:]]*(.+)$ ]]; then
    PROXY_PORT="${BASH_REMATCH[1]//\"/}"
    PROXY_PORT="${PROXY_PORT//\'/}"
    PROXY_PORT="$(echo "$PROXY_PORT" | tr -d '[:space:]')"
  fi
  if [[ "$line" =~ ^[[:space:]]*ROUTER_PORT[[:space:]]*=[[:space:]]*(.+)$ ]]; then
    ROUTER_PORT="${BASH_REMATCH[1]//\"/}"
    ROUTER_PORT="${ROUTER_PORT//\'/}"
    ROUTER_PORT="$(echo "$ROUTER_PORT" | tr -d '[:space:]')"
  fi
done < "$ENV_FILE"

IFS=',' read -ra SVC_ARRAY <<< "${SERVICES:-}"
for i in "${!SVC_ARRAY[@]}"; do
  SVC_ARRAY[i]="$(echo "${SVC_ARRAY[i]}" | xargs)"
done
# 去掉空元素
TMP=()
for s in "${SVC_ARRAY[@]}"; do
  [[ -n "$s" ]] && TMP+=("$s")
done
SVC_ARRAY=("${TMP[@]}")

if [[ "${USE_RELEASE_IMAGES:-}" == "1" ]]; then
  if [[ ${#SVC_ARRAY[@]} -gt 0 ]]; then
    echo "正在拉取并启动服务: ${SVC_ARRAY[*]}..."
    docker compose -f "$COMPOSE_FILE" pull "${SVC_ARRAY[@]}"
    docker compose -f "$COMPOSE_FILE" up -d "${SVC_ARRAY[@]}"
  else
    echo "正在拉取预构建镜像并启动所有服务..."
    docker compose -f "$COMPOSE_FILE" pull
    docker compose -f "$COMPOSE_FILE" up -d
  fi
elif [[ ${#SVC_ARRAY[@]} -gt 0 ]]; then
  echo "正在构建并启动服务: ${SVC_ARRAY[*]}..."
  if [[ "${NO_CACHE:-}" == "1" ]]; then
    docker compose -f "$COMPOSE_FILE" build --no-cache "${SVC_ARRAY[@]}"
    docker compose -f "$COMPOSE_FILE" up -d "${SVC_ARRAY[@]}"
  else
    docker compose -f "$COMPOSE_FILE" up -d --build "${SVC_ARRAY[@]}"
  fi
elif [[ "${NO_CACHE:-}" == "1" ]]; then
  echo "正在无缓存构建并启动所有服务..."
  docker compose -f "$COMPOSE_FILE" build --no-cache
  docker compose -f "$COMPOSE_FILE" up -d
else
  echo "正在构建并启动所有服务..."
  docker compose -f "$COMPOSE_FILE" up -d --build
fi

echo "等待 Dashboard 就绪..."
dashboard_url="http://localhost:${DASHBOARD_PORT}/"
max=60
n=0
ready=0
while [[ $n -lt $max ]]; do
  sleep 3
  if curl -sf -o /dev/null -m 2 "$dashboard_url" || curl -sf -o /dev/null -m 2 -I "$dashboard_url"; then
    ready=1
    break
  fi
  n=$((n + 1))
done

if [[ "$ready" -eq 0 ]]; then
  echo "Dashboard 未在预期内就绪，请稍后手动执行: docker compose -f ${COMPOSE_FILE} exec dashboard npx prisma migrate deploy"
else
  echo "执行数据库迁移..."
  docker compose -f "$COMPOSE_FILE" exec -T dashboard npx prisma migrate deploy
fi

echo ""
echo "========== 部署完成 =========="
echo "  Dashboard : http://localhost:${DASHBOARD_PORT}"
echo "  Proxy     : http://localhost:${PROXY_PORT}"
echo "  Router    : http://localhost:${ROUTER_PORT}"
echo ""
echo "【继续验证】"
echo "  - docs/USER-VALIDATION.md"
echo "  - docs/ISSUE-LOG.md"
echo "  - docs/TEST-PLAN.md"
echo "  - docs/DEPLOY-DOCKER.md"
echo ""
