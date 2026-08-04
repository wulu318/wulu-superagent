/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { configService } from './config';

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

// 自动更新
export const getUpdateCheckUrl = () => isTestModeEnabled()
  ? 'https://ai.005656.xyz/api/update/check'
  : 'https://ai.005656.xyz/api/update/check';

// 手动检查更新
export const getManualUpdateCheckUrl = () => isTestModeEnabled()
  ? 'https://ai.005656.xyz/api/update/check-manual'
  : 'https://ai.005656.xyz/api/update/check-manual';

export const getFallbackDownloadUrl = () => isTestModeEnabled()
  ? 'https://ai.005656.xyz/download-list'
  : 'https://ai.005656.xyz/download-list';

// Skill 商店
export const getSkillStoreUrl = () => isTestModeEnabled()
  ? 'https://ai.005656.xyz/api/skill-store'
  : 'https://ai.005656.xyz/api/skill-store';

// Kit 商店
export const getKitStoreUrl = () => isTestModeEnabled()
  ? 'https://ai.005656.xyz/api/kit-store'
  : 'https://ai.005656.xyz/api/kit-store';

// 登录地址
export const getLoginOvermindUrl = () => isTestModeEnabled()
  ? 'https://ai.005656.xyz/api/auth/login-url'
  : 'https://ai.005656.xyz/api/auth/login-url';

// Portal 页面
const PORTAL_BASE_TEST = 'https://ai.005656.xyz/portal#';
const PORTAL_BASE_PROD = 'https://ai.005656.xyz/portal#';

const getPortalBase = () => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

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
