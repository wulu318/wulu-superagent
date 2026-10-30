import extractZip from 'extract-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type { McpServerRecord } from '../mcp/mcpStore';
import { communityBundleId, connectorTemplate, packageCommunitySkills } from './communityBundle';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'wulu-auto-package-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('supports local Chinese skill names without requiring the user to rename folders', () => {
  expect(communityBundleId('文档助手')).toMatch(/^skill-[a-f0-9]{16}$/);
  expect(communityBundleId('文档助手')).toBe(communityBundleId('文档助手'));
  expect(communityBundleId('writer')).toBe('writer');
});

test('automatically includes skill files and excludes personal secrets and caches', async () => {
  const directory = path.join(root, 'source'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '# A skill');
  fs.writeFileSync(path.join(directory, '.env'), 'API_KEY=private');
  fs.writeFileSync(path.join(directory, 'id_ed25519'), 'private');
  fs.mkdirSync(path.join(directory, 'node_modules')); fs.writeFileSync(path.join(directory, 'node_modules', 'cache'), 'ignored');
  fs.mkdirSync(path.join(directory, 'scripts')); fs.writeFileSync(path.join(directory, 'scripts', 'run.py'), 'print("hello")');
  const content = await packageCommunitySkills([{ id: 'writer', skillPath: path.join(directory, 'SKILL.md') }]);
  const archive = path.join(root, 'package.zip'); fs.writeFileSync(archive, content);
  const destination = path.join(root, 'extracted'); await extractZip(archive, { dir: destination });
  expect(fs.readdirSync(path.join(destination, 'writer')).sort()).toEqual(['SKILL.md', 'scripts']);
  expect(fs.readFileSync(path.join(destination, 'writer', 'scripts', 'run.py'), 'utf8')).toContain('hello');
});

test('blocks likely embedded private keys before an upload is created', async () => {
  const skillPath = path.join(root, 'SKILL.md'); fs.writeFileSync(skillPath, '-----BEGIN OPENSSH PRIVATE KEY-----');
  await expect(packageCommunitySkills([{ id: 'writer', skillPath }])).rejects.toThrow('credential');
});

test('connector templates retain configuration while removing credential values', () => {
  const server: McpServerRecord = { id: 's', name: 'Service', description: '', enabled: true, transportType: 'stdio', command: '/usr/local/bin/npx', args: ['server@1.0.0', '--api-key', 'secret-value', '--mode=read'], env: { API_KEY: 'secret-value' }, headers: { Authorization: 'Bearer secret' }, isBuiltIn: false, createdAt: 1, updatedAt: 1 };
  const result = connectorTemplate(server);
  expect(result).toMatchObject({ command: 'npx', defaultArgs: ['server@1.0.0', '--mode=read'], requiredEnvKeys: ['API_KEY'] });
  expect(JSON.stringify(result)).not.toContain('secret-value'); expect(result).not.toHaveProperty('headers');
});
