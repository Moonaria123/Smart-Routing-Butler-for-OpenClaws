# Smart Router — 路由引擎

Python FastAPI 服务：语义路由、Arch-Router L3、语义缓存。

## 开发与质量门控

- **依赖**：`pip install -r requirements.txt -r requirements-dev.txt`（含 **mypy**、**ruff**）。
- **类型检查**：
  ```bash
  python -m mypy app/ --strict
  ```
- **Lint**：`python -m ruff check app/`
- **说明**：对外发布的精简包中不包含 `router/tests/` 与 `pytest` 配置；质量门禁以 **ruff + mypy** 为准。
- Windows 上若未将工具加入 PATH，请统一使用 `python -m …`。
- **CI**：推送/PR 至 **main** / **master** 时由 **`.github/workflows/ci.yml`** 在 Ubuntu + Python 3.12 上执行 **ruff** 与 **mypy --strict**。若仓库使用 **GitLab CI**，请在 `.gitlab-ci.yml` 中镜像上述两条命令与工作目录 **`router/`**。

## 运行

见项目根目录 `docker-compose.yml`；服务端口 8001。
