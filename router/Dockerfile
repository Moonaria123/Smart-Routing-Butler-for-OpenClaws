# 路由引擎 Docker 镜像——构建阶段安装依赖，运行阶段无 gcc，减小攻击面
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
COPY wheels/ ./wheels/
RUN set -e; \
    if ls wheels/*.whl 1>/dev/null 2>&1; then \
      pip install --no-cache-dir --no-index --find-links ./wheels -r requirements.txt; \
    else \
      pip install --no-cache-dir --timeout 120 -r requirements.txt || \
      pip install --no-cache-dir --timeout 120 -r requirements.txt; \
    fi

FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY app/ ./app/

VOLUME ["/root/.cache/fastembed"]

EXPOSE 8001

ENV UVICORN_WORKERS=1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers ${UVICORN_WORKERS}"]
