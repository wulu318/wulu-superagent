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
  ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/update'
  : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/update';

// 手动检查更新
export const getManualUpdateCheckUrl = () => isTestModeEnabled()
  ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/update-manual'
  : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/update-manual';

export const getFallbackDownloadUrl = () => isTestModeEnabled()
  ? 'https://wulu-superagent.com/#/download-list'
  : 'https://wulu-superagent.com/#/download-list';

// Skill 商店
export const getSkillStoreUrl = () => isTestModeEnabled()
  ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/skill-store'
  : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/skill-store';

// Kit 商店
export const getKitStoreUrl = () => isTestModeEnabled()
  ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/kit-store'
  : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/kit-store';

// 登录地址
export const getLoginOvermindUrl = () => isTestModeEnabled()
  ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/login-url'
  : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/login-url';

// Portal 页面
const PORTAL_BASE_TEST = 'https://wulu-superagent.com/portal#';
const PORTAL_BASE_PROD = 'https://wulu-superagent.com/portal#';

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
