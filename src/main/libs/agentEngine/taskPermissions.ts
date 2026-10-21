import { CoworkPermissionMode, normalizeCoworkPermissionMode } from '../../../shared/cowork/permissions';

type TaskPermission = { mode: CoworkPermissionMode; grants: Set<string> };
const tasks = new Map<string, TaskPermission>();

/** A new user submission starts a new authorization scope. */
export function beginTaskPermissions(sessionId: string, mode: unknown): void {
  tasks.set(sessionId, { mode: normalizeCoworkPermissionMode(mode), grants: new Set() });
}

export function getTaskPermissionMode(sessionId: string): CoworkPermissionMode {
  return tasks.get(sessionId)?.mode ?? CoworkPermissionMode.Ask;
}

export function rememberTaskPermission(sessionId: string, category: string): void {
  const task = tasks.get(sessionId) ?? { mode: CoworkPermissionMode.Ask, grants: new Set<string>() };
  task.grants.add(category);
  tasks.set(sessionId, task);
}

export function hasTaskPermission(sessionId: string, category: string): boolean {
  return tasks.get(sessionId)?.grants.has(category) ?? false;
}

export function clearTaskPermissions(sessionId: string): void {
  tasks.delete(sessionId);
}
