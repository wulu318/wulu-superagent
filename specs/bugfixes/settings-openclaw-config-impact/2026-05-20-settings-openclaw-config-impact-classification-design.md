# 设置页 OpenClaw 配置影响分类修复设计文档

## 1. 概述

### 1.1 问题

设置页的保存逻辑目前没有区分配置变更对 OpenClaw 的真实影响。用户只修改「外观」主题时，保存链路仍会走到 IM 配置同步，并在近期改动后触发 OpenClaw Gateway 硬重启。

更广义的问题是：设置页里既有完全不依赖 OpenClaw 的偏好项，也有需要写入 `openclaw.json` 的配置项，还有必须重启 Gateway 进程才能生效的运行态配置。当前代码把这些影响散落在多个调用点里，缺少统一分类，导致两类风险：

1. 无关配置误触发 Gateway 重启，例如切换主题。
2. 修复无关重启时，可能漏掉需要同步或重启 OpenClaw 的配置，例如 `skipMissedJobs` 和 `dreaming*`。

### 1.2 关键结论

修改 `openclaw.json` 不等于必须重启 Gateway。当前架构已经把「配置同步」和「Gateway 进程重启」分开：

- `syncOpenClawConfig({ restartGatewayIfRunning: false })`：写入 `openclaw.json`，依赖 OpenClaw Gateway 的配置热加载。
- `syncOpenClawConfig({ restartGatewayIfRunning: true })`：写入配置后要求运行中的 Gateway 硬重启。
- `syncOpenClawConfig()` 内部仍会因为 secret env vars 或 bindings 变化自动升级成硬重启。

因此，设置项应按影响分为三类，而不是简单分成「依赖 OpenClaw」和「不依赖 OpenClaw」：

| 影响级别 | 含义 | 处理方式 |
| --- | --- | --- |
| `none` | 不影响 OpenClaw | 只保存业务配置，不 sync，不重启 |
| `sync` | 影响 `openclaw.json` 或 OpenClaw workspace，但可热加载 | 调用 `syncOpenClawConfig(..., restartGatewayIfRunning: false)` |
| `restart` | 影响 Gateway 进程环境、channel runtime、bindings 或系统代理 | 调用 sync，并要求或允许硬重启 |

### 1.3 根因

当前根因有三层：

1. `Settings.tsx` 全局保存会无条件调用 `imService.saveAndSyncConfig()`，原意是支持「先改 IM，再切 tab 保存」，但它让外观、快捷键、关于页等无关设置也进入 IM sync。
2. 近期 `im:config:sync` 改成无条件 `restartGatewayIfRunning: true`，导致无 IM diff 时也能硬重启。
3. OpenClaw impact 规则散落在 `store:set app_config`、`cowork:config:set`、`im:config:sync`、plugin IPC、system proxy watcher 等入口，没有一个统一的分类与合并规则。

同时，`cowork:config:set` 当前只把 `executionMode`、`agentEngine`、`workingDirectory`、`embedding*` 纳入 OpenClaw sync 条件；但 `openclawConfigSync.ts` 实际还使用了 `skipMissedJobs` 和 `dreaming*`。它们现在可能依赖后续 IM sync 的副作用才写入 `openclaw.json`，修复 IM 无条件同步时必须一并补正。

2026-05-21 日志验证显示，OpenClaw Gateway 对 `plugins.entries.memory-core.config.dreaming` 的热加载判断会升级为 gateway restart：`config change requires gateway restart (plugins.entries.memory-core.config.dreaming)`。因此本轮先把 `dreaming*` 按当前 runtime 行为保守归类为 `restart`；只有未来 `memory-core` 明确支持 Dreaming cron job 的进程内热更新后，才能降级回 `sync`。

## 2. 用户场景

### 场景 1：只修改外观主题

**Given** Gateway 正在运行  
**When** 用户在「设置 - 外观」切换主题并保存  
**Then** 主题保存并生效，但不触发 `syncOpenClawConfig`，更不触发 Gateway 重启。

### 场景 2：修改模型 Base URL 或 API Format

**Given** Gateway 正在运行，当前模型 provider 已配置  
**When** 用户在「设置 - 模型」修改 provider 的 `baseUrl` 或 `apiFormat` 并保存  
**Then** `openclaw.json` 中 `models.providers` 被更新，Gateway 进程不硬重启，后续请求应使用新的 provider 配置。

### 场景 3：修改 Provider API Key

**Given** Gateway 正在运行，provider 使用 `${WULU_APIKEY_*}` 占位符  
**When** 用户修改该 provider 的 API key 或 OAuth token 并保存  
**Then** OpenClaw 配置同步后，Gateway 需要硬重启，因为运行中进程继承的 env 不会自动改变。

### 场景 4：修改系统代理

**Given** Gateway 正在运行  
**When** 用户打开或关闭「使用系统代理」  
**Then** 应重新应用进程代理环境，并重启 Gateway，使 provider request proxy 行为一致。

### 场景 5：修改 IM 通道配置

**Given** Gateway 正在运行  
**When** 用户修改 IM channel 的账号、credential、启用状态、连接模式或绑定 Agent  
**Then** 这些普通设置编辑应先进入设置页待保存状态；用户点击右下角保存后，同步 OpenClaw 配置，并根据 diff 判断是否硬重启 Gateway，一轮保存最多触发一次重启。

### 场景 5B：IM 扫码、OAuth 或授权窗口成功

**Given** Gateway 正在运行  
**When** 用户完成微信扫码、钉钉/飞书/企微等授权或任意 IM quick setup，并产生新的账号、credential 或登录态  
**Then** 授权结果应进入设置页的待应用配置；实现上可以先持久化到 Wulu 本地配置以避免丢失 credential，但在用户点击右下角保存前，不同步到 OpenClaw，也不触发 Gateway restart 或 channel restart。点击保存后，IM diff 与其它设置 diff 合并判断，一轮保存最多触发一次 Gateway 重启。若授权成功只改变 runtime 登录态、没有明显 config fingerprint diff，也必须记录一个「保存时重启」标记，避免保存时被误判为无变化。

### 场景 6：修改定时任务补跑策略

**Given** Gateway 正在运行  
**When** 用户修改 `skipMissedJobs`  
**Then** 只同步 `openclaw.json`，不应借助 IM sync，也不应默认硬重启。

### 场景 6B：修改 Dreaming 配置

**Given** Gateway 正在运行  
**When** 用户修改 `dreamingEnabled/frequency/model/timezone`  
**Then** 同步 `openclaw.json` 后应明确触发 Gateway 重启，因为当前 OpenClaw runtime 会把 `memory-core.config.dreaming` 判定为 restart-required，不能继续假设它可热加载。

### 场景 7：修改插件运行态

**Given** Gateway 正在运行  
**When** 用户安装、卸载、启停或配置 OpenClaw plugin  
**Then** 同步插件配置并重启 Gateway。插件安装、卸载、启停会改变 Gateway 的插件加载集合，不能假设运行中的 Gateway 能可靠热加载；插件配置变更第一阶段也按重启处理，除非未来插件 manifest 明确声明该配置支持 hot reload。

## 3. 功能需求

### FR-1：引入统一 OpenClaw 影响分类

新增统一的影响分类类型，作为所有设置保存入口的判断依据：

```typescript
export const OpenClawConfigImpact = {
  None: 'none',
  Sync: 'sync',
  Restart: 'restart',
} as const;
export type OpenClawConfigImpact =
  typeof OpenClawConfigImpact[keyof typeof OpenClawConfigImpact];
```

每次设置保存应得到一个 `ImpactDecision`：

```typescript
interface ImpactDecision {
  impact: OpenClawConfigImpact;
  reasons: string[];
}
```

多个设置同时保存时，按 `restart > sync > none` 合并。

### FR-2：不依赖 OpenClaw 的配置不得触发 sync 或 restart

以下设置变更应为 `none`：

| 设置区域 | 配置项 |
| --- | --- |
| 外观 | `theme`、`themeId`、主题色选择 |
| 通用 | `language`、`autoLaunch`、`preventSleep`、`sqliteAutoBackupEnabled` |
| 快捷键 | `shortcuts` |
| 关于 | `testMode`、检查更新、打开链接、导出日志 |
| Email tab | `EmailSkillConfig` 的 skill config |
| Cowork Memory entries | `MEMORY.md` 条目增删改 |

### FR-3：可热加载的 OpenClaw 配置只触发 sync

以下设置变更应为 `sync`：

| 设置区域 | 配置项 | 写入位置 |
| --- | --- | --- |
| 模型 | provider `baseUrl`、`apiFormat`、模型列表、模型名称、`supportsImage`、`contextWindow`、`customParams`、默认模型 | `models.providers`、`agents.defaults.model`、`agents.defaults.models` |
| 模型 | provider 启停、删除、自定义 provider 元数据 | `models.providers`，secret 变化由后续 env diff 决定是否升级 |
| Cowork | `embeddingEnabled/provider/model/remoteBaseUrl/remoteApiKey/vectorWeight` | `agents.defaults.memorySearch` |
| Cowork | `skipMissedJobs` | `cron.skipMissedJobs` |
| Session Policy | `openClawSessionPolicy.keepAlive` | `session` |
| MCP | MCP servers | `mcp.servers` |

这些变更必须写入 OpenClaw 配置，但不应主动传 `restartGatewayIfRunning: true`。

### FR-4：进程级或 channel runtime 变更必须支持硬重启

以下设置变更应为 `restart`，或由 `syncOpenClawConfig()` 的 env/bindings 检测自动升级为硬重启：

| 设置区域 | 配置项 | 原因 |
| --- | --- | --- |
| 通用 | `useSystemProxy` | 影响进程代理环境和 provider request proxy |
| 模型 | provider API key、OAuth access token、GitHub Copilot token、MiniMax OAuth token | 运行中 Gateway env 不会自动变化 |
| IM | Telegram/Discord/飞书/钉钉/QQ/企微/POPO/Email/NIM 等 credential | channel secret env 或 channel runtime 状态变化 |
| IM | channel 启停、连接模式、账号替换、登录态变化 | channel runtime 热加载不可靠 |
| IM | 扫码、OAuth、授权窗口、quick setup 成功后的账号/credential/login state | 属于设置页 IM diff，保存后与其它 IM 变更合并为一次 restart |
| IM | `platformAgentBindings` | OpenClaw channel plugins 当前不热加载 bindings |
| Cowork Dreaming | `dreamingEnabled/frequency/model/timezone` | 当前 OpenClaw runtime 将 `memory-core.config.dreaming` 判定为 restart-required |
| Plugins | plugin install/uninstall/enable/disable | 改变 Gateway 插件加载集合，运行中热加载不可靠 |
| Plugins | plugin config | 第一阶段保守重启；未来只有插件声明支持 hot reload 时才可降级为 `sync` |
| Agent | Agent working directory | workspace/session 状态可能漂移，维持现有保守策略 |

### FR-5：`syncOpenClawConfig()` 保留最终兜底

调用方的分类只能决定是否主动要求重启，不能绕过 `syncOpenClawConfig()` 的内部判断。

即使调用方传入 `restartGatewayIfRunning: false`，只要出现以下情况，仍应硬重启：

- 被 `openclaw.json` 引用的 secret env vars 变化。
- `bindingsChanged === true`。

### FR-6：IM 全局保存必须幂等

设置页底部保存可以继续支持「改完 IM 后切到其他 tab 再保存」，但 `im:config:sync` 必须先判断是否存在 IM/OpenClaw 相关 diff：

- 无 diff：返回 success + skipped，不 sync，不重启。
- 有 diff 且只改 OpenClaw channel config：sync。
- 有 credential、channel runtime 或 bindings diff：restart。
- 设置页的扫码、OAuth、授权窗口和 quick setup 不使用即时 force restart；它们只更新待应用配置，并记录必要的 runtime restart-on-save 标记，最终由右下角保存触发一次幂等 sync/restart。
- 显式 force restart 能力只保留给设置页之外的修复、运维或未来独立「立即应用」入口，不能作为设置页授权成功的默认行为。

## 4. 实现方案

### 4.1 新增影响分类模块

建议新增：

```text
src/main/libs/openclawConfigImpact.ts
```

模块职责：

1. 定义 `OpenClawConfigImpact` 常量与类型。
2. 提供 `mergeImpactDecision()`。
3. 提供 `classifyAppConfigChange(oldConfig, newConfig)`。
4. 提供 `classifyCoworkConfigChange(oldConfig, newConfig)`。
5. 提供 `classifyImOpenClawConfigChange(oldFingerprint, newFingerprint, options)`。

分类模块应尽量是纯函数，便于单测覆盖。

### 4.2 调整 `store:set app_config`

当前 `store:set app_config` 在任何 `app_config` 变化后都会调用 `syncOpenClawConfig({ reason: 'app-config-change', restartGatewayIfRunning: false })`。

建议改为：

1. `set` 前读取旧 `app_config`。
2. 保存新值。
3. 用 `classifyAppConfigChange(oldConfig, newConfig)` 判断影响。
4. `none`：不调用 `syncOpenClawConfig()`。
5. `sync`：调用 `syncOpenClawConfig({ reason: 'app-config-change', restartGatewayIfRunning: false })`。
6. `restart`：调用 `syncOpenClawConfig({ reason: 'app-config-change', restartGatewayIfRunning: true })`，或沿用系统代理专用重启路径。

`useSystemProxy` 现在已有独立 watcher 和 `restartGateway('proxy-change')`，实现时可以保留该路径，但 impact 分类里必须把它标记为 `restart`，避免未来重复误判。

### 4.3 调整 `cowork:config:set`

当前 `shouldSyncOpenClawConfig` 漏掉 `skipMissedJobs` 与 `dreaming*`。

建议改为使用 `classifyCoworkConfigChange(previousConfig, nextConfig)`：

- `none`：只保存 cowork 本地配置。
- `sync`：调用 `syncOpenClawConfig({ reason: 'cowork-config-change', restartGatewayIfRunning: false })`。
- `restart`：调用 `syncOpenClawConfig({ reason: 'cowork-config-change', restartGatewayIfRunning: true })`。

第一阶段至少要把以下字段纳入 `sync`：

- `skipMissedJobs`
- `embedding*`
- `executionMode`
- `workingDirectory`

同时把以下字段纳入 `restart`：

- `dreaming*`

`memoryEnabled`、`memoryLlmJudgeEnabled` 当前没有写入 `openclaw.json`，应暂定为 `none`。如果后续接入 OpenClaw 原生 memory policy，再升级为 `sync`。

### 4.4 调整 `im:config:sync`

建议为 IM/OpenClaw 相关输入维护稳定 fingerprint，覆盖：

- 各平台启用状态、账号、连接模式、allow list、群策略等 channel config。
- 各平台 credential 的安全摘要或版本标记。
- `settings.platformAgentBindings`。
- Email channel、NIM、网易 Bee、微信等特殊平台配置。

`im:config:sync` 行为：

1. 计算当前 fingerprint。
2. 如果 fingerprint 未变化且没有 restart-on-save 标记，返回 `{ success: true, skipped: true }`。
3. 如果 fingerprint 变化，分类 diff：
   - 普通 channel config：`sync` 或保守 `restart`。
   - credential、启停、连接模式、bindings：`restart`。
4. 根据分类在设置页保存链路中立即执行 `syncOpenClawConfig({ restartGatewayIfRunning })`；非设置页的连续即时请求才允许进入 debounced sync。
5. 同步成功后更新 last synced fingerprint。

设置页右下角保存调用 `im:config:sync` 时不应再走延迟 debounce。保存按钮应等待本轮 `syncOpenClawConfig()` 完成或 Gateway restart 被执行/明确 deferred 后再返回，避免用户看到“保存完成后过一会儿才重启”的滞后体验。Debounce 只保留给设置页之外的连续即时 sync 请求。

考虑当前 IM channel 热加载能力不稳定，第一阶段可以把所有 IM/OpenClaw fingerprint diff 保守归为 `restart`，但必须满足幂等：没有 diff 的设置保存不能重启。

普通 IM 设置控件不应直接调用会触发 Gateway sync/restart 的即时入口。启停、删除、allow list、连接模式、手动 credential 编辑等都属于设置编辑，应只更新待保存配置，最终由设置页右下角保存调用 `im:config:sync` 后统一判断影响并最多重启一次。

扫码、OAuth、授权窗口和 quick setup 成功也必须遵循设置页提交语义。成功结果可以立即写入 Wulu 本地配置，避免用户完成授权后因关闭弹窗或页面刷新丢失 credential；但它仍然只是待应用配置，必须等右下角保存后才同步到 OpenClaw，并根据 IM fingerprint diff 或 restart-on-save 标记决定是否重启 Gateway。该规则适用于所有 IM 平台，不只适用于微信。

对于微信这类登录态主要写入 Gateway runtime/state 的平台，扫码成功时 config fingerprint 可能不变化，仍应设置 restart-on-save 标记。这个标记只能在右下角保存时生效，不能在扫码成功时立即触发 Gateway 重启。

### 4.5 保留 `syncOpenClawConfig()` 的硬重启兜底

`syncOpenClawConfig()` 继续保留以下逻辑：

```typescript
const needsHardRestart =
  secretEnvVarsChanged ||
  syncResult.bindingsChanged === true ||
  options.restartGatewayIfRunning === true;
```

但设置页调用方只能在 impact 为 `restart` 的保存阶段传 `restartGatewayIfRunning: true`。显式 force 场景应限定在设置页之外的修复、运维或未来独立「立即应用」入口。这样模型 `baseUrl/apiFormat` 变更可以热加载，API key 变更仍会因为 `secretEnvVarsChanged` 自动重启。

### 4.6 设置页保存链路

`Settings.tsx` 底部保存应变成：

1. 保存 `app_config`。
2. 保存 cowork config/session policy。
3. 保存 IM 待提交配置，并对 IM 调用一个幂等 sync 入口，或仅在 renderer 标记 IM dirty 时调用。
4. 不再把 IM sync 当作所有设置页的 OpenClaw sync 兜底。

主进程必须是最终判断点；renderer 的 dirty flag 只能作为减少 IPC 的优化，不能作为唯一正确性来源。

设置页内 IM 子组件应遵循同一提交语义：

1. 普通编辑控件只改 draft/local state，不直接重启 Gateway。
2. 用户点击右下角保存后，统一比较保存前后的 IM fingerprint。
3. 若多个 IM 平台同时修改，只按合并后的最高 impact 执行一次 sync/restart。
4. 扫码、OAuth、授权窗口和 quick setup 成功只更新待应用配置，并在必要时记录 restart-on-save 标记，不触发即时 sync/restart；后续右下角保存负责唯一一次应用。

## 5. 边界情况

| 场景 | 处理方式 |
| --- | --- |
| 只改主题、语言、快捷键 | `none`，不 sync，不重启 |
| 改模型 `baseUrl/apiFormat` | `sync`，写入 `openclaw.json`，不主动重启 |
| 改模型 API key | `sync` 后由 env diff 升级为 restart，或直接分类为 `restart` |
| 启用已有 provider | 写入 provider catalog；如果新增被引用 secret env，自动重启 |
| 禁用 provider | 通常只需 sync；如果 OpenClaw 热加载验证失败，再升级 |
| 改 `skipMissedJobs` | `sync`，不依赖 IM sync 副作用 |
| 改 `dreaming*` | `restart`，当前 OpenClaw runtime 要求重启 `memory-core` Dreaming 配置 |
| 安装、卸载、启停插件 | `restart`，避免插件加载集合与运行态不一致 |
| 修改插件配置 | 第一阶段 `restart`；未来插件声明 hot reload 后可降级 `sync` |
| 改 IM allow list 但不改 credential | 第一阶段可保守 `restart`；未来确认热加载后可降级 `sync` |
| 改 IM bindings | `restart` |
| 普通 IM 启停、删除、allow list、连接模式、手动 credential 编辑 | 先进入待保存状态；右下角保存后按 IM fingerprint diff 统一 sync/restart，一轮保存最多重启一次 |
| 任意 IM 扫码、OAuth、授权窗口或 quick setup 成功 | 更新待应用配置；右下角保存后按 IM fingerprint diff 统一 sync/restart，一轮保存最多重启一次 |
| 外部授权成功但 config 文件 diff 不明显 | 记录 restart-on-save 标记；设置页保存时重启一次，不在授权成功时立即重启 |
| Gateway 未运行 | 只写配置，不启动额外重启；下次启动读取新配置 |
| 多项设置同时保存 | 合并 impact，最高级别生效 |
| 同一配置重复保存 | fingerprint/旧新值相同，返回 `none` 或 skipped |

## 6. 涉及文件

| 文件 | 变更 |
| --- | --- |
| `src/main/libs/openclawConfigImpact.ts` | 新增 impact 类型、diff 分类和合并逻辑 |
| `src/main/main.ts` | `store:set app_config`、`cowork:config:set`、`im:config:sync` 改用 impact 分类 |
| `src/main/libs/openclawConfigSync.ts` | 保留硬重启兜底；必要时暴露更细的 diff 信息 |
| `src/renderer/components/Settings.tsx` | 移除无条件 IM sync 作为全局兜底；可增加 IM dirty 优化 |
| `src/renderer/services/im.ts` | 扩展 `syncConfig` 返回 `skipped` 或 impact 信息 |
| `src/main/preload.ts` | 如 IPC 返回结构变化则同步类型 |
| `src/renderer/types/electron.d.ts` | 如 IPC 返回结构变化则同步类型 |

## 7. 验收标准

1. 切换「设置 - 外观」主题并保存，不触发 `syncOpenClawConfig` 或 Gateway 硬重启。
2. 修改模型 `baseUrl` 或 `apiFormat` 后保存，`openclaw.json` 更新，Gateway PID 不变，后续请求使用新配置。
3. 修改 provider API key 后保存，Gateway 正在运行时会硬重启，并使用新 key。
4. 修改 `useSystemProxy` 后保存，Gateway 正在运行时会重启。
5. 修改 `skipMissedJobs` 后保存，`openclaw.json` 的 `cron.skipMissedJobs` 更新，不依赖 IM sync。
6. 修改 `dreaming*` 后保存，`memory-core` plugin config 更新，不依赖 IM sync，并明确触发 Gateway 重启一次。
7. 没有 IM 变更时反复保存设置，`im:config:sync` skipped，不重启。
8. 修改 IM credential、启用状态、删除实例、allow list、连接模式或 bindings 后，在点击右下角保存前不重启 Gateway；保存时立即执行 IM sync/restart 判断，保存返回前 Gateway 已重启、已跳过或因 active workload 明确 deferred。
9. 任意 IM 扫码、OAuth、授权窗口或 quick setup 成功后，在点击右下角保存前不重启 Gateway；保存后与其它 IM 变更合并，只触发一次按需重启；即使 config fingerprint 未变化，也应通过 restart-on-save 标记触发，且不再依赖保存后的 debounce 延迟。
10. 安装、卸载、启停或配置 OpenClaw plugin 后，Gateway 正在运行时会重启一次。
11. 多项设置一起保存时，impact 合并正确：任一 `restart` 触发重启，只有 `sync` 则不主动重启。

## 8. 验证计划

### 8.1 单元测试

新增 `src/main/libs/openclawConfigImpact.test.ts`：

- `theme/language/shortcuts` diff 返回 `none`。
- `provider.baseUrl/apiFormat/models` diff 返回 `sync`。
- `provider.apiKey/oauthAccessToken` diff 返回 `restart`。
- `useSystemProxy` diff 返回 `restart`。
- `skipMissedJobs` diff 返回 `sync`。
- `dreaming*` diff 返回 `restart`。
- plugin install/uninstall/enable/config diff 返回 `restart`。
- 多个 decision 合并时 `restart > sync > none`。

### 8.2 集成/手动验证

1. 启动应用并记录 Gateway PID。
2. 修改外观主题并保存，确认 PID 不变，日志无 `HARD RESTART EXECUTING`。
3. 修改模型 `baseUrl/apiFormat` 并保存，确认 `openclaw.json` 更新、PID 不变、下一次请求使用新 provider 配置。
4. 修改 API key 并保存，确认出现 `SECRET ENV VARS CHANGED` 且 Gateway 重启。
5. 修改 `skipMissedJobs`，确认 `openclaw.json` 的 `cron.skipMissedJobs` 更新，且不出现 IM sync 兜底重启。
6. 修改 `dreaming*`，确认 `memory-core` plugin config 更新，并由 impact 分类明确触发 Gateway 重启一次。
7. 连续修改多个普通 IM 设置项，确认点击右下角保存前 Gateway PID 不变，保存后只按需重启一次。
8. 完成任意 IM 扫码、OAuth、授权窗口或 quick setup，确认点击右下角保存前 Gateway PID 不变；点击保存后按 IM fingerprint diff 只触发一次 sync/restart。
9. 安装、卸载、启停或配置插件，确认 Gateway 重启一次，并且插件运行态与配置一致。

### 8.3 代码检查

实现后至少运行：

```bash
./node_modules/.bin/eslint src/main/main.ts src/main/libs/openclawConfigImpact.ts src/renderer/components/Settings.tsx src/renderer/services/im.ts
```

如果新增测试文件，运行对应 Vitest 过滤测试。
