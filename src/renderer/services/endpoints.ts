/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { configService } from './config';

export const normalizeServerApiBaseUrl = (configured?: string) => {
  return (configured || 'https://ai.005656.xyz').replace(/\/+$/, '');
};

/** Set VITE_WULU_SERVER_API_URL when building for a non-production backend. */
export const getServerApiBaseUrl = () => normalizeServerApiBaseUrl(
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_WULU_SERVER_API_URL?.trim(),
);

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

// 自动更新
export const getUpdateCheckUrl = () => `${getServerApiBaseUrl()}/api/update/check`;

// 手动检查更新
export const getManualUpdateCheckUrl = () => `${getServerApiBaseUrl()}/api/update/check-manual`;

export const getFallbackDownloadUrl = () => `${getServerApiBaseUrl()}/download-list`;

// Skill 商店
export const getSkillStoreUrl = () => `${getServerApiBaseUrl()}/api/skill-store`;

// Kit 商店
export const getKitStoreUrl = () => `${getServerApiBaseUrl()}/api/kit-store`;

// 登录地址
export const getLoginOvermindUrl = () => `${getServerApiBaseUrl()}/api/auth/login-url`;

// Portal 页面
const getPortalBase = () => `${getServerApiBaseUrl()}/portal#`;

export const PortalPricingKeyfrom = {
  HtmlShare: 'html_share',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export const getPortalLoginUrl = () => `${getPortalBase()}/login`;
export const getPortalPricingUrl = (keyfrom?: PortalPricingKeyfrom) => (
  `${getPortalBase()}/pricing${keyfrom ? `?keyfrom=${encodeURIComponent(keyfrom)}` : ''}`
);
export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/invitation`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/profile?activity=credits_reset${campaignCode ? `&campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);
