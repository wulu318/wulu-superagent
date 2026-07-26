import { PassThrough } from 'node:stream';

import http from 'http';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
}));

import {
  __openClawTokenProxyTestUtils,
  consumeRecentOpenClawTokenProxyQuotaError,
} from './openclawTokenProxy';

const testUtils = __openClawTokenProxyTestUtils;

beforeEach(() => {
  consumeRecentOpenClawTokenProxyQuotaError();
});

type MockProxyResponse = {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  destroyed: boolean;
};

function createMockProxyResponse(): MockProxyResponse {
  const res: MockProxyResponse = {
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(() => {
      res.destroyed = true;
    }),
    on: vi.fn(),
    destroyed: false,
  };
  return res;
}

function asServerResponse(res: MockProxyResponse): http.ServerResponse {
  return res as unknown as http.ServerResponse;
}

function flushStreamEvents(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('extracts WULU monthly quota error from proxy SSE packet', () => {
  const packet = [
    'event: error',
    'data: {"type":"error","error":{"type":"proxy_error","message":"本月积分已用完","code":40202}}',
  ].join('\n');

  expect(testUtils.extractQuotaErrorFromProxySSEPacket(packet)).toEqual({
    message: '本月积分已用完',
    code: 40202,
  });
});

test('ignores generic HTTP 402 without WULU quota code or message', () => {
  const packet = [
    'event: error',
    'data: {"error":{"message":"Request failed with status 402"}}',
  ].join('\n');

  expect(testUtils.extractQuotaErrorFromProxySSEPacket(packet)).toBeNull();
});

test('scans split SSE chunks and stores a recent quota error', () => {
  const now = 1_000;
  let buffer = testUtils.scanProxySSEBufferForQuotaError(
    'event: error\ndata: {"type":"error","error":{"message":"本月',
    now,
  );

  buffer = testUtils.scanProxySSEBufferForQuotaError(
    `${buffer}积分已用完","code":40202}}\n\n`,
    now + 1,
  );

  expect(buffer).toBe('');
  expect(consumeRecentOpenClawTokenProxyQuotaError(now + 2)).toEqual({
    message: '本月积分已用完',
    code: 40202,
    capturedAt: now + 1,
  });
});

test('expires stale remembered quota errors', () => {
  testUtils.rememberQuotaError({ message: '本月积分已用完', code: 40202 }, 1_000);

  expect(consumeRecentOpenClawTokenProxyQuotaError(32_000)).toBeNull();
});

test('hydrates missing Gemini package model tool call thought signatures', () => {
  const requestBody = {
    model: 'gemini-3.5-flash-YoudaoInner',
    messages: [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_memory',
            type: 'function',
            function: {
              name: 'memory_search',
              arguments: '{"query":"福利公告"}',
            },
          },
        ],
      },
    ],
  };

  expect(testUtils.hydrateGeminiToolCallThoughtSignatures(requestBody)).toBe(true);
  expect((requestBody.messages[0].tool_calls[0] as Record<string, unknown>).extra_content).toEqual({
    google: {
      thought_signature: 'skip_thought_signature_validator',
    },
  });
  expect(requestBody.messages[0].tool_calls[0].function.extra_content).toEqual({
    google: {
      thought_signature: 'skip_thought_signature_validator',
    },
  });
  expect(requestBody.messages[0].tool_calls[0].function.thought_signature).toBe(
    'skip_thought_signature_validator',
  );
});

test('mirrors existing Gemini package model tool call thought signatures into function fields', () => {
  const requestBody = {
    model: 'gemini-3.5-flash-YoudaoInner',
    messages: [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_memory',
            type: 'function',
            extra_content: {
              google: {
                thought_signature: 'existing-signature',
              },
            },
            function: {
              name: 'memory_search',
              arguments: '{}',
            },
          },
        ],
      },
    ],
  };

  expect(testUtils.hydrateGeminiToolCallThoughtSignatures(requestBody)).toBe(true);
  expect(requestBody.messages[0].tool_calls[0].extra_content).toEqual({
    google: {
      thought_signature: 'existing-signature',
    },
  });
  expect(requestBody.messages[0].tool_calls[0].function.extra_content).toEqual({
    google: {
      thought_signature: 'existing-signature',
    },
  });
  expect(requestBody.messages[0].tool_calls[0].function.thought_signature).toBe('existing-signature');
});

test('keeps fully hydrated Gemini package model tool calls unchanged', () => {
  const requestBody = {
    model: 'gemini-3.5-flash-YoudaoInner',
    messages: [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_memory',
            type: 'function',
            extra_content: {
              google: {
                thought_signature: 'existing-signature',
              },
            },
            function: {
              name: 'memory_search',
              arguments: '{}',
              extra_content: {
                google: {
                  thought_signature: 'existing-signature',
                },
              },
              thought_signature: 'existing-signature',
            },
          },
        ],
      },
    ],
  };

  expect(testUtils.hydrateGeminiToolCallThoughtSignatures(requestBody)).toBe(false);
});

test('leaves non-Gemini package model request bodies unchanged', () => {
  const requestBody = Buffer.from(JSON.stringify({
    model: 'qwen3.5-plus-YoudaoInner',
    messages: [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_memory',
            type: 'function',
            function: {
              name: 'memory_search',
              arguments: '{}',
            },
          },
        ],
      },
    ],
  }));

  expect(testUtils.hydrateGeminiChatCompletionsBody(requestBody)).toBe(requestBody);
});

test('classifies SSE packets as terminal only on [DONE], finish_reason, or error payloads', () => {
  const terminalPackets = [
    'data: [DONE]',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    'event: error\ndata: {"message":"quota exhausted"}',
    'data: {"type":"error","error":{"message":"boom"}}',
    'event: message_stop\ndata: {"type":"message_stop"}',
  ];
  for (const packet of terminalPackets) {
    expect(testUtils.isTerminalProxySSEPacket(testUtils.parseProxySSEPacket(packet))).toBe(true);
  }

  const nonTerminalPackets = [
    'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"hi"}}]}',
    ': keep-alive comment',
    'data: not-json',
    '',
  ];
  for (const packet of nonTerminalPackets) {
    expect(testUtils.isTerminalProxySSEPacket(testUtils.parseProxySSEPacket(packet))).toBe(false);
  }
});

test('scan state observes a terminal packet split across chunk boundaries', () => {
  const scanState = testUtils.createProxySSEStreamScanState();

  let buffer = testUtils.scanProxySSEBufferForQuotaError(
    'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\ndata: [DO',
    1_000,
    scanState,
  );
  expect(scanState.sawTerminalPacket).toBe(false);

  buffer = testUtils.scanProxySSEBufferForQuotaError(`${buffer}NE]\n\n`, 1_001, scanState);
  expect(buffer).toBe('');
  expect(scanState.sawTerminalPacket).toBe(true);
});

test('flush detects a terminal packet in a trailing partial SSE frame', () => {
  const scanState = testUtils.createProxySSEStreamScanState();
  testUtils.flushProxySSEBufferForQuotaError('data: [DONE]', 1_000, scanState);
  expect(scanState.sawTerminalPacket).toBe(true);
});

test('node stream: complete SSE response ends the proxied response cleanly', async () => {
  const upstream = new PassThrough();
  const res = createMockProxyResponse();

  testUtils.pipeStreamingResponseWithQuotaScan(upstream, asServerResponse(res));
  upstream.write('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\n');
  upstream.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
  upstream.write('data: [DONE]\n\n');
  upstream.end();
  await flushStreamEvents();

  expect(res.end).toHaveBeenCalledTimes(1);
  expect(res.destroy).not.toHaveBeenCalled();
});

test('node stream: SSE response truncated by a clean upstream end is aborted', async () => {
  const upstream = new PassThrough();
  const res = createMockProxyResponse();

  testUtils.pipeStreamingResponseWithQuotaScan(upstream, asServerResponse(res));
  upstream.write('data: {"choices":[{"delta":{"content":"partial plan **"},"finish_reason":null}]}\n\n');
  upstream.end();
  await flushStreamEvents();

  expect(res.destroy).toHaveBeenCalledTimes(1);
  expect(res.end).not.toHaveBeenCalled();
});

test('node stream: upstream read error aborts the proxied response instead of ending it', async () => {
  const upstream = new PassThrough();
  const res = createMockProxyResponse();

  testUtils.pipeStreamingResponseWithQuotaScan(upstream, asServerResponse(res));
  upstream.write('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\n');
  await flushStreamEvents();
  upstream.destroy(new Error('net::ERR_CONNECTION_RESET'));
  await flushStreamEvents();

  expect(res.destroy).toHaveBeenCalledTimes(1);
  expect(res.end).not.toHaveBeenCalled();
});

test('node stream: upstream SSE error payload still passes through and ends cleanly', async () => {
  const upstream = new PassThrough();
  const res = createMockProxyResponse();

  testUtils.pipeStreamingResponseWithQuotaScan(upstream, asServerResponse(res));
  upstream.write('event: error\ndata: {"type":"error","error":{"type":"proxy_error","message":"本月积分已用完","code":40202}}\n\n');
  upstream.end();
  await flushStreamEvents();

  expect(res.end).toHaveBeenCalledTimes(1);
  expect(res.destroy).not.toHaveBeenCalled();
  expect(consumeRecentOpenClawTokenProxyQuotaError()).toMatchObject({
    message: '本月积分已用完',
    code: 40202,
  });
});

test('web stream: truncated SSE response is aborted on clean close', async () => {
  const res = createMockProxyResponse();
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(
        'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\n',
      ));
      controller.close();
    },
  });

  testUtils.pipeWebReadableResponseWithQuotaScan(
    webStream,
    asServerResponse(res),
    testUtils.createProxySSEStreamScanState(),
  );
  await vi.waitFor(() => {
    expect(res.destroy).toHaveBeenCalledTimes(1);
  });
  expect(res.end).not.toHaveBeenCalled();
});

test('web stream: read failure aborts the proxied response', async () => {
  const res = createMockProxyResponse();
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
      controller.error(new Error('net::ERR_CONNECTION_RESET'));
    },
  });

  testUtils.pipeWebReadableResponseWithQuotaScan(
    webStream,
    asServerResponse(res),
    testUtils.createProxySSEStreamScanState(),
  );
  await vi.waitFor(() => {
    expect(res.destroy).toHaveBeenCalledTimes(1);
  });
  expect(res.end).not.toHaveBeenCalled();
});

test('web stream: completion check is skipped when no scan state is provided', async () => {
  const res = createMockProxyResponse();
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"object":"chat.completion","choices":[]}'));
      controller.close();
    },
  });

  testUtils.pipeWebReadableResponseWithQuotaScan(webStream, asServerResponse(res));
  await vi.waitFor(() => {
    expect(res.end).toHaveBeenCalledTimes(1);
  });
  expect(res.destroy).not.toHaveBeenCalled();
});
