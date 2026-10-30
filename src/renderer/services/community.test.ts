import { afterEach, expect, test, vi } from 'vitest';

import { CommunityAction } from '../../shared/community/constants';
import { communityRequest, nextCommunityVersion } from './community';

afterEach(() => vi.unstubAllGlobals());
test('updates published versions automatically without requiring user input', () => {
  expect(nextCommunityVersion('1.0.0')).toBe('1.0.1');
  expect(nextCommunityVersion('2.3.9')).toBe('2.3.10');
});
test('submissions use IPC instead of sending users to a website', async () => {
  const request = vi.fn().mockResolvedValue({ success: true, data: { items: [] } }); const openExternal = vi.fn();
  vi.stubGlobal('window', { electron: { community: { request }, shell: { openExternal } } });
  expect(await communityRequest({ action: CommunityAction.List })).toEqual({ items: [] });
  expect(request).toHaveBeenCalledWith({ action: CommunityAction.List }); expect(openExternal).not.toHaveBeenCalled();
});
