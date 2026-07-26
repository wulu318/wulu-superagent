# 修复 "Agent 绑定模型已不可用" 报错设计文档

## 1. 概述

修复 Agent 模型绑定失效后的系列问题：报错无法通过 UI 解除（死循环）、禁用 provider 后大面积 session 报错、重启不恢复、home 页选模型影响正在运行的 session。

### 设计原则

1. **每个 session 有自己的模型** — 创建时即固定，不被其他 session 的操作修改
2. **Agent.model 失效时静默 fallback** — 不阻塞发送，使用全局 fallback 模型
3. **Session.modelOverride 失效时报错** — 要求用户手动选择（这是用户显式选择的模型，值得告知）
4. **Home 页选模型不触发 gateway 配置变更** — 避免影响其他正在运行的 session
5. **Session modelOverride 不被 normalization 改写** — 用户选定的模型引用原样发送给 gateway

---

## 2. 问题排查

### 2.1 三层模型选择架构

```
┌─────────────────────────────────────────────────────────────┐
│  session.modelOverride   (对话级覆盖，持久化在 SQLite)         │
│  ↓ 空则跳过                                                   │
├─────────────────────────────────────────────────────────────┤
│  agent.model             (Agent 默认模型，持久化在 SQLite)      │
│  ↓ 空则跳过                                                   │
├─────────────────────────────────────────────────────────────┤
│  globalSelectedModel     (全局 fallback，Redux 内存态)         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 关键事实

1. **session.modelOverride 绝大多数为空** — 只有用户在对话中手动切换模型时才写入
2. **Agent.model 是全局共享的** — 被修改后，所有 modelOverride 为空的 session 都受影响
3. **切换 session 不改变 currentAgentId** — `CoworkPromptInput` 始终用全局 Agent.model 做校验
4. **模型引用格式** — `toOpenClawModelRef()` 生成 `provider/modelId` 格式
5. **availableModels 更新时 server 模型被保留** — 禁用自定义 provider 不影响 server 模型

### 2.3 核心判定逻辑

触发条件（三个同时满足）：
1. `coworkAgentEngine === 'openclaw'`
2. `resolveAgentModelSelection()` 返回 `hasInvalidExplicitModel: true`
3. 组件: `CoworkPromptInput.tsx:931`

判定函数 (`agentModelSelection.ts:19-46`)：
```
1. sessionModel 非空？→ 解析失败则 hasInvalidExplicitModel = true
2. agentModel 非空？→ 解析失败则 hasInvalidExplicitModel = true
3. 两者都为空 → 正常，用 fallback 全局模型
```

### 2.4 用户反馈的 4 个场景

**场景 1: 关闭自定义模型后 server 模型对话也报错**
- 根因：那些对话 `modelOverride` 为空，从 Agent.model 继承，Agent.model 指向已禁用的 provider

**场景 2: 重启后报错不消失**
- 根因：Agent.model 持久化在 SQLite，无自动清理/校验机制

**场景 3: A 对话正常，B 对话操作后回到 A 报错**
- 根因：所有对话共享同一 Agent ('main')，B 操作改了 Agent.model，A 继承到无效值

**场景 4: 禁用模型后新对话全部报错 (P0)**
- 根因：onChange 在有 sessionId 时只 patch session，用户无法通过 UI 修复 Agent.model（死循环）

### 2.5 根因总结

**核心问题是 Agent.model 的"不可达"性**：
1. Agent.model 一旦无效，影响所有 modelOverride 为空的 session
2. 用户在 session 中切换模型只写 session.modelOverride，不修正 Agent.model
3. 没有任何自动校验/清理机制
4. "感染式"传播的本质：共享 Agent.model，非 session 间传染

### 2.6 已识别问题清单

| # | 问题 | 严重性 |
|---|------|--------|
| B1 | 用户在 session 中选模型无法修正 Agent.model（死循环） | P0 |
| B2 | provider 禁用时不校验/清理受影响的 Agent.model | P1 |
| B3 | 裸 ID 歧义导致误判（server + custom 同 ID） | P2 |
| B4 | UI 误导：invalid 时 ModelSelector 显示 fallback 模型名但发送禁用 | P2 |

---

## 3. 终态行为

### 3.1 Agent.model 失效时静默 fallback

**修改文件**: `agentModelSelection.ts`

- Agent.model 解析失败 → `hasInvalidExplicitModel: false`，使用 `fallbackModel`
- 不阻塞发送，不显示红字
- 用户在 session 中切换模型时，若 Agent.model 无效，同时修正 Agent.model

### 3.2 Session.modelOverride 失效时报错

**修改文件**: `agentModelSelection.ts`

- session.modelOverride 非空但解析失败 → `hasInvalidExplicitModel: true`
- 显示红字："当前模型已不可用，请重新选择"
- 发送按钮禁用

### 3.3 新建 session 时持久化 modelOverride

**修改文件**: `CoworkView.tsx`, `cowork.ts`, `coworkStore.ts`, `main.ts`

- 新建 session 时使用 `globalSelectedModel` 生成 `modelOverride` 写入 SQLite
- 后续该 session 模型独立于 Agent.model 和其他 session

### 3.4 Home 页模型选择解耦

**修改文件**: `CoworkView.tsx`, `CoworkPromptInput.tsx`

- 模型选择器改为 `dispatch(setSelectedModel(nextModel))`
- 不再调用 `agentService.updateAgent()` → 不触发 `syncOpenClawConfig`
- 模型选择仅存在于 Redux 内存态

### 3.5 Session modelOverride 不被 normalization 改写

**修改文件**: `openclawRuntimeAdapter.ts`

- `startTurn` 时，若 session 有 modelOverride，跳过 normalization，原样发送给 gateway
- 解决 `wulu-server/qwen3.5-plus` 被错误改写为 `qwen-portal/qwen3.5-plus` 的问题

### 3.6 Provider ID fallback

**修改文件**: `openclawModelRef.ts`

- `provider/modelId` 精确匹配失败时，提取 modelId 在所有 availableModels 中查找
- 唯一匹配则返回，0 个或多个则返回 null

---

## 4. 实施记录

共 6 个 commit，修改 10 个核心文件。

### Step 1: 核心模型选择逻辑重构 (`7153cd2`)

- `agentModelSelection.ts` — Agent.model 失效改为静默 fallback
- `openclawModelRef.ts` — Provider ID fallback（唯一匹配时 fallback）
- `CoworkPromptInput.tsx` — onChange 修正 Agent.model + UI 改进
- `i18n.ts` — 文案精简
- `agentModelSelection.test.ts` — 更新测试

### Step 2: 合并冲突解决 (`6144ff1`)

OpenAI → OpenAI Codex provider 迁移兼容逻辑合并。

### Step 3: 新建 session 时持久化 modelOverride (`18a33b5`)

改动链路：`CoworkStartOptions` 增加 `modelOverride` → IPC handler 传递 → `createSession()` 写入 SQL → `CoworkView` 调用时传入。

### Step 4: 阻止 session.modelOverride 被 normalization 改写 (`2500d89`)

`openclawRuntimeAdapter.ts`: session 有 modelOverride 时跳过 normalization。

### Step 5: Home 页模型选择解耦 (`0cb02d6`)

Header 和 Input 的模型选择器改为只更新 Redux 内存态。

### Step 6: 清理 (`0d96884`)

移除未使用的 import 和变量。

---

## 5. 方案演变过程

| 阶段 | 核心思路 | 触发变化的原因 |
|------|----------|----------------|
| v1 | B1 onChange 修正 + B4 UI | 初始分析 |
| v2 | + Agent.model 失效改为静默 fallback | 用户反馈 |
| v3 | + 新建时持久化 modelOverride | 用户要求 per-session 模型 |
| v4 | + 阻止 normalize 改写 session model | 调试发现 server 模型被改写 |
| v5 (最终) | + Home 页选模型解耦 | home 选模型触发 sync 影响运行中 session |

---

## 6. 涉及的文件

| 文件 | 改动内容 |
|------|----------|
| `src/renderer/components/cowork/agentModelSelection.ts` | Agent.model 失效改为静默 fallback |
| `src/renderer/components/cowork/agentModelSelection.test.ts` | 更新 + 新增测试 |
| `src/renderer/components/cowork/CoworkPromptInput.tsx` | onChange 修正 + home 页解耦 + UI |
| `src/renderer/components/cowork/CoworkView.tsx` | header 解耦 + 新建 session 传 modelOverride |
| `src/renderer/utils/openclawModelRef.ts` | Provider ID fallback |
| `src/renderer/services/i18n.ts` | 文案精简 |
| `src/renderer/types/cowork.ts` | CoworkStartOptions 增加 modelOverride |
| `src/main/coworkStore.ts` | createSession 接受 modelOverride |
| `src/main/main.ts` | IPC handler 传递 modelOverride |
| `src/main/libs/agentEngine/openclawRuntimeAdapter.ts` | 跳过 session.modelOverride 的 normalization |

---

## 7. 验证

### 构建验证

| 验收项 | 命令 |
|--------|------|
| TypeScript 编译通过 | `npx tsc --noEmit` |
| 单元测试通过 | `npm test` |
| 生产构建成功 | `npm run build` |

### 功能验证

| 验收项 | 验证方法 |
|--------|----------|
| Agent.model 失效 → 静默 fallback | 禁用 provider → 对话正常 |
| Session.modelOverride 失效 → 报错 | 构造无效 override → 红字 + 禁用发送 |
| Session 模型独立性 | session A 用 X，session B 用 Y → 互不影响 |
| Home 页选模型不触发 sync | 选模型后日志无 `syncOpenClawConfig` |
| Server 模型不被 normalize 改写 | 使用 wulu-server 模型 → 原始引用不变 |
| 重启一致性 | 重启后各 session 保持 modelOverride |

---

## 8. 不在范围内

- Agent.model 失效已改为静默 fallback，无需主动清理
- 运行时 LLM 调用错误的 UI 展示改进
- 模型列表服务端接口的可靠性

---

## 9. 待清理

- 多个文件中有调试用的 `console.log` 语句（`[CoworkPromptInput]`、`[CoworkView]`、`[openclawModelRef]`），应在功能稳定后清理
