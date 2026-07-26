<h1 align="center">
  <img src="public/logo.png" alt="WULU" width="96"><br>
  伍陆超级智能体
</h1>

<p align="center">
  <strong>7×24 小时全场景个人助理 Agent</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-FFD700?style=flat-square&labelColor=000000&color=FFD700" alt="全平台" />
  <img src="https://img.shields.io/badge/Electron-40-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 40" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/License-MIT-FFD700?style=flat-square" alt="MIT" />
</p>

---

## 功能

### 桌面协作会话

在本地项目和文件上运行长任务 Agent，实时流式输出进度、保留会话历史、渲染工具输出，敏感操作前请求确认。

### 多 Agent 工作流

创建专属 Agent，各自拥有独立身份、模型选择、技能集、工作目录和 IM 绑定。主 Agent 处理通用工作，专项 Agent 处理重复角色。

### 技能系统

内置 28+ 技能：网页搜索、Word / Excel / PPT 生成、PDF 处理、Remotion 视频生成、浏览器自动化、图片/视频生成、股票研究、内容写作、邮件、天气、技能创建等。

### MCP 服务器

通过 Model Context Protocol 连接外部工具和数据源，用户自定义的服务器在本地存储并同步启用。

### 定时任务

创建周期性工作——每日新闻摘要、收件箱汇总、网站监控、周报生成等。

### IM 远程控制

从微信、企业微信、钉钉、飞书、QQ、Telegram、Discord、NetEase IM、POPO、邮件等渠道远程召唤桌面 Agent。

### 富媒体输出

预览和管理生成的 HTML、SVG、图片、视频、Mermaid 图表、代码、Markdown、文档等。

### 本地记忆与数据

会话和应用数据本地 SQLite 持久化，工作区记忆支持 `MEMORY.md`、`USER.md`、每日笔记跨会话传承。

---

## 下载安装

| 平台 | 格式 |
|------|------|
| Windows (x64 / arm64) | `.exe` (NSIS) |
| macOS (Apple Silicon / Intel / Universal) | `.dmg` |
| Linux (x64 / arm64) | `.AppImage` / `.deb` / `.rpm` |

信创系统（统信 UOS、麒麟、openEuler）使用 `.deb` 或 `.rpm` 包。

---

## 从源码运行

要求 Node.js >= 24.15.0

```bash
git clone https://github.com/wulu318/wulu-superagent.git
cd wulu-superagent
npm install
npm run electron:dev
```

## 打包构建

```bash
# macOS
npm run dist:mac
npm run dist:mac:x64
npm run dist:mac:universal

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

---

## 许可证

[MIT License](LICENSE)

Copyright (c) 2026 WULU  
Copyright (c) 2025-2026 NetEase Youdao
