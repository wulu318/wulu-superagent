# OpenClaw Gateway 重启诊断文档（2026-04-27）

本文档描述 OpenClaw gateway 进程的所有重启触发条件、`[GW-RESTART-DIAG]` 诊断日志体系，以及如何利用这些日志定位"gateway 莫名重启"问题。

---

## 1. 概述

### 1.1 问题

用户反馈 OpenClaw gateway 进程在正常使用过程中意外重启，导致正在进行的 cowork 会话中断、IM 频道连接断开。

### 1.2 诊断方案

在所有可能导致 gateway 重启的代码路径上添加统一的 `[GW-RESTART-DIAG]` 诊断日志，每条日志自带本地时间戳（ISO 8601 + 时区偏移），支持一条 grep 命令提取完整重启时间线。

### 1.3 涉及文件

| 文件 | 职责 | 诊断日志数量 |
|---|---|---|
| `src/main/libs/openclawEngineManager.ts` | gateway 进程生命周期管理 | ~14 条 |
| `src/main/main.ts` | IPC 处理、配置同步、重启决策 | ~16 条 |
| `src/main/libs/openclawConfigSync.ts` | 配置文件 diff 和变更检测 | ~15 条 |
| `src/main/libs/claudeSettings.ts` | API 密钥解析 | 1 条 |
| `src/main/im/imGatewayManager.ts` | IM 平台 gateway 管理 | reason 字符串透传 |
| `src/main/libs/agentEngine/openclawRuntimeAdapter.ts` | WebSocket 客户端连接 | reason 字符串透传 |

---

## 2. Gateway 重启触发条件

Gateway 重启共有 **6 类触发源**，每类又有多个具体入口。

### 2.1 配置同步触发（`syncOpenClawConfig`）

这是最常见的重启触发路径。`syncOpenClawConfig()` 是所有配置变更的中枢，它重新生成 `openclaw.json`，然后判断是否需要硬重启。

**硬重启判定条件**：

```typescript
needsHardRestart = secretEnvVarsChanged
  || bindingsChanged
  || mcpBridgeConfigChanged
  || (configChanged && restartGatewayIfRunning)
```

四个子条件中，前三个是**强制重启条件**（无论 `restartGatewayIfRunning` 参数是什么都会触发）：

| 条件 | 含义 | 典型触发场景 |
|---|---|---|
| `secretEnvVarsChanged` | API 密钥、IM 密钥、代理 token 等环境变量变化 | 用户修改 API key、IM 平台密钥变更 |
| `bindingsChanged` | 平台→Agent 绑定映射变化 | 修改 IM 平台绑定的 Agent |
| `mcpBridgeConfigChanged` | MCP bridge 的 callbackUrl 或 tools 变化 | 添加/删除/修改 MCP 服务器 |
| `configChanged && restartGatewayIfRunning` | 配置 JSON 有任何变化且调用方要求重启 | `store:set app_config`（用户保存应用设置） |

**所有 `syncOpenClawConfig` 调用入口**：

| 调用入口 | reason 字符串 | `restartGatewayIfRunning` |
|---|---|---|
| 应用启动 bootstrap | `'bootstrap:...'` | `false` |
| cowork 会话启动 | `'ensureRunning:mcpBridge'` | `false` |
| 用户保存应用设置 | `'app-config-change'` | `true` |
| MCP 服务器变更 | `'mcp-server-changed'` | 默认 `false`，但 `mcpBridgeConfigChanged` 强制重启 |
| Agent 创建/更新/删除/预设 | `'agent-created'` / `'agent-updated'` / `'agent-deleted'` / `'agent-preset-added'` | 默认 `false` |
| IM 配置变更 | `'im-config-change'` | 默认 `false` |
| IM gateway 启动/停止 | `'im-gateway-start:dingtalk'` 等 | 默认 `false` |
| IM 配对审批 | `'im-pairing-approval:...'` | 默认 `false` |
| Skill 变更 | `'skills-changed'` | 默认 `false` |
| Token 刷新 | `'token-refresh:proactive'` 等 | `false` |
| 会话策略更新 | `'session-policy-updated'` | `false` |
| 服务端模型列表更新 | `'server-models-updated'` | `false` |
| Cowork 配置变更 | `'cowork-config-change'` | 默认 `false` |
| 延迟重启执行 | `'deferred:${原始reason}'` | 默认 `false`，但原始触发条件仍然成立 |

### 2.2 手动重启（IPC）

用户在 UI 上点击"重启引擎"按钮，触发 `openclaw:engine:restartGateway` IPC，直接调用 `restartGateway('ipc-manual')`。

### 2.3 代理设置变更

`store.onDidChange('app_config')` 监听器检测到 `useSystemProxy` 字段变化时：
1. 先调用 `applyProxyPreference()` 更新系统代理设置
2. 若 gateway 正在运行，调用 `restartGateway('proxy-change')`

### 2.4 微信扫码登录

`im:weixin:qr-login-wait` IPC 中，扫码登录成功后无条件调用 `restartGateway('weixin-qr-login')`。

### 2.5 进程崩溃自动恢复

当 gateway 进程意外退出（非预期的 stop/restart）时，`attachGatewayExitHandlers()` 中的 exit handler 会：
1. 记录退出码和信号
2. 读取 `gateway.log` 最后 30 行输出到主日志
3. 调用 `scheduleGatewayRestart()` 安排自动重启

自动重启参数：
- 最大重试次数：5 次
- 重试间隔（递增）：3s → 5s → 10s → 20s → 30s
- reason 字符串：`'auto-restart-after-crash'`

### 2.6 延迟重启（Deferred Restart）

当 `syncOpenClawConfig` 判定需要硬重启，但当前有活跃的 cowork 会话或定时任务时，重启被延迟：
- 每 3 秒轮询一次 `hasActiveGatewayWorkloads()`
- 工作负载结束后立即执行重启
- 硬超时 5 分钟：即使仍有活跃工作也强制重启

---

## 3. 诊断日志体系

### 3.1 日志格式

所有诊断日志使用统一的 `gwDiagTs()` 函数生成前缀：

```
[GW-RESTART-DIAG] 2026-04-27T15:36:53.829+08:00 startGateway: reason=ensure-running-for-cowork, currentPhase=ready, port=none
```

格式：`[标签] 时间戳 消息内容`

- 标签固定为 `[GW-RESTART-DIAG]`
- 时间戳为本地时间 + 时区偏移（ISO 8601）
- 消息内容包含操作名称和上下文参数

### 3.2 日志覆盖的关键决策点

#### 3.2.1 Gateway 启动（`startGateway`）

```
[GW-RESTART-DIAG] ... startGateway: reason=bootstrap:manual-install, currentPhase=ready, port=none
[GW-RESTART-DIAG] ... startGateway: already in progress, reusing existing promise (new reason=...)
[GW-RESTART-DIAG] ... startGateway: existing process unhealthy on port=18789, stopping it
[GW-RESTART-DIAG] ... startGateway: existing process alive but port unknown, stopping it
```

#### 3.2.2 Gateway 重启（`restartGateway`）

```
[GW-RESTART-DIAG] ... restartGateway: reason=ipc-manual, pid=12345, port=18789
[GW-RESTART-DIAG] ... restartGateway: stopping existing gateway...
[GW-RESTART-DIAG] ... restartGateway: starting gateway with new env...
```

#### 3.2.3 进程终止（`stopGatewayProcess`）

```
[GW-RESTART-DIAG] ... stopGatewayProcess: sending graceful kill to pid=12345
[GW-RESTART-DIAG] ... stopGatewayProcess: graceful kill timed out after 1.2s, force-killing pid=12345
```

#### 3.2.4 进程退出事件

```
[GW-RESTART-DIAG] ... gateway process exited with code=null, signal=SIGTERM        ← 预期退出
[GW-RESTART-DIAG] ... gateway process exited with code=1, signal=none              ← 意外崩溃
[GW-RESTART-DIAG] ... gateway.log tail (last 30 lines before crash):               ← 崩溃现场
[GW-RESTART-DIAG] ... gateway process error event: spawn ENOENT                    ← spawn 失败
```

#### 3.2.5 配置同步决策链（`syncOpenClawConfig`）

```
[GW-RESTART-DIAG] ... ──── syncOpenClawConfig START reason=app-config-change restartIfRunning=true
[GW-RESTART-DIAG] ... sync() ok=true changed=true bindingsChanged=false
[GW-RESTART-DIAG] ... SECRET ENV VARS CHANGED!
[GW-RESTART-DIAG] ...   added: WULU_APIKEY_openai
[GW-RESTART-DIAG] ...   modified: WULU_PROXY_TOKEN prev=abc123... next=def456...
[GW-RESTART-DIAG] ... needsHardRestart=true (envChanged=true bindingsChanged=false mcpBridgeChanged=false configChanged=true restartFlag=true)
[GW-RESTART-DIAG] ... ──── HARD RESTART EXECUTING. reason=app-config-change, phase=running, port=18789
```

或不需要重启的情况：

```
[GW-RESTART-DIAG] ... secretEnvVars unchanged (5 keys)
[GW-RESTART-DIAG] ... needsHardRestart=false (envChanged=false bindingsChanged=false mcpBridgeChanged=false configChanged=true restartFlag=false)
[GW-RESTART-DIAG] ... ──── NO RESTART, hot-reload only. reason=agent-updated
```

#### 3.2.6 自动重启调度

```
[GW-RESTART-DIAG] ... scheduling gateway restart attempt 1/5 in 3000ms
[GW-RESTART-DIAG] ... restart context: port=none, configPath=.../openclaw.json, stateDir=.../state
[GW-RESTART-DIAG] ... gateway auto-restart limit reached (5 attempts), giving up
```

#### 3.2.7 延迟重启

```
[GW-RESTART-DIAG] ... scheduleDeferredGatewayRestart: scheduling deferred restart, polling every 3000ms, max wait 300000ms (reason: app-config-change)
[GW-RESTART-DIAG] ... scheduleDeferredGatewayRestart: already scheduled, skipping (reason: skills-changed)
[GW-RESTART-DIAG] ... executeDeferredGatewayRestart: performing deferred restart (reason: app-config-change)
[GW-RESTART-DIAG] ... scheduleDeferredGatewayRestart: max wait exceeded, forcing restart (reason: app-config-change)
```

---

## 4. 如何利用诊断日志排查问题

### 4.1 提取完整重启时间线

```bash
grep 'GW-RESTART-DIAG' ~/Library/Logs/wulu/main.log
```

### 4.2 只看重启决策和执行

```bash
grep 'GW-RESTART-DIAG.*\(HARD RESTART\|NO RESTART\|DEFERRED\|restartGateway: reason\|gateway process exited\|auto-restart\)' ~/Library/Logs/wulu/main.log
```

### 4.3 常见场景分析

#### 场景 A：用户什么都没做，gateway 却重启了

**排查步骤**：
1. grep 找到重启时刻的 `HARD RESTART EXECUTING` 或 `restartGateway: reason=` 日志
2. 看 reason 字符串确定触发源
3. 如果 reason 是 `config-sync:xxx`，往上找 `syncOpenClawConfig START reason=xxx`，看四个子条件哪个为 true

**常见原因**：
- `envChanged=true`：后台 token 刷新导致 API key 变化
- `mcpBridgeChanged=true`：MCP bridge 端口变化
- `configChanged=true restartFlag=true`：`store:set app_config` 被触发（可能是 UI 自动保存）

#### 场景 B：Gateway 反复重启（restart loop）

**排查步骤**：
1. grep `scheduling gateway restart attempt` 看重试计数
2. grep `gateway process exited with code=` 看退出码
3. grep `gateway.log tail` 看崩溃前的 gateway 日志

**常见原因**：
- `code=1, signal=none`：gateway 启动后因配置错误退出
- `code=null, signal=SIGKILL`：进程被系统 OOM killer 杀掉
- `code=null, signal=SIGSEGV`：gateway 内部段错误

#### 场景 C：会话进行中 gateway 重启

**排查步骤**：
1. 看是否有 `RESTART DEFERRED` 日志 → 说明系统检测到了活跃会话并尝试延迟
2. 如果有 `max wait exceeded, forcing restart` → 延迟超过 5 分钟后被强制重启
3. 如果没有 DEFERRED → `hasActiveGatewayWorkloads()` 返回了 false（会话可能已完成或未被正确跟踪）

#### 场景 D：IM 平台操作后 gateway 重启

**排查步骤**：
1. grep `im-gateway-start:` 或 `im-gateway-stop:` 确定哪个平台触发了 syncOpenClawConfig
2. 看 `needsHardRestart` 的四个子条件，确认是 `bindingsChanged` 还是其他原因

### 4.4 一次典型重启的完整日志链路

以"用户修改 API key 触发重启"为例：

```
[GW-RESTART-DIAG] 2026-04-27T15:36:53.100+08:00 ──── syncOpenClawConfig START reason=app-config-change restartIfRunning=true
[GW-RESTART-DIAG] 2026-04-27T15:36:53.105+08:00 sync() ok=true changed=true bindingsChanged=false
[GW-RESTART-DIAG] 2026-04-27T15:36:53.106+08:00 SECRET ENV VARS CHANGED!
[GW-RESTART-DIAG] 2026-04-27T15:36:53.106+08:00   modified: WULU_APIKEY_openai prev=sk-abc123... next=sk-def456...
[GW-RESTART-DIAG] 2026-04-27T15:36:53.107+08:00 needsHardRestart=true (envChanged=true bindingsChanged=false mcpBridgeChanged=false configChanged=true restartFlag=true)
[GW-RESTART-DIAG] 2026-04-27T15:36:53.108+08:00 ──── HARD RESTART EXECUTING. reason=app-config-change, phase=running, port=18789
[GW-RESTART-DIAG] 2026-04-27T15:36:53.109+08:00 stopGatewayProcess: sending graceful kill to pid=12345
[GW-RESTART-DIAG] 2026-04-27T15:36:53.350+08:00 gateway process exited with code=null, signal=SIGTERM
[GW-RESTART-DIAG] 2026-04-27T15:36:53.351+08:00 startGateway: reason=config-sync:app-config-change, currentPhase=ready, port=none
```

从这条日志可以清晰看到：
1. **谁触发的**：`reason=app-config-change`（用户保存应用设置）
2. **为什么要重启**：`envChanged=true`（API key 变了）
3. **重启过程**：graceful kill pid=12345 → SIGTERM 退出 → 重新启动

---

## 5. 已发现的潜在问题

通过代码审查发现以下可能导致"莫名重启"的设计问题（诊断日志已覆盖，待收集用户日志后确认）：

### 5.1 代理切换双重重启

当用户切换代理设置时，两条独立的代码路径同时触发重启：
- **路径 1**：`store:set` IPC handler → `syncOpenClawConfig({ restartGatewayIfRunning: true })`
- **路径 2**：`store.onDidChange('app_config')` → `restartGateway('proxy-change')`

两条路径由同一个 `store.set()` 调用触发，可能导致并发的 stop+start 竞态。

### 5.2 `restartGatewayIfRunning: true` 范围过广

`store:set app_config` 对所有应用配置变更都传 `restartGatewayIfRunning: true`，包括主题切换、语言切换等与 gateway 无关的变更。只要 `openclaw.json` 有任何 diff，就会触发硬重启。

### 5.3 `restartGateway()` 缺少重入保护

`restartGateway()` 不像 `startGateway()` 那样有 `startGatewayPromise` 去重保护。并发调用可能导致两次 `stopGateway()` 对同一进程执行。
