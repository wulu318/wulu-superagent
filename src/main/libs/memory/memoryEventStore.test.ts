import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addMemory,
  confirmMemory,
  deleteMemory,
  hashText,
  importViewEdits,
  memoryPaths,
  purgeTombstones,
  readEvents,
  rebuild,
  reduceEvents,
  renderView,
  restoreMemory,
  searchMemories,
  updateMemory,
} from './memoryEventStore';
import { ensureMemoryStore } from './memoryMigration';

let workspace: string;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'wulu-memory-'));
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

describe('memory event store', () => {
  test('adds a memory and materialises it in MEMORY.md', () => {
    const record = addMemory(workspace, { text: 'User prefers concise answers', layer: 'core', tags: ['style'] });
    const view = fs.readFileSync(path.join(workspace, 'MEMORY.md'), 'utf8');
    expect(view).toContain('User prefers concise answers');
    expect(view).toContain('::tags:style');
    expect(view).toContain(`memory-id: ${record.memoryId}`);
  });

  test('search only returns trusted memories unless asked', () => {
    addMemory(workspace, { text: 'Project uses SQLite', tags: ['db'] });
    addMemory(workspace, { text: 'Scraped note about SQLite', trust: 'untrusted' });

    const trusted = searchMemories(reduceEvents(readEvents(workspace)), 'sqlite');
    expect(trusted.map((item) => item.text)).toEqual(['Project uses SQLite']);

    const all = searchMemories(reduceEvents(readEvents(workspace)), 'sqlite', { includeUntrusted: true });
    expect(all).toHaveLength(2);
  });

  test('delete is a tombstone that can be restored', () => {
    const record = addMemory(workspace, { text: 'Temporary fact' });
    expect(deleteMemory(workspace, record.memoryId)).toBe(true);
    expect(fs.readFileSync(path.join(workspace, 'MEMORY.md'), 'utf8')).not.toContain('Temporary fact');

    const afterDelete = reduceEvents(readEvents(workspace)).get(record.memoryId);
    expect(afterDelete?.deletedAt).toBeTypeOf('number');
    expect(afterDelete?.text).toBe('Temporary fact');

    expect(restoreMemory(workspace, record.memoryId)).toBe(true);
    expect(fs.readFileSync(path.join(workspace, 'MEMORY.md'), 'utf8')).toContain('Temporary fact');
  });

  test('purge removes text only after the retention window', () => {
    const record = addMemory(workspace, { text: 'Old fact' });
    deleteMemory(workspace, record.memoryId);
    expect(purgeTombstones(workspace, 30)).toBe(0);

    // Pretend the delete happened 60 days ago.
    const { events: eventsPath } = memoryPaths(workspace);
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const old = Date.now() - 60 * 24 * 60 * 60 * 1000;
    for (const line of lines) line.ts = old;
    fs.writeFileSync(eventsPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');

    expect(purgeTombstones(workspace, 30)).toBe(1);
    const purged = reduceEvents(readEvents(workspace)).get(record.memoryId);
    expect(purged?.purged).toBe(true);
    expect(purged?.text).toBe('');
  });

  test('untrusted memory becomes searchable after confirmation', () => {
    const record = addMemory(workspace, { text: 'From a web page', trust: 'untrusted' });
    expect(searchMemories(reduceEvents(readEvents(workspace)), 'web')).toHaveLength(0);
    expect(confirmMemory(workspace, record.memoryId)).toBe(true);
    expect(searchMemories(reduceEvents(readEvents(workspace)), 'web')).toHaveLength(1);
  });

  test('updates keep history and bump the revision', () => {
    const record = addMemory(workspace, { text: 'v1' });
    expect(updateMemory(workspace, record.memoryId, { text: 'v2' })).toBe(true);
    const events = readEvents(workspace);
    expect(events.map((event) => event.type)).toEqual(['add', 'update']);
    expect(reduceEvents(events).get(record.memoryId)?.revision).toBe(2);
  });

  test('direct edits to MEMORY.md are imported back into the log', () => {
    addMemory(workspace, { text: 'Kept fact' });
    const viewPath = path.join(workspace, 'MEMORY.md');
    fs.appendFileSync(viewPath, '- Hand written note ::tags:manual\n');

    expect(importViewEdits(workspace)).toBe(1);
    expect(importViewEdits(workspace)).toBe(0); // idempotent

    const texts = [...reduceEvents(readEvents(workspace)).values()].map((record) => record.text);
    expect(texts).toContain('Hand written note');
  });

  test('view renders per layer and survives a rebuild', () => {
    addMemory(workspace, { text: 'Core fact', layer: 'core' });
    addMemory(workspace, { text: 'Knowledge fact', layer: 'knowledge' });
    const rendered = renderView(reduceEvents(readEvents(workspace)));
    expect(rendered.indexOf('核心记忆')).toBeLessThan(rendered.indexOf('知识库'));

    rebuild(workspace);
    expect(fs.readFileSync(path.join(workspace, 'MEMORY.md'), 'utf8')).toContain('Core fact');
  });

  test('migration from an existing MEMORY.md is idempotent', () => {
    fs.writeFileSync(
      path.join(workspace, 'MEMORY.md'),
      ['# MEMORY.md', '', '## 核心记忆 (Core)', '', '- Likes dark mode ::tags:ui,theme', '- Uses Windows'].join('\n'),
      'utf8',
    );

    const first = ensureMemoryStore(workspace);
    expect(first.migrated).toBe(true);
    expect(first.imported).toBe(2);

    const second = ensureMemoryStore(workspace);
    expect(second.imported).toBe(0);
    expect(second.stats.active).toBe(2);

    const records = [...reduceEvents(readEvents(workspace)).values()];
    expect(records.map((record) => record.tags).flat()).toContain('ui');
    expect(records.every((record) => record.layer === 'core')).toBe(true);
  });

  test('content hash ignores whitespace differences', () => {
    expect(hashText('  a   b ')).toBe(hashText('a b'));
  });
});
