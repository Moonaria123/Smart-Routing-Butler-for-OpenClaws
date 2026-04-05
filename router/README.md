# Smart Router — 路由引擎

Python FastAPI 服务：语义路由、Arch-Router L3、语义缓存。

## 开发与质量门控

- **依赖**：`pip install -r requirements.txt -r requirements-dev.txt`（含 **mypy**、**ruff**）。
- **类型检查**：
  ```bash
  python -m mypy app/ --strict
  ```
- **Lint**：`python -m ruff check app/`
- **契约集成测试**（需已启动的 Router，如 `docker compose up`）：
  ```bash
  pip install -r requirements.txt -r requirements-dev.txt
  set ROUTER_TEST_URL=http://127.0.0.1:8001
  python -m pytest
  ```
  未启动服务时整模块跳过（见 `router/tests/test_router_contract.py`）。
- Windows 上若未将工具加入 PATH，请统一使用 `python -m …`。
- **CI**：推送/PR 至 **main** / **master** 时由 **`.github/workflows/ci.yml`** 在 Ubuntu + Python 3.12 上执行 **ruff** 与 **mypy --strict**（见 **ISSUE-PL-11** / **`docs/FIX-REPORT.md` #65**）。若仓库使用 **GitLab CI**，请在 `.gitlab-ci.yml` 中镜像上述两条命令与工作目录 **`router/`**。

## 运行

见项目根目录 `docker-compose.yml`；服务端口 8001。
