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
  <em>基于 <a href="https://github.com/netease-youdao/LobsterAI">LobsterAI</a> (NetEase Youdao) 深度定制</em>
</p>

<p align="center">
  <strong>全场景办公助手智能体 — 7x24 小时帮你干活</strong><br/>
  Fork from NetEase Youdao LobsterAI with WULU brand customization.
</p>

---

## Relationship with Upstream

This project is forked from [netease-youdao/LobsterAI](https://github.com/netease-youdao/LobsterAI) (MIT License) with the following customizations:

| Customization | Details |
|---------------|---------|
| **Brand** | WULU SuperAgent / 伍陆超级智能体 |
| **Icon** | Golden W lettermark on pure black with glow |
| **Dark theme** | Pure black `#000000` + Gold `#FFD700` accent |
| **Light theme** | White background + Deep gold accent |
| **Platforms** | Added Windows arm64, Linux arm64, Xinchuang (deb/rpm) |
| **Upstream sync** | GitHub Actions auto-detects upstream updates |

All features are identical to upstream LobsterAI, including: Multi-Agent workflows, 28+ built-in skills, MCP protocol support, scheduled tasks, IM remote control, local memory, etc.

## Install

Download from [GitHub Releases](https://github.com/wulu-superagent/wulu-superagent/releases):

| Platform | Format |
|----------|--------|
| Windows (x64/arm64) | `.exe` (NSIS) |
| macOS (Apple Silicon / Intel / Universal) | `.dmg` |
| Linux (x64/arm64) | `.AppImage` / `.deb` / `.rpm` |

For Xinchuang systems (UOS, Kylin, openEuler), use `.deb` or `.rpm` packages.

## Build from Source

```bash
git clone https://github.com/wulu-superagent/wulu-superagent.git
cd wulu-superagent
npm install
npm run electron:dev
```

## License

[MIT License](LICENSE)

Copyright (c) 2026 WULU  
Copyright (c) 2025-2026 NetEase Youdao
