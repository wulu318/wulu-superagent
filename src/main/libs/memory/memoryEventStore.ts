/**
 * Memory event log.
 *
 * MEMORY.md stays the human-facing file, but it is now a *view*: every change is an
 * event appended to `memory/events.jsonl`, and the markdown is regenerated from those
 * events. That makes memory auditable (who/where it came from), recoverable (tombstones)
 * and mergeable (the same event stream can be synced across devices later).
 *
 * This module only imports node builtins so it can run under Node's type stripping.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type MemoryLayer = 'core' | 'working' | 'knowledge' | 'diary-index';
export type MemoryTrust = 'trusted' | 'untrusted';
export type MemoryEventType = 'add' | 'update' | 'delete' | 'restore' | 'promote' | 'purge';

export interface MemorySource {
  kind: 'session' | 'tool' | 'manual' | 'import';
  sessionId?: string;
  tool?: string;
  deviceId?: string;
}

export interface MemoryEvent {
  id: string;
  type: MemoryEventType;
  memoryId: string;
  ts: number;
  layer?: MemoryLayer;
  targetLayer?: MemoryLayer;
  text?: string;
  tags?: string[];
  trust?: MemoryTrust;
  source?: MemorySource;
  reason?: string;
}

export interface MemoryRecord {
  memoryId: string;
  text: string;
  layer: MemoryLayer;
  tags: string[];
  trust: MemoryTrust;
  source?: MemorySource;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  deleteReason?: string;
  purged?: boolean;
  revision: number;
}

export interface MemoryStats {
  events: number;
  active: number;
  deleted: number;
  quarantined: number;
}

const LAYER_ORDER: MemoryLayer[] = ['core', 'working', 'knowledge', 'diary-index'];
const LAYER_TITLES: Record<MemoryLayer, string> = {
  core: '核心记忆 (Core)',
  working: '工作记忆 (Working)',
  knowledge: '知识库 (Knowledge)',
  'diary-index': '日记索引 (Diary Index)',
};

export const VIEW_MARKER = '<!-- generated-by: wulu-memory-events; edit is imported back as a manual change -->';

export function memoryPaths(workspaceDir: string) {
  const memoryDir = path.join(workspaceDir, 'memory');
  return {
    memoryDir,
    events: path.join(memoryDir, 'events.jsonl'),
    state: path.join(memoryDir, 'memory-view.json'),
    view: path.join(workspaceDir, 'MEMORY.md'),
  };
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 32);
}

export function newMemoryId(): string {
  return `mem_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function readEvents(workspaceDir: string): MemoryEvent[] {
  const { events } = memoryPaths(workspaceDir);
  if (!fs.existsSync(events)) return [];
  const lines = fs.readFileSync(events, 'utf8').split('\n');
  const parsed: MemoryEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as MemoryEvent;
      if (event && typeof event.memoryId === 'string' && typeof event.type === 'string') {
        parsed.push(event);
      }
    } catch {
      // A corrupt line must not destroy the rest of the log.
    }
  }
  return parsed;
}

export function appendEvent(workspaceDir: string, event: MemoryEvent): MemoryEvent {
  const { memoryDir, events } = memoryPaths(workspaceDir);
  ensureDir(memoryDir);
  fs.appendFileSync(events, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function createEvent(input: {
  type: MemoryEventType;
  memoryId?: string;
  layer?: MemoryLayer;
  targetLayer?: MemoryLayer;
  text?: string;
  tags?: string[];
  trust?: MemoryTrust;
  source?: MemorySource;
  reason?: string;
  ts?: number;
}): MemoryEvent {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    memoryId: input.memoryId || newMemoryId(),
    ts: input.ts ?? Date.now(),
    layer: input.layer,
    targetLayer: input.targetLayer,
    text: input.text,
    tags: input.tags,
    trust: input.trust,
    source: input.source,
    reason: input.reason,
  };
}

/** Fold the event log into the current state of every memory. */
export function reduceEvents(events: MemoryEvent[]): Map<string, MemoryRecord> {
  const records = new Map<string, MemoryRecord>();
  const ordered = [...events].sort((a, b) => a.ts - b.ts);

  for (const event of ordered) {
    const existing = records.get(event.memoryId);

    if (event.type === 'add') {
      if (existing) continue;
      records.set(event.memoryId, {
        memoryId: event.memoryId,
        text: event.text || '',
        layer: event.layer || 'working',
        tags: event.tags || [],
        trust: event.trust || 'trusted',
        source: event.source,
        createdAt: event.ts,
        updatedAt: event.ts,
        revision: 1,
      });
      continue;
    }

    if (!existing) continue;

    if (event.type === 'update') {
      if (typeof event.text === 'string') existing.text = event.text;
      if (event.tags) existing.tags = event.tags;
      if (event.layer) existing.layer = event.layer;
      if (event.trust) existing.trust = event.trust;
      if (event.source) existing.source = event.source;
      existing.revision += 1;
      existing.updatedAt = event.ts;
      continue;
    }

    if (event.type === 'promote' && event.targetLayer) {
      existing.layer = event.targetLayer;
      existing.revision += 1;
      existing.updatedAt = event.ts;
      continue;
    }

    if (event.type === 'delete') {
      existing.deletedAt = event.ts;
      existing.deleteReason = event.reason;
      existing.revision += 1;
      existing.updatedAt = event.ts;
      continue;
    }

    if (event.type === 'restore') {
      delete existing.deletedAt;
      delete existing.deleteReason;
      existing.revision += 1;
      existing.updatedAt = event.ts;
      continue;
    }

    if (event.type === 'purge') {
      existing.purged = true;
      existing.text = '';
      existing.revision += 1;
      existing.updatedAt = event.ts;
    }
  }

  return records;
}

export function activeRecords(records: Map<string, MemoryRecord>): MemoryRecord[] {
  return [...records.values()].filter((record) => !record.deletedAt && !record.purged);
}

export function searchMemories(
  records: Map<string, MemoryRecord>,
  query: string,
  options: { includeUntrusted?: boolean; tags?: string[]; limit?: number } = {},
): MemoryRecord[] {
  const needle = normalizeText(query).toLowerCase();
  const requiredTags = (options.tags || []).map((tag) => tag.toLowerCase());
  const limit = options.limit ?? 50;

  return activeRecords(records)
    .filter((record) => options.includeUntrusted || record.trust === 'trusted')
    .filter((record) => requiredTags.every((tag) => record.tags.map((t) => t.toLowerCase()).includes(tag)))
    .filter((record) => !needle || record.text.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function renderView(records: Map<string, MemoryRecord>): string {
  const lines: string[] = ['# MEMORY.md', '', VIEW_MARKER, ''];
  for (const layer of LAYER_ORDER) {
    const items = activeRecords(records).filter((record) => record.layer === layer);
    if (items.length === 0) continue;
    lines.push(`## ${LAYER_TITLES[layer]}`, '');
    for (const record of items.sort((a, b) => a.createdAt - b.createdAt)) {
      const tagSuffix = record.tags.length > 0 ? ` ::tags:${record.tags.join(',')}` : '';
      const untrusted = record.trust === 'untrusted' ? ' [待确认]' : '';
      lines.push(`- ${record.text}${tagSuffix}${untrusted}`, `  <!-- memory-id: ${record.memoryId} -->`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function writeView(workspaceDir: string, records: Map<string, MemoryRecord>): string {
  const { view, memoryDir, state } = memoryPaths(workspaceDir);
  ensureDir(workspaceDir);
  ensureDir(memoryDir);
  const content = renderView(records);
  fs.writeFileSync(view, content, 'utf8');
  const stats = summarize(records);
  fs.writeFileSync(state, `${JSON.stringify({ renderedAt: Date.now(), stats, viewHash: hashText(content) }, null, 2)}\n`, 'utf8');
  return content;
}

export function summarize(records: Map<string, MemoryRecord>): MemoryStats {
  const all = [...records.values()];
  return {
    events: 0,
    active: all.filter((r) => !r.deletedAt && !r.purged).length,
    deleted: all.filter((r) => Boolean(r.deletedAt)).length,
    quarantined: all.filter((r) => !r.deletedAt && r.trust === 'untrusted').length,
  };
}

/** Rebuild MEMORY.md from the event log. Safe to run at any time. */
export function rebuild(workspaceDir: string): MemoryStats {
  const events = readEvents(workspaceDir);
  const records = reduceEvents(events);
  writeView(workspaceDir, records);
  return { ...summarize(records), events: events.length };
}

/**
 * Turn a human edit of MEMORY.md into events, so direct edits are not lost.
 * Lines carrying `<!-- memory-id: ... -->` update that memory; new bullets become adds.
 */
export function importViewEdits(workspaceDir: string, options: { source?: MemorySource } = {}): number {
  const { view } = memoryPaths(workspaceDir);
  if (!fs.existsSync(view)) return 0;

  const events = readEvents(workspaceDir);
  const records = reduceEvents(events);
  const byHash = new Map<string, MemoryRecord>();
  for (const record of records.values()) byHash.set(hashText(record.text), record);

  const lines = fs.readFileSync(view, 'utf8').split('\n');
  const source: MemorySource = options.source || { kind: 'manual' };
  let imported = 0;
  let pendingLayer: MemoryLayer = 'working';

  const idAt = (index: number): string | null => {
    for (let i = index + 1; i < Math.min(index + 3, lines.length); i += 1) {
      const match = lines[i].match(/<!--\s*memory-id:\s*([a-zA-Z0-9_-]+)\s*-->/);
      if (match) return match[1];
      if (lines[i].trim() === '') break;
    }
    return null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      const title = heading[1];
      const found = LAYER_ORDER.find((layer) => LAYER_TITLES[layer] === title);
      pendingLayer = found || 'working';
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (!bullet) continue;

    const { text, tags, untrusted } = parseBullet(bullet[1]);
    if (!text) continue;
    const hash = hashText(text);
    const memoryId = idAt(index);
    const known = byHash.get(hash);

    if (memoryId && records.has(memoryId)) {
      const record = records.get(memoryId)!;
      if (hashText(record.text) !== hash || record.layer !== pendingLayer) {
        appendEvent(workspaceDir, createEvent({
          type: 'update', memoryId, text, tags, layer: pendingLayer, source,
        }));
        imported += 1;
      }
    } else if (!known) {
      const newId = newMemoryId();
      appendEvent(workspaceDir, createEvent({
        type: 'add', memoryId: newId, text, tags, layer: pendingLayer,
        trust: untrusted ? 'untrusted' : 'trusted', source,
      }));
      byHash.set(hash, { memoryId: newId } as MemoryRecord);
      imported += 1;
    }
  }

  return imported;
}

function parseBullet(raw: string): { text: string; tags: string[]; untrusted: boolean } {
  let value = raw.trim();
  const untrusted = value.includes('[待确认]');
  value = value.replace('[待确认]', '').trim();
  const tagMatch = value.match(/\s*::tags:([^\s]+)\s*$/);
  let tags: string[] = [];
  if (tagMatch) {
    tags = tagMatch[1].split(',').map((tag) => tag.trim()).filter(Boolean);
    value = value.slice(0, tagMatch.index).trim();
  }
  return { text: value, tags, untrusted };
}

/**
 * Tombstones keep deleted text for a while so an accidental delete is recoverable.
 * After the retention window the text is purged but the event history stays.
 */
export function purgeTombstones(workspaceDir: string, retentionDays = 30): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const records = reduceEvents(readEvents(workspaceDir));
  let purged = 0;
  for (const record of records.values()) {
    if (record.deletedAt && record.deletedAt < cutoff && !record.purged && record.text) {
      appendEvent(workspaceDir, createEvent({
        type: 'purge', memoryId: record.memoryId, reason: 'tombstone-retention', ts: cutoff,
      }));
      purged += 1;
    }
  }
  return purged;
}

/** A memory written from an untrusted source stays out of search until confirmed. */
export function confirmMemory(workspaceDir: string, memoryId: string): boolean {
  const records = reduceEvents(readEvents(workspaceDir));
  const record = records.get(memoryId);
  if (!record || record.trust === 'trusted') return false;
  appendEvent(workspaceDir, createEvent({
    type: 'update', memoryId, trust: 'trusted', source: { kind: 'manual' },
  }));
  return true;
}

export function addMemory(
  workspaceDir: string,
  input: { text: string; layer?: MemoryLayer; tags?: string[]; trust?: MemoryTrust; source?: MemorySource },
): MemoryRecord {
  const event = createEvent({
    type: 'add',
    text: input.text,
    layer: input.layer || 'working',
    tags: input.tags || [],
    trust: input.trust || 'trusted',
    source: input.source || { kind: 'manual' },
  });
  appendEvent(workspaceDir, event);
  writeView(workspaceDir, reduceEvents(readEvents(workspaceDir)));
  return reduceEvents(readEvents(workspaceDir)).get(event.memoryId)!;
}

export function updateMemory(
  workspaceDir: string,
  memoryId: string,
  input: { text?: string; tags?: string[]; layer?: MemoryLayer; source?: MemorySource },
): boolean {
  const records = reduceEvents(readEvents(workspaceDir));
  if (!records.has(memoryId)) return false;
  appendEvent(workspaceDir, createEvent({
    type: 'update', memoryId, text: input.text, tags: input.tags, layer: input.layer,
    source: input.source || { kind: 'manual' },
  }));
  writeView(workspaceDir, reduceEvents(readEvents(workspaceDir)));
  return true;
}

export function deleteMemory(workspaceDir: string, memoryId: string, reason = 'user-delete'): boolean {
  const records = reduceEvents(readEvents(workspaceDir));
  if (!records.has(memoryId)) return false;
  appendEvent(workspaceDir, createEvent({ type: 'delete', memoryId, reason, source: { kind: 'manual' } }));
  writeView(workspaceDir, reduceEvents(readEvents(workspaceDir)));
  return true;
}

export function restoreMemory(workspaceDir: string, memoryId: string): boolean {
  const records = reduceEvents(readEvents(workspaceDir));
  const record = records.get(memoryId);
  if (!record || !record.deletedAt) return false;
  appendEvent(workspaceDir, createEvent({ type: 'restore', memoryId, source: { kind: 'manual' } }));
  writeView(workspaceDir, reduceEvents(readEvents(workspaceDir)));
  return true;
}
