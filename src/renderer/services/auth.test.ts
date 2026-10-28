import { ProviderName } from '@shared/providers';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  authService,
  mapPricingCatalogTextModelsToServerModels,
  mapPricingCatalogToPublicServerModels,
} from './auth';

afterEach(() => {
  vi.doUnmock('./cowork');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('browser login persists the same account in cloud settings', async () => {
  const updateConfig = vi.fn().mockResolvedValue(true);
  vi.doMock('./cowork', () => ({ coworkService: { updateConfig } }));
  vi.spyOn(authService, 'fetchProfileSummary').mockResolvedValue();
  vi.spyOn(authService, 'refreshQuota').mockResolvedValue();
  vi.stubGlobal('window', { electron: { auth: {
    exchange: vi.fn().mockResolvedValue({ success: true, user: { yid: 'community-author', nickname: 'Author', email: 'author@example.com', avatarUrl: null }, quota: null }),
    getAccessToken: vi.fn().mockResolvedValue('local-test-session'),
    getModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
  } } });
  expect(await authService.handleCallback('local-test-code')).toBe(true);
  expect(updateConfig).toHaveBeenCalledWith({ wuluCloudToken: 'local-test-session', wuluCloudEmail: 'author@example.com', wuluCloudEnabled: true });
});

describe('pricing catalog model mapping', () => {
  test('maps public text models to locked server models', () => {
    const [model] = mapPricingCatalogTextModelsToServerModels([
      {
        modelId: 'qwen3.7-plus',
        modelName: 'Qwen3.7-Plus',
        provider: 'WULU',
        providerLabel: 'WULU Plan',
        description: 'Strong multimodal model',
        supportsImage: true,
        supportsThinking: true,
        contextWindow: 1_000_000,
        costMultiplier: 1.6,
      },
    ]);

    expect(model).toMatchObject({
      id: 'qwen3.7-plus',
      name: 'Qwen3.7-Plus',
      provider: 'WULU Plan',
      providerKey: ProviderName.WULUServer,
      isServerModel: true,
      accessible: false,
      description: 'Strong multimodal model',
      supportsImage: true,
      supportsThinking: true,
      contextWindow: 1_000_000,
      costMultiplier: 1.6,
    });
  });

  test('maps only textModels from the pricing catalog', () => {
    const models = mapPricingCatalogToPublicServerModels({
      textModels: [
        {
          modelId: 'MiniMax-M3',
          modelName: 'MiniMax M3',
        },
      ],
      imageModels: [
        {
          modelId: 'image-01',
          modelName: 'MiniMax-Image-01',
        },
      ],
      videoModels: [
        {
          modelId: 'happyhorse-1.0-i2v',
          modelName: 'HappyHorse',
        },
      ],
    });

    expect(models.map(model => model.id)).toEqual(['MiniMax-M3']);
    expect(models[0].accessible).toBe(false);
  });
});

describe('login diagnostics', () => {
  test('persists renderer lifecycle logs without including the login URL', async () => {
    const fromRenderer = vi.fn();
    const login = vi.fn().mockResolvedValue({ success: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.stubGlobal('window', {
      electron: {
        api: {
          fetch: vi.fn().mockResolvedValue({
            ok: true,
            data: { data: { value: 'https://WULU.youdao.com/portal#/login' } },
          }),
        },
        auth: { login },
        log: { fromRenderer },
      },
    });

    await authService.login();

    expect(login).toHaveBeenCalledWith('https://WULU.youdao.com/portal#/login');
    expect(fromRenderer).toHaveBeenCalledWith(
      'info',
      'AuthService',
      expect.stringMatching(/^login attempt \d+ started$/),
    );
    expect(fromRenderer).toHaveBeenCalledWith(
      'info',
      'AuthService',
      expect.stringMatching(/^login attempt \d+ handed off to the system browser$/),
    );
    expect(fromRenderer.mock.calls.flat().join(' ')).not.toContain('WULU.youdao.com');
  });

  test('records a warning while preserving the existing non-throwing IPC failure behavior', async () => {
    const fromRenderer = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('window', {
      electron: {
        api: {
          fetch: vi.fn().mockResolvedValue({
            ok: true,
            data: { data: { value: 'https://WULU.youdao.com/portal#/login' } },
          }),
        },
        auth: { login: vi.fn().mockResolvedValue({ success: false, error: 'open failed' }) },
        log: { fromRenderer },
      },
    });

    await expect(authService.login()).resolves.toBeUndefined();

    expect(fromRenderer).toHaveBeenCalledWith(
      'warn',
      'AuthService',
      expect.stringMatching(/^login attempt \d+ could not open the system browser$/),
    );
  });
});
