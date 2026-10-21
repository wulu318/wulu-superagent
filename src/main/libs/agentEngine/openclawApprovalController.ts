import { t } from '../../i18n';
import { CoworkPermissionMode } from '../../../shared/cowork/permissions';
import { isDangerousCommand } from '../commandSafety';
import { clearTaskPermissions, getTaskPermissionMode, hasTaskPermission, rememberTaskPermission } from './taskPermissions';
import {
  buildExecApprovalPermissionRequest,
  buildPluginApprovalPermissionRequest,
  getApprovalResolveMethod,
  parseApprovalResolvedPayload,
  parseExecApprovalRequestedPayload,
  parsePluginApprovalRequestedPayload,
  type PendingApprovalEntry,
  resolveApprovalDecision,
} from './openclawApprovalBridge';
import type { PermissionRequest, PermissionResult } from './types';

type GatewayRequestClient = {
  request: <T = Record<string, unknown>>(
    method: string,
    params?: unknown,
    opts?: { expectFinal?: boolean; timeoutMs?: number | null },
  ) => Promise<T>;
};

type OpenClawApprovalControllerOptions = {
  getGatewayClient: () => GatewayRequestClient | null;
  resolveSessionId: (sessionKey: string) => string | undefined;
  isSessionInStopCooldown: (sessionId: string) => boolean;
  isManualStopSuppressed: (sessionId: string, sessionKey: string) => boolean;
  sessionExists: (sessionId: string) => boolean;
  isSessionActive: (sessionId: string) => boolean;
  continueSession: (sessionId: string, prompt: string) => Promise<void>;
  emitPermissionRequest: (sessionId: string, request: PermissionRequest) => void;
  emitPermissionResolved: (sessionId: string, requestId: string) => void;
  emitError: (sessionId: string, error: string) => void;
};

export class OpenClawApprovalController {
  private readonly pendingApprovals = new Map<string, PendingApprovalEntry>();

  constructor(private readonly options: OpenClawApprovalControllerOptions) {}

  respondToPermission(requestId: string, result: PermissionResult): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      return;
    }

    // The user made a decision; downstream listeners (e.g. desktop
    // notifications) should treat the request as settled even if the gateway
    // resolve call below fails.
    this.options.emitPermissionResolved(pending.sessionId, requestId);

    // Remember task grants locally. Persisting a gateway allowlist entry would
    // leak authorization into later tasks and other sessions.
    const decision = resolveApprovalDecision(pending, result);
    const client = this.options.getGatewayClient();
    if (!client) {
      this.pendingApprovals.delete(requestId);
      return;
    }

    const sessionId = pending.sessionId;
    if (result.behavior === 'allow' && result.allowAlways === true) {
      rememberTaskPermission(sessionId, pending.permissionCategory ?? pending.kind);
    }
    // Only schedule continuation for user-initiated exec approvals, not for
    // plugin approvals or auto-approved commands, nor when the user opted to
    // remember the decision for the session (allow-always).
    const needsContinuation = pending.kind === 'exec'
      && !pending.allowAlways
      && !(result.behavior === 'allow' && result.allowAlways === true);
    const method = getApprovalResolveMethod(pending);

    void client.request(method, {
      id: requestId,
      decision,
    }).then(() => {
      if (!needsContinuation) return;
      const prompt = decision !== 'deny'
        ? t('execApprovalApproved')
        : t('execApprovalDenied');
      const tryContinue = (retries: number) => {
        if (!this.options.sessionExists(sessionId)) return;
        if (!this.options.isSessionActive(sessionId)) {
          void this.options.continueSession(sessionId, prompt).catch((error) => {
            console.warn('[OpenClawRuntime] failed to continue session after approval:', error);
          });
          return;
        }
        if (retries > 0) {
          setTimeout(() => tryContinue(retries - 1), 1000);
        }
      };
      tryContinue(10);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.options.emitError(sessionId, `Failed to resolve OpenClaw approval: ${message}`);
    }).finally(() => {
      this.pendingApprovals.delete(requestId);
    });
  }

  handleExecApprovalRequested(payload: unknown): void {
    const approval = parseExecApprovalRequestedPayload(payload);
    if (!approval) return;
    const { command, request, requestId, sessionKey, shouldAutoApprove } = approval;
    const sessionId = this.options.resolveSessionId(sessionKey);

    if (!sessionId) {
      return;
    }

    if (this.options.isSessionInStopCooldown(sessionId)) {
      console.log('[OpenClawRuntime] suppressed approval for stopped session, requestId:', requestId, 'sessionId:', sessionId);
      return;
    }
    if (this.options.isManualStopSuppressed(sessionId, sessionKey)) {
      console.log('[OpenClawRuntime] suppressed approval for manually stopped desktop session, requestId:', requestId, 'sessionId:', sessionId);
      return;
    }

    const mode = getTaskPermissionMode(sessionId);
    if (mode === CoworkPermissionMode.All || hasTaskPermission(sessionId, 'exec')
      || (mode === CoworkPermissionMode.Routine && !isDangerousCommand(command))
      || shouldAutoApprove) {
      this.pendingApprovals.set(requestId, {
        requestId,
        sessionId,
        kind: 'exec',
        allowedDecisions: ['allow-once', 'deny'],
        allowAlways: true,
      });
      this.respondToPermission(requestId, { behavior: 'allow', updatedInput: {} });
      return;
    }

    this.pendingApprovals.set(requestId, {
      requestId,
      sessionId,
      kind: 'exec',
    });

    this.options.emitPermissionRequest(
      sessionId,
      buildExecApprovalPermissionRequest(requestId, request, command),
    );
  }

  handleExecApprovalResolved(payload: unknown): void {
    const requestId = parseApprovalResolvedPayload(payload);
    if (!requestId) return;
    const pending = this.pendingApprovals.get(requestId);
    this.pendingApprovals.delete(requestId);
    if (pending) {
      this.options.emitPermissionResolved(pending.sessionId, requestId);
    }
  }

  handlePluginApprovalRequested(payload: unknown): void {
    const approval = parsePluginApprovalRequestedPayload(payload);
    if (!approval) return;
    const { allowedDecisions, request, requestId, sessionKey } = approval;
    const sessionId = this.options.resolveSessionId(sessionKey);

    if (!sessionId) {
      return;
    }

    if (this.options.isSessionInStopCooldown(sessionId)) {
      console.log('[OpenClawRuntime] suppressed plugin approval for stopped session, requestId:', requestId, 'sessionId:', sessionId);
      return;
    }
    if (this.options.isManualStopSuppressed(sessionId, sessionKey)) {
      console.log('[OpenClawRuntime] suppressed plugin approval for manually stopped desktop session, requestId:', requestId, 'sessionId:', sessionId);
      return;
    }

    const permissionCategory = `plugin:${request.pluginId ?? ''}:${request.toolName ?? ''}`;
    this.pendingApprovals.set(requestId, {
      requestId,
      sessionId,
      kind: 'plugin',
      allowedDecisions,
      permissionCategory,
    });

    if (getTaskPermissionMode(sessionId) === CoworkPermissionMode.All
      || hasTaskPermission(sessionId, permissionCategory)) {
      this.respondToPermission(requestId, { behavior: 'allow', updatedInput: {} });
      return;
    }

    this.options.emitPermissionRequest(
      sessionId,
      buildPluginApprovalPermissionRequest(requestId, request, allowedDecisions),
    );
  }

  handlePluginApprovalResolved(payload: unknown): void {
    const requestId = parseApprovalResolvedPayload(payload);
    if (!requestId) return;
    const pending = this.pendingApprovals.get(requestId);
    this.pendingApprovals.delete(requestId);
    if (pending) {
      this.options.emitPermissionResolved(pending.sessionId, requestId);
    }
  }

  clearBySession(sessionId: string): void {
    clearTaskPermissions(sessionId);
    for (const [requestId, pending] of this.pendingApprovals.entries()) {
      if (pending.sessionId === sessionId) {
        this.pendingApprovals.delete(requestId);
      }
    }
  }
}
