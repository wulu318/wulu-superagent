/**
 * Brings an existing MEMORY.md under the event log without losing content.
 *
 * The migration is idempotent: bullets already represented in the log are skipped by
 * content hash, so running it twice (or after a crash) is safe. MEMORY.md is only
 * rewritten when something actually changed, to avoid churn with the running agent.
 */
import fs from 'node:fs';

import {
  importViewEdits,
  memoryPaths,
  readEvents,
  rebuild,
  reduceEvents,
  summarize,
  VIEW_MARKER,
  type MemoryStats,
} from './memoryEventStore';

export interface MemoryMigrationResult {
  migrated: boolean;
  imported: number;
  stats: MemoryStats;
}

export function ensureMemoryStore(workspaceDir: string): MemoryMigrationResult {
  const { view } = memoryPaths(workspaceDir);
  const eventsBefore = readEvents(workspaceDir);
  const hasView = fs.existsSync(view);

  if (!hasView) {
    return { migrated: false, imported: 0, stats: rebuild(workspaceDir) };
  }

  const imported = importViewEdits(workspaceDir, { kind: 'import' });
  const hasViewMarker = fs.readFileSync(view, 'utf8').includes(VIEW_MARKER);

  if (eventsBefore.length === 0 || imported > 0 || !hasViewMarker) {
    return {
      migrated: eventsBefore.length === 0 || imported > 0,
      imported,
      stats: rebuild(workspaceDir),
    };
  }

  const stats = summarize(reduceEvents(readEvents(workspaceDir)));
  return { migrated: false, imported: 0, stats: { ...stats, events: eventsBefore.length } };
}
