<div align="center">

<img src="./docs/images/hero-banner.jpg" alt="Smart Router Butler" width="720" />

# 🦞 Smart Router Butler

**一个接口，万模随心。你的本地 AI 智能路由管家。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Moonaria123/smart-router-butler/ci.yml?branch=main&label=CI&logo=github)](https://github.com/Moonaria123/smart-router-butler/actions/workflows/ci.yml)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![GitHub stars](https://img.shields.io/github/stars/Moonaria123/smart-router-butler?style=social)](https://github.com/Moonaria123/smart-router-butler/stargazers)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![GitHub last commit](https://img.shields.io/github/last-commit/Moonaria123/smart-router-butler)](https://github.com/Moonaria123/smart-router-butler/commits)
[![GitHub issues](https://img.shields.io/github/issues/Moonaria123/smart-router-butler)](https://github.com/Moonaria123/smart-router-butler/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[**快速开始**](#-快速开始自托管) · [**核心特性**](#-核心特性) · [**配置指南**](#%EF%B8%8F-配置说明摘要) · [**安全与隐私**](#%EF%B8%8F-安全与隐私)

[English](README.md) | [中文](README.zh-CN.md)

*Smart Router Butler 是一套 100% 本地运行、可自托管的 OpenAI 兼容 API 智能路由器。它在成本、延迟与质量之间自动权衡，让你只需对接一个端点，即可无缝调度云端大模型与本地小模型。*

</div>

---

<details>
<summary><strong>📑 目录</strong></summary>

- [💡 为什么需要 Smart Router Butler？](#-为什么需要-smart-router-butler)
- [✨ 核心特性](#-核心特性)
- [🎯 规则创建 — 三种方式](#-规则创建--三种方式构建你的路由策略)
- [🏗️ 架构与路由决策链](#%EF%B8%8F-架构与路由决策链)
- [📸 界面预览](#-界面预览)
- [🚀 快速开始（自托管）](#-快速开始自托管)
- [⚙️ 配置说明（摘要）](#%EF%B8%8F-配置说明摘要)
- [🔀 与其它方案的差异](#-与其它方案的差异)
- [📂 仓库结构](#-仓库结构节选)
- [🛠️ 开发与健康检查](#%EF%B8%8F-开发与健康检查维护者)
- [🗺️ 路线图](#%EF%B8%8F-路线图)
- [⚖️ 开源治理与合规](#%EF%B8%8F-开源治理与合规)
- [🛡️ 安全与隐私](#%EF%B8%8F-安全与隐私)
- [🤝 贡献](#-贡献)
- [📜 许可证与免责声明](#-许可证与免责声明)
- [🙏 致谢](#-致谢)

</details>

---

## 💡 为什么需要 Smart Router Butler？

在 AI 代理和 IDE 辅助编程的日常使用中，我们经常遇到这些痛点：

- 💸 **高昂的 API 成本**：无论是简单的拼写检查还是复杂的架构设计，工具往往无法随意切换到价格合适的模型。
- 🧱 **死板的全局配置**：无法根据任务类型（代码补全、长文总结、多步推理）灵活分配最合适的模型。
- 📦 **黑盒与脆弱性**：路由逻辑不透明，单一模型服务不可用时，整个代理工作流直接崩溃。

**Smart Router Butler** 将「选哪个模型」变成了一个**可策略化、可热更新**的配置问题。它作为你的本地代理层，接管所有 LLM 请求，并根据你设定的规则和语义智能分发。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## ✨ 核心特性

- 🧠 **多层智能路由**：首创 L1（规则） + L2（语义） + L3（本地模型仲裁）三层决策链，精准匹配任务与模型。
- 💰 **显著降低成本**：将简单任务卸载给本地模型或廉价 API，复杂任务保留给旗舰模型。
- 🛡️ **高可用与自动降级**：内置熔断器与 Fallback 机制，主模型超时或报错时自动切换备用模型，保障业务不中断。
- 📊 **全链路可观测**：提供精美的 Next.js Web 控制台，请求日志、Token 消耗、命中规则一目了然。
- 🔒 **100% 数据掌控**：完全自托管，数据不下车；API Key 采用 AES-256-GCM 加密存储，拒绝第三方网关的隐私风险。
- ⚡ **极致性能**：L1 规则引擎内存同步匹配（<2ms），全程支持 SSE 流式透传，无感接入。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🎯 规则创建 — 三种方式构建你的路由策略

Smart Router Butler 提供三种创建路由规则的方式，从完全手动到完全 AI 驱动，可根据你的偏好自由选择和混合使用。

### 1. 自定义规则编辑器

通过 Web 控制台可视化创建规则，无需编写代码。支持按任务类型、关键词、Token 数量、模型偏好等多种条件组合；可设置优先级、目标模型及最多 3 个 Fallback 备选模型。规则保存后通过热更新立即生效。

<div align="center">
<img src="./docs/images/screenshot-rule-editor.png" width="680" alt="自定义规则编辑器" />
</div>

**示例 — 将编码任务路由到代码专用模型：**

| 字段 | 值 |
|---|---|
| 规则名称 | 代码编写规则 |
| 优先级 | 900（高） |
| 条件 | 任务类型 = `coding` |
| 目标模型 | `Alibaba/qwen3-coder-plus` |
| Fallback | `Alibaba/qwen3.5-plus` |

保存后，所有被识别为编码任务的请求会自动发送到代码优化模型；若主模型不可用，则自动切换到通用备选模型。

### 2. 自然语言规则生成器

用自然语言描述你的路由需求，内置 LLM 自动将其翻译为结构化规则。适合知道自己想要什么、但不想逐一配置字段的用户。

<div align="center">
<img src="./docs/images/screenshot-nl-generator.png" width="680" alt="自然语言规则生成器" />
</div>

**示例提示词：**

- `代码用 DeepSeek Coder，聊天用 GPT-4o-mini`
- `预算低于每百万 Token 5 美元时使用便宜模型`
- `如果 OpenAI 不健康，切换到 Anthropic`
- `长文档（>10000 Token）用 Claude，短问题用 GPT-4o-mini`
- `GPT-4o 处理数学/分析，DeepSeek 处理翻译`

输入一句话，点击 **生成规则**，系统自动生成一条或多条可用规则，你可以审阅、编辑并一键启用。

### 3. AI 问卷向导

5 步交互式向导，引导你选择使用场景、首选供应商、预算偏好和优先级，然后自动生成一套完整的初始规则集。

<div align="center">
<img src="./docs/images/screenshot-ai-wizard.png" width="680" alt="AI 问卷向导" />
</div>

**向导步骤：**

1. **选择使用场景** — 编码与调试、数据分析、内容创作、日常聊天、翻译、数学与推理、长文档处理
2. **选择供应商** — 从已配置的 Provider 中选取（OpenAI、Anthropic、阿里云、本地 Ollama 等）
3. **设定预算偏好** — 成本优先、均衡、质量优先
4. **定义优先级** — 延迟 vs. 质量 vs. 成本的权衡
5. **预览并应用** — 查看所有生成的规则，按需调整后一键激活

非常适合首次部署 — 从零规则到完整可运行的路由策略，不到 2 分钟。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🏗️ 架构与路由决策链

```mermaid
graph TD
    Client[客户端 / AI Agent] -->|OpenAI 兼容 API| Proxy(Node.js 代理层)
    
    subgraph decisionChain [决策与缓存链]
        Proxy --> L0{L0 精确缓存}
        L0 -->|未命中| L05{L0.5 语义缓存}
        L05 -->|未命中| L1{L1 规则引擎}
        L1 -->|未命中| L2{L2 语义路由}
        L2 -->|未命中| L3{L3 本地模型仲裁}
    end
    
    L3 -->|决策结果| Dispatch(请求分发)
    L1 -->|命中| Dispatch
    L2 -->|命中| Dispatch
    
    Dispatch -->|SSE 流式透传| Cloud[云端 LLM Providers]
    Dispatch -->|SSE 流式透传| Local[本地 LLM / Ollama]
    
    Proxy -.->|异步写日志| DB[(PostgreSQL)]
    Proxy -.->|异步写缓存| Redis[(Redis)]
```

> **L3 仲裁** 依赖宿主机运行的 Ollama 小模型（如 `fauxpaslife/arch-router:1.5b`），在规则和语义都无法覆盖时，由 AI 动态判断最佳去向；超时或不可用时自动降级。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 📸 界面预览

<div align="center">

| 路由规则管理 | 自然语言生成规则 |
|:---:|:---:|
| <img src="./docs/images/screenshot-rules.png" width="480" /> | <img src="./docs/images/screenshot-nl-generator.png" width="480" /> |

| 规则命中分析 | 规则编辑器 |
|:---:|:---:|
| <img src="./docs/images/screenshot-hit-analysis.png" width="480" /> | <img src="./docs/images/screenshot-rule-editor.png" width="480" /> |

| AI 规则向导 | 请求日志 |
|:---:|:---:|
| <img src="./docs/images/screenshot-ai-wizard.png" width="480" /> | <img src="./docs/images/screenshot-request-logs.png" width="480" /> |

| Raw JSON 编辑器 |
|:---:|
| <img src="./docs/images/screenshot-raw-json.png" width="480" /> |

</div>

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🚀 快速开始（自托管）

### 前置条件

| 依赖 | 说明 |
|------|------|
| **Docker & Compose** | 用于一键编排 `proxy` / `router` / `dashboard` / `postgres` / `redis` |
| **Ollama**（可选） | 用于 L3 本地模型仲裁；容器内通过 `host.docker.internal:11434` 访问宿主机 |

**源码获取**：当前**仅通过 GitHub** 分发（`git clone`、**Code → Download ZIP** 或 **Releases** 资产）。**不提供** `npm install <包名>` 安装本系统；npm 仅用于克隆后在 `proxy/`、`dashboard/` 内安装**第三方依赖**。

### 3 分钟部署步骤

1. **克隆**

   ```bash
   git clone https://github.com/Moonaria123/smart-router-butler.git
   cd smart-router-butler
   ```

2. **环境变量**

   ```bash
   cp .env.example .env
   # 编辑：DATABASE_URL、REDIS_URL、ENCRYPTION_KEY、BETTER_AUTH_SECRET 等
   ```

3. **（可选）L3 模型**

   ```bash
   ollama pull fauxpaslife/arch-router:1.5b
   ```

4. **启动**

   ```bash
   docker compose up -d
   docker compose exec dashboard npx prisma migrate deploy
   ```

5. **访问**：控制台 `http://localhost:3000`；客户端指向 Proxy 的 OpenAI 兼容地址 `http://localhost:8080/v1`。

详见 `docker-compose.yml`、`docker-compose.release.yml` 与子目录 README。

### 本地开发时的 npm 依赖

在 `proxy/`、`dashboard/` 执行 `npm ci` 时，`.npmrc` 仅影响**依赖包**下载源，**不能**替代 `git clone`。Dockerfile 会复制 `.npmrc`；Router 使用 `pip install -r requirements.txt`。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## ⚙️ 配置说明（摘要）

| 类别 | 入口 |
|------|------|
| 全局与端口 | `.env.example`、`compose/ports.env` |
| 代理 / 路由 | `PYTHON_ROUTER_URL`、`OLLAMA_URL`、`ARCH_ROUTER_MODEL`、`ROUTING_ENABLE_L2` / `L3` 等 |
| 控制台与认证 | `BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`DATABASE_URL`、`PROXY_URL` |
| 预构建镜像 | `GHCR_OWNER`、`SMARTROUTER_IMAGE_TAG` |

**切勿**将 `.env`、API Key 或生产连接串提交到 Git。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🔀 与其它方案的差异

| 维度 | 典型云端聚合网关 | Smart Router Butler |
|------|------------------|---------------------|
| **数据隐私** | 流量经第三方中转，存在泄露风险 | **100% 自托管**，数据不下车，路径完全由你控制 |
| **路由逻辑** | 平台黑盒，无法干预 | **L1/L2/L3 白盒化**，规则透明、可配置、可解释 |
| **合规性** | 依赖供应商条款，受限于地域 | **可部署在自有网络**，满足最严格的企业合规要求 |
| **成本控制** | 平台抽成或固定月费 | **零平台费**，按需路由最大化榨干免费/廉价模型价值 |

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 📂 仓库结构（节选）

| 目录 | 说明 |
|------|------|
| `proxy/` | Node.js 代理：OpenAI 兼容 API、L0/L1、SSE |
| `router/` | FastAPI：语义路由、缓存、L3 相关 |
| `dashboard/` | Next.js：规则、Provider、日志 |
| `contracts/` | 服务间契约 |

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🛠️ 开发与健康检查（维护者）

```bash
# proxy/
npm run type-check && npm run lint

# router/
python -m mypy app/ --strict && python -m ruff check app/

# dashboard/
npm run type-check && npm run lint
```

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🗺️ 路线图

以下功能正在规划或积极开发中：

- [ ] 自定义路由策略插件系统
- [ ] 多用户团队协作与角色权限管理
- [ ] Token 预算跟踪与用量告警
- [ ] 更多 LLM 供应商接入（Google Gemini、Mistral 等）
- [ ] API Key 轮换与生命周期管理
- [ ] Prometheus / Grafana 指标导出

> 有功能建议？欢迎 [提交 Issue](https://github.com/Moonaria123/smart-router-butler/issues) 描述你的使用场景。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## ⚖️ 开源治理与合规

| 文档 | 说明 |
|------|------|
| [**LICENSE**](LICENSE) | **MIT** 授权 |
| [**CODE_OF_CONDUCT.md**](CODE_OF_CONDUCT.md) | 基于 **Contributor Covenant 2.1** 的社区行为准则 |
| [**CONTRIBUTING.md**](CONTRIBUTING.md) | 贡献流程、知识产权与代码规范 |
| [**SECURITY.md**](SECURITY.md) | 漏洞报告与负责任披露 |

参与 Issue、PR、讨论前请阅读 **行为准则**。维护者保留对破坏性、骚扰性内容采取管理措施的权利。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🛡️ 安全与隐私

- **漏洞报告**：请勿在公开区披露可利用细节；请遵循 [**SECURITY.md**](SECURITY.md)。  
- **部署与数据**：本软件**自托管**运行；用户提示词、响应、日志与密钥**由部署者**在自有基础设施上管理；**请自行**审阅与上游 LLM 提供商的服务条款及数据驻留政策。  
- **供应链**：建议在生产使用锁定版本的镜像与依赖（`package-lock.json`、`requirements.txt`），并关注依赖安全公告。  

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🤝 贡献

欢迎 Issue 与 Pull Request，详见 [**CONTRIBUTING.md**](CONTRIBUTING.md)。贡献即表示你同意 [**CODE_OF_CONDUCT.md**](CODE_OF_CONDUCT.md) 与 [**LICENSE**](LICENSE) 下的许可安排。

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 📜 许可证与免责声明

- 软件在 [**MIT License**](LICENSE) 下发布。  
- **按原样提供（AS IS）**：不作适销性、特定用途适用性、非侵权等明示或默示担保；**使用本软件的风险由使用者自行承担**。  
- **间接损害**：在法律允许范围内，作者与贡献者不对任何间接、偶然、特殊或后果性损害承担责任。  

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 🙏 致谢

Smart Router Butler 基于以下优秀的开源项目构建：

- [Next.js](https://nextjs.org/) — Dashboard 使用的 React 框架
- [Fastify](https://fastify.dev/) / [Express](https://expressjs.com/) — Proxy 使用的 Node.js 服务框架
- [FastAPI](https://fastapi.tiangolo.com/) — 语义路由使用的 Python 框架
- [Ollama](https://ollama.com/) — L3 仲裁使用的本地 LLM 运行时
- [Prisma](https://www.prisma.io/) — 数据库 ORM
- [Redis](https://redis.io/) — 内存缓存
- [PostgreSQL](https://www.postgresql.org/) — 持久化存储

---

<p align="right"><a href="#-smart-router-butler">⬆ 回到顶部</a></p>

## 📚 相关阅读

- 智能路由与成本优化可参考业界同类讨论；本仓库不保证与第三方产品功能一一对应。
