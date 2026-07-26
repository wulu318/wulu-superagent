/**
 * WULU 品牌常量 — 集中管理，减少与上游同步冲突
 *
 * 使用方式：import { BRAND } from '../brand';
 * 所有品牌相关值从此处读取，不硬编码到组件中。
 */
export const BRAND = {
  /** 中文品牌名 */
  name: '伍陆超级智能体',
  /** 英文品牌名 */
  nameEn: 'WULU SuperAgent',
  /** 短名（用于窗口标题、托盘等） */
  shortName: 'WULU',
  /** 应用 ID */
  appId: 'com.wulu.superagent',
  /** 协议 scheme */
  protocolScheme: 'wulu',
  /** 作者 */
  author: 'WULU',
  /** 邮箱 */
  email: 'contact@wulu-superagent.dev',
  /** 品牌域名（可用于 URL 构建） */
  domain: 'wulu-superagent',
  /** 上游声明 */
  basedOn: 'LobsterAI by NetEase Youdao',

  /** 主色系 */
  colors: {
    /** 主强调色 — 金色 */
    accent: '#FFD700',
    /** 主强调色 hover */
    accentHover: '#FFC107',
    /** 低饱和强调 */
    accentMuted: '#B8860B',
    /** 蓝色辅助色（保留科技感） */
    blue: '#3B82F6',
    /** 蓝色 hover */
    blueHover: '#60A5FA',
    /** 暗黑模式纯黑 */
    darkBg: '#000000',
    /** 暗黑次级 */
    darkBgSecondary: '#0A0A0A',
    /** 亮色主背景 */
    lightBg: '#FFFFFF',
  },

  /** 图标路径 */
  icons: {
    logo: '/wulu-logo.png',
    trayDark: 'resources/tray/tray-icon-dark.png',
    trayLight: 'resources/tray/tray-icon-light.png',
  },
} as const;

/** 类型导出，方便其他模块使用 */
export type Brand = typeof BRAND;
