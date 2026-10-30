import { CommunityAction, type CommunityRequest, type CommunityResponse } from '../../shared/community/constants';
import { i18nService } from './i18n';

export async function communityRequest(request: CommunityRequest): Promise<NonNullable<CommunityResponse['data']>> {
  const response = await window.electron.community.request(request);
  if (!response.success) {
    const message = response.status === 401 ? i18nService.t('communityLoginRequired')
      : response.status === 404 ? i18nService.t('communityUnavailable')
        : response.error || i18nService.t('communityRequestFailed');
    throw new Error(message);
  }
  return response.data || {};
}

export function nextCommunityVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(version);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : '1.0.1';
}

export const communityService = {
  list: () => communityRequest({ action: CommunityAction.List }),
  history: (id: string) => communityRequest({ action: CommunityAction.History, id }),
  withdraw: (id: string) => communityRequest({ action: CommunityAction.Withdraw, id }),
};
