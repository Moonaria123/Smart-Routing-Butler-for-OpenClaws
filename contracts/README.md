# Smart Router Butler — AI Agent 开发团队章程与握手契约

> 本文档定义 AI Agent 开发团队的组织结构、协作流程和跨服务契约。所有 Agent 在开始开发前必须阅读本文档。

---

## 一、团队架构

```
┌─────────────────────────────────────────────────┐
│            人类 Controller / Reviewer            │
│   决策方向、优先级、架构评审、验收签批                │
└────────────────────┬────────────────────────────┘
                     │ 指令 / Review
                     ▼
┌─────────────────────────────────────────────────┐
│           🏛️ 架构师 Agent（主代理）                │
│                                                 │
│   · 维护所有跨服务契约（本目录下所有文件）          │
│   · 审查子 Agent 产出是否符合契约                  │
│   · 负责 Sprint 3 集成任务（TASK-015 ~ 019）      │
│   · docker-compose.yml / .env 管理              │
│   · E2E 测试与压测                               │
│                                                 │
│   推荐模型：Claude Opus（最强推理能力）            │
│   Cursor 规则：@architect-agent                  │
└──────┬──────────────┬──────────────┬────────────┘
       │              │              │
       ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────────┐
│ ⚡ Proxy   │ │ 🧠 Router  │ │ 🎨 Dashboard   │
│   Agent    │ │   Agent    │ │    Agent       │
│            │ │            │ │                │
│ proxy/     │ │ router/    │ │ dashboard/     │
│ Node+TS    │ │ Python     │ │ Next.js        │
│ Express    │ │ FastAPI    │ │ shadcn/ui      │
│            │ │ FastEmbed  │ │ Prisma         │
│ TASK 001-  │ │ TASK 020-  │ │ TASK 008-014   │
│ 007        │ │ 023        │ │ 024-027        │
│            │ │            │ │                │
│ Claude     │ │ Gemini     │ │ Claude Opus    │
│ Opus 4.6   │ │ 3.1 Pro    │ │ 4.6 (thinking) │
└────────────┘ └────────────┘ └────────────────┘
```

---

## 二、Agent 画像

### 2.1 架构师 Agent（主代理）

| 属性 | 值 |
|------|-----|
| 推荐 LLM | **Claude Opus**（需要最强系统级推理能力） |
| Cursor 规则 | `@architect-agent` |
| 工作目录 | 项目根目录（跨子项目） |
| 核心职责 | 契约制定与维护、跨服务集成、E2E 测试、Docker 编排 |
| 负责 TASK | 015-019（Sprint 3 集成阶段） |
| 全程在线 | 是——作为人类 Controller 的直接对话对象 |

**为什么用 Claude Opus**：主代理需要同时理解 TypeScript、Python、Next.js 三个技术栈的交互点，做出跨服务架构决策，并在契约变更时评估对所有子项目的影响。这需要最强的推理和长上下文理解能力。

### 2.2 Proxy Agent（代理层开发）

| 属性 | 值 |
|------|-----|
| 推荐 LLM | **Claude Opus 4.6 (thinking)**（TypeScript 代码质量最高、深度推理能力强） |
| Cursor 规则 | `@proxy-dev-agent` |
| 工作目录 | `proxy/` |
| 核心职责 | 请求代理、SSE 流式透传、规则引擎、熔断器、Provider 适配 |
| 负责 TASK | 001-007（Sprint 1） |
| 关键技能 | async iterator、Redis 操作、AES-256-GCM 加密、性能优化 |

**为什么用 Claude Opus 4.6 (thinking)**：proxy 层是性能关键路径，涉及 SSE 流式透传、熔断器状态机、AES 加密等复杂异步逻辑。Opus 4.6 的 thinking 模式在处理多层嵌套异步和性能优化场景下推理更深入、代码质量最高。

### 2.3 Router Agent（路由引擎开发）

| 属性 | 值 |
|------|-----|
| 推荐 LLM | **Gemini 3.1 Pro**（Python + ML 生态强、超长上下文窗口） |
| Cursor 规则 | `@router-dev-agent` |
| 工作目录 | `router/` |
| 核心职责 | 语义路由、FastEmbed 集成、Arch-Router 调用、语义缓存 |
| 负责 TASK | 020-023（V1.1 Sprint） |
| 关键技能 | FastAPI、Pydantic v2、semantic-router、Redis 向量索引、httpx |

**为什么用 Gemini 3.1 Pro**：路由引擎涉及 embedding 模型、向量检索、Ollama API 等 ML 生态，Gemini 在 Python + AI/ML 领域的理解力和超长上下文使其能处理复杂的库集成。

### 2.4 Dashboard Agent（控制台开发）

| 属性 | 值 |
|------|-----|
| 推荐 LLM | **Claude Opus 4.6 (thinking)**（React/Next.js 代码质量最高、shadcn/ui 理解好） |
| Cursor 规则 | `@dashboard-dev-agent` |
| 工作目录 | `dashboard/` |
| 核心职责 | Web 控制台全栈开发（UI + API Routes + Prisma） |
| 负责 TASK | 008-014（Sprint 2）、024-027（V1.1） |
| 关键技能 | Next.js App Router、shadcn/ui、TanStack Table、Recharts、react-hook-form + zod |

**为什么用 Claude Opus 4.6 (thinking)**：Dashboard 是用户直接接触的界面，涉及复杂表单联动、双视图同步、拖拽排序等深度交互。Opus 4.6 的 thinking 模式在处理多组件协调和状态管理时推理更透彻，对 shadcn/ui 的组件 API 和 Tailwind CSS 模式理解优秀。

---

## 三、开发握手契约

### 3.1 契约文件清单

| 文件 | 用途 | 变更权限 |
|------|------|---------|
| `contracts/database-schema.prisma` | 数据库 Schema 单一事实来源 | 仅架构师 Agent（Dashboard Agent 消费） |
| `contracts/api-contracts.md` | 所有 HTTP API 接口定义 | 仅架构师 Agent |
| `contracts/redis-keys.md` | Redis Key 前缀、格式、TTL 约定 | 仅架构师 Agent |
| `contracts/README.md` | 本文档（团队章程） | 仅架构师 Agent |

### 3.2 契约变更流程

```
1. 任何 Agent 发现需要变更契约 → 向架构师 Agent 提出变更请求
2. 架构师 Agent 评估影响范围 → 列出受影响的子项目
3. 人类 Controller 审批（如涉及 API 接口 / DB Schema 变更）
4. 架构师 Agent 更新契约文件
5. 所有受影响的子项目 Agent 同步更新代码
```

**硬性规则**：子 Agent **禁止直接修改** `contracts/` 目录下的文件。发现契约缺陷时，记录到交付说明的「需要 Review 的决策」部分，由架构师统一处理。

### 3.3 子 Agent 开发边界

| 规则 | 说明 |
|------|------|
| 目录隔离 | 每个 Agent 只操作自己的子项目目录 |
| 类型对齐 | TypeScript 类型必须与 `database-schema.prisma` 字段一一对应 |
| Python 类型对齐 | Pydantic Schema 必须与 `api-contracts.md` 中定义的 JSON 结构一致 |
| Redis Key | 严格按 `redis-keys.md` 定义的前缀和格式操作 |
| 错误格式 | 所有子项目统一使用 `api-contracts.md` 定义的错误响应格式 |
| 环境变量 | 不硬编码，从 `.env` 读取，变量名按契约定义 |

### 3.4 Agent 交付标准

每个 TASK 完成时，Agent 必须提供：

1. **功能说明**：实现了什么，边界条件如何处理
2. **契约符合性声明**：确认代码中的类型、API 路径、Redis Key 与契约一致
3. **测试覆盖**：哪些场景被测试，测试通过结果
4. **需要 Review 的决策**：如有设计权衡或契约缺陷，明确列出
5. **已知局限**：暂未处理的 edge case 或技术债

---

## 四、开发节奏

### Phase 0（准备周）
- 架构师 Agent：产出全部契约文件（本目录） ← **当前阶段**
- 人类 Controller：Review 并确认契约

### Phase 1 — Sprint 1（第 1-2 周）
- **Proxy Agent**：TASK 001-007（代理数据平面）
- **Dashboard Agent**：TASK 008（项目骨架 + 登录，可并行）
- 架构师 Agent：审查 proxy 产出

### Phase 2 — Sprint 2（第 3-4 周）
- **Dashboard Agent**：TASK 009-014（管理控制台）
- 架构师 Agent：审查 dashboard 产出

### Phase 3 — Sprint 3 + V1.1（第 5-8 周）
- **Router Agent**：TASK 020-023（Python 路由引擎）
- **Dashboard Agent**：TASK 024-027（AI 向导 + 成本分析）
- **架构师 Agent**：TASK 015-019（集成 + Docker + E2E + 压测）

### 人类 Controller 审查点
- Sprint 1 结束：代理层架构 Review（SSE 实现、适配器接口设计）
- Sprint 2 结束：Dashboard UX Review（路由规则配置流程走查）
- Sprint 3 结束：集成测试 Review + 发布决策

---

## 五、Cursor 工作流

### 5.1 如何启动子 Agent

在 Cursor 中开启新的 Composer 对话，加载对应规则：

```
# 开发 proxy 时
@proxy-dev-agent 开始 TASK-001：搭建项目骨架

# 开发 dashboard 时
@dashboard-dev-agent 开始 TASK-008：项目初始化

# 开发 router 时
@router-dev-agent 开始 TASK-020：FastAPI 服务骨架
```

### 5.2 切换 LLM

每个新对话开始前，在 Cursor 右下角模型选择器中切换到推荐模型。

### 5.3 回到主代理

在主对话（架构师 Agent）中汇报子 Agent 的产出：

```
@architect-agent Proxy Agent 完成了 TASK-001 ~ 003，请审查是否符合契约
```
