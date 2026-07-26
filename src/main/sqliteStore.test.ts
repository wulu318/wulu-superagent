import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test, vi } from 'vitest';

import { AgentAvatarSvg, DefaultAgentAvatarIcon, DefaultAgentProfile, encodeAgentAvatarIcon } from '../shared/agent';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => '/tmp',
  },
}));

import { DB_FILENAME } from './appConstants';
import { SqliteStore } from './sqliteStore';

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

const createTempUserDataPath = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'WULU-sqlite-store-'));
  tempDirs.push(dir);
  return dir;
};

const createLegacyDatabase = (userDataPath: string): void => {
  const db = new Database(path.join(userDataPath, DB_FILENAME));
  const now = Date.now();

  db.exec(`
    CREATE TABLE kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE cowork_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      identity TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      skill_ids TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'custom',
      preset_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.prepare('INSERT INTO cowork_config (key, value, updated_at) VALUES (?, ?, ?)')
    .run('workingDirectory', '/repo/legacy', now);
  db.prepare(
    `INSERT INTO agents (
      id, name, description, system_prompt, identity, model, icon, skill_ids,
      enabled, is_default, source, preset_id, created_at, updated_at
    ) VALUES (?, ?, '', '', '', '', '', '[]', 1, ?, 'custom', '', ?, ?)`,
  ).run('main', 'main', 1, now, now);
  db.prepare(
    `INSERT INTO agents (
      id, name, description, system_prompt, identity, model, icon, skill_ids,
      enabled, is_default, source, preset_id, created_at, updated_at
    ) VALUES (?, ?, '', '', '', '', '', '[]', 1, ?, 'custom', '', ?, ?)`,
  ).run('docs', 'Docs', 0, now, now);

  db.close();
};

test('backfills agent working directories from legacy cowork config only once', async () => {
  const userDataPath = createTempUserDataPath();
  createLegacyDatabase(userDataPath);

  const store = await SqliteStore.create(userDataPath);
  const db = store.getDatabase();
  const rows = db.prepare('SELECT id, working_directory FROM agents ORDER BY id')
    .all() as Array<{ id: string; working_directory: string }>;

  expect(rows).toEqual([
    { id: 'docs', working_directory: '/repo/legacy' },
    { id: 'main', working_directory: '/repo/legacy' },
  ]);

  db.prepare("UPDATE agents SET working_directory = '' WHERE id = 'docs'").run();
  store.close();

  const reopenedStore = await SqliteStore.create(userDataPath);
  const reopenedRows = reopenedStore.getDatabase()
    .prepare('SELECT id, working_directory FROM agents ORDER BY id')
    .all() as Array<{ id: string; working_directory: string }>;

  expect(reopenedRows).toEqual([
    { id: 'docs', working_directory: '' },
    { id: 'main', working_directory: '/repo/legacy' },
  ]);

  reopenedStore.close();
});

test('creates continuity capsule table during startup migration', async () => {
  const userDataPath = createTempUserDataPath();
  createLegacyDatabase(userDataPath);

  const store = await SqliteStore.create(userDataPath);
  const table = store.getDatabase()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cowork_session_capsules'")
    .get() as { name: string } | undefined;

  expect(table?.name).toBe('cowork_session_capsules');

  store.close();
});

test('upgrades legacy default agent name during migration', async () => {
  const userDataPath = createTempUserDataPath();
  createLegacyDatabase(userDataPath);

  const store = await SqliteStore.create(userDataPath);
  const row = store.getDatabase()
    .prepare("SELECT name FROM agents WHERE id = 'main'")
    .get() as { name: string };

  expect(row.name).toBe(DefaultAgentProfile.Name);

  store.close();
});

test('migrates legacy agent icons to the default svg avatar', async () => {
  const userDataPath = createTempUserDataPath();
  createLegacyDatabase(userDataPath);

  const designedIcon = encodeAgentAvatarIcon({
    svg: AgentAvatarSvg.Code,
  });
  const db = new Database(path.join(userDataPath, DB_FILENAME));
  const now = Date.now();
  db.prepare("UPDATE agents SET icon = ? WHERE id = 'main'").run('legacy-icon');
  db.prepare(
    `INSERT INTO agents (
      id, name, description, system_prompt, identity, model, icon, skill_ids,
      enabled, is_default, source, preset_id, created_at, updated_at
    ) VALUES (?, ?, '', '', '', '', ?, '[]', 1, 0, 'custom', '', ?, ?)`,
  ).run('code', 'Code', designedIcon, now, now);
  db.prepare(
    `INSERT INTO agents (
      id, name, description, system_prompt, identity, model, icon, skill_ids,
      enabled, is_default, source, preset_id, created_at, updated_at
    ) VALUES (?, ?, '', '', '', '', ?, '[]', 1, 0, 'custom', '', ?, ?)`,
  ).run('legacy-designed', 'Legacy Designed', 'agent-avatar:blue:code', now, now);
  db.close();

  const store = await SqliteStore.create(userDataPath);
  const rows = store.getDatabase()
    .prepare('SELECT id, icon FROM agents ORDER BY id')
    .all() as Array<{ id: string; icon: string }>;

  expect(rows).toEqual([
    { id: 'code', icon: designedIcon },
    { id: 'docs', icon: DefaultAgentAvatarIcon },
    { id: 'legacy-designed', icon: DefaultAgentAvatarIcon },
    { id: 'main', icon: DefaultAgentAvatarIcon },
  ]);

  store.close();
});

test('adds agent pin and sort columns during migration', async () => {
  const userDataPath = createTempUserDataPath();
  createLegacyDatabase(userDataPath);

  const store = await SqliteStore.create(userDataPath);
  const columns = store.getDatabase()
    .pragma('table_info(agents)') as Array<{ name: string }>;
  const columnNames = columns.map((column) => column.name);
  const rows = store.getDatabase()
    .prepare('SELECT id, pinned, pin_order, sort_order FROM agents ORDER BY id')
    .all() as Array<{ id: string; pinned: number; pin_order: number | null; sort_order: number | null }>;

  expect(columnNames).toContain('pinned');
  expect(columnNames).toContain('pin_order');
  expect(columnNames).toContain('sort_order');
  expect(rows).toEqual([
    { id: 'docs', pinned: 0, pin_order: null, sort_order: 2 },
    { id: 'main', pinned: 0, pin_order: null, sort_order: 1 },
  ]);

  store.close();
});

test('adds cowork fork columns during migration', async () => {
  const userDataPath = createTempUserDataPath();
  createLegacyDatabase(userDataPath);

  const legacyDb = new Database(path.join(userDataPath, DB_FILENAME));
  const now = Date.now();
  legacyDb.exec(`
    CREATE TABLE cowork_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      claude_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      pinned INTEGER NOT NULL DEFAULT 0,
      pin_order INTEGER,
      cwd TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      model_override TEXT NOT NULL DEFAULT '',
      execution_mode TEXT,
      active_skill_ids TEXT,
      agent_id TEXT NOT NULL DEFAULT 'main',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  legacyDb.prepare(
    `INSERT INTO cowork_sessions (
      id, title, status, pinned, cwd, created_at, updated_at
    ) VALUES ('legacy-session', 'Legacy Session', 'idle', 0, '/repo/legacy', ?, ?)`,
  ).run(now, now);
  legacyDb.close();

  const store = await SqliteStore.create(userDataPath);
  const columns = store.getDatabase()
    .pragma('table_info(cowork_sessions)') as Array<{ name: string }>;
  const columnNames = columns.map((column) => column.name);
  const row = store.getDatabase()
    .prepare(
      `SELECT parent_session_id, forked_from_message_id, forked_at, fork_mode,
              fork_workspace_path, fork_git_branch, fork_git_base_ref
       FROM cowork_sessions
       WHERE id = 'legacy-session'`,
    )
    .get() as {
      parent_session_id: string | null;
      forked_from_message_id: string | null;
      forked_at: number | null;
      fork_mode: string;
      fork_workspace_path: string | null;
      fork_git_branch: string | null;
      fork_git_base_ref: string | null;
    };

  expect(columnNames).toEqual(expect.arrayContaining([
    'parent_session_id',
    'forked_from_message_id',
    'forked_at',
    'fork_mode',
    'fork_workspace_path',
    'fork_git_branch',
    'fork_git_base_ref',
  ]));
  expect(row).toEqual({
    parent_session_id: null,
    forked_from_message_id: null,
    forked_at: null,
    fork_mode: 'none',
    fork_workspace_path: null,
    fork_git_branch: null,
    fork_git_base_ref: null,
  });

  store.close();
});
