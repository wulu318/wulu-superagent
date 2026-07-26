<h1 align="center">
  <img src="public/logo.png" alt="WULU" width="96"><br>
  伍陆超级智能体 (WULU SuperAgent)
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-FFD700?style=flat-square&labelColor=000000&color=FFD700" alt="Supported platforms" />
  <img src="https://img.shields.io/badge/Electron-40-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 40" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/License-MIT-FFD700?style=flat-square" alt="MIT License" />
  <br>
  <em>Based on <a href="https://github.com/netease-youdao/LobsterAI">LobsterAI</a> by NetEase Youdao</em>
</p>

<p align="center">
  <strong>全场景办公助手智能体 — 7x24 小时帮你干活</strong><br/>
  基于网易有道 LobsterAI 开源项目深度定制，WULU 品牌专属配色与体验。
</p>

---

## 与上游的关系

本项目 Fork 自 [netease-youdao/LobsterAI](https://github.com/netease-youdao/LobsterAI)（MIT 协议），并进行了以下定制：

| 定制项 | 说明 |
|--------|------|
| **品牌** | 伍陆超级智能体 / WULU SuperAgent |
| **图标** | 金色 W 字母 Logo（纯黑底 + 金色辉光） |
| **配色** | 暗黑模式：纯黑 `#000000` + 金色 `#FFD700` 高亮 |
| **亮色模式** | 白色背景 + 深金主色 |
| **平台** | 新增 Windows arm64、Linux arm64、信创系统 (deb/rpm) 支持 |
| **上游同步** | GitHub Actions 自动检测上游更新并创建同步 PR |

所有功能与上游 LobsterAI 完全一致，包括：多 Agent 工作流、28+ 内置技能、MCP 协议支持、定时任务、IM 远程控制、本地记忆等。

## 安装

从 [GitHub Releases](https://github.com/wulu-superagent/wulu-superagent/releases) 下载对应平台安装包：

| 平台 | 格式 |
|------|------|
| Windows (x64/arm64) | `.exe` (NSIS) |
| macOS (Apple Silicon / Intel / Universal) | `.dmg` |
| Linux (x64/arm64) | `.AppImage` / `.deb` / `.rpm` |

信创系统（统信 UOS、麒麟、openEuler）请使用 `.deb` 或 `.rpm` 包。

## 从源码构建

```bash
git clone https://github.com/wulu-superagent/wulu-superagent.git
cd wulu-superagent
npm install
npm run electron:dev
```

## 构建

```bash
# macOS
npm run dist:mac
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:mac:universal

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

## 上游同步

本项目配置了自动同步工作流（`.github/workflows/upstream-sync.yml`），每天自动检测上游 LobsterAI 更新，如有变更则创建同步 PR。

品牌定制文件（`src/brand.ts`、`src/renderer/styles/wulu-theme.css`、图标资产）在同步时自动保留 WULU 版本。

## 许可证

[MIT License](LICENSE)

Copyright (c) 2026 WULU  
Copyright (c) 2025-2026 NetEase Youdao

本项目基于网易有道 LobsterAI 开发，遵循 MIT 开源协议。
