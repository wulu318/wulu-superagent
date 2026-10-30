import archiver from 'archiver';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { type CommunityPayload, CommunityTransport } from '../../shared/community/constants';
import type { McpServerRecord } from '../mcp/mcpStore';

const excluded = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.DS_Store', 'auth.json', 'credentials.json', 'config.local.json', 'settings.local.json']);
const secretName = /(^\.env(?:\.|$)|^id_(?:rsa|ed25519)$|\.(?:pem|key|log)$)/i;
const secretContent = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{24,}|ghp_[a-zA-Z0-9]{24,}|github_pat_[a-zA-Z0-9_]{24,})/;

export const communityBundleId = (id: string): string => /^[a-zA-Z0-9_-]+$/.test(id)
  ? id : `skill-${crypto.createHash('sha256').update(id).digest('hex').slice(0, 16)}`;

export async function packageCommunitySkills(skills: Array<{ id: string; skillPath: string }>): Promise<Buffer> {
  if (!skills.length || skills.length > 30 || new Set(skills.map(skill => skill.id)).size !== skills.length) throw new Error('Invalid skill selection');
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  let outputSize = 0;
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > 20 * 1024 * 1024) { archive.abort(); reject(new Error('Package exceeds 20 MiB')); return; }
      chunks.push(chunk);
    });
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });
  void finished.catch(() => {});
  let files = 0;
  let size = 0;
  try {
    for (const skill of skills) {
      if (!/^[a-zA-Z0-9_-]+$/.test(skill.id)) throw new Error('Invalid skill ID');
      const root = path.dirname(skill.skillPath);
      if ((await fs.promises.lstat(skill.skillPath)).isSymbolicLink() || (await fs.promises.lstat(root)).isSymbolicLink()) throw new Error('Linked skills cannot be shared');
      const walk = async (directory: string): Promise<void> => {
        for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
          if (excluded.has(entry.name) || secretName.test(entry.name) || entry.isSymbolicLink()) continue;
          const source = path.join(directory, entry.name);
          if (entry.isDirectory()) { await walk(source); continue; }
          if (!entry.isFile()) continue;
          const stat = await fs.promises.stat(source);
          files++; size += stat.size;
          if (files > 1000 || size > 100 * 1024 * 1024) throw new Error('Skill package is too large');
          const content = await fs.promises.readFile(source);
          if (content.length < 2 * 1024 * 1024 && secretContent.test(content.toString('utf8'))) throw new Error('A possible credential was found; nothing was uploaded');
          const relative = path.relative(root, source).split(path.sep).join('/');
          archive.append(content, { name: `${skill.id}/${relative}`, mode: stat.mode & 0o111 ? 0o100755 : 0o100644 });
        }
      };
      await walk(root);
    }
    await archive.finalize();
    return await finished;
  } catch (error) { archive.abort(); void finished.catch(() => {}); throw error; }
}

export function connectorTemplate(server: McpServerRecord): NonNullable<CommunityPayload['connector']> {
  const args: string[] = [];
  let skip = false;
  for (const argument of server.args || []) {
    if (skip) { skip = false; continue; }
    if (/^--?(?:api[-_]?key|token|password|secret)(?:=|$)/i.test(argument)) { skip = !argument.includes('='); continue; }
    if (secretContent.test(argument) || /^[A-Z_]*(?:KEY|TOKEN|PASSWORD|SECRET)=/.test(argument)) continue;
    args.push(argument);
  }
  let url: string | undefined;
  if (server.url) {
    const parsed = new URL(server.url);
    parsed.username = ''; parsed.password = ''; parsed.search = ''; parsed.hash = '';
    url = parsed.href;
  }
  return {
    transportType: server.transportType,
    ...(server.transportType === CommunityTransport.Stdio ? { command: path.win32.basename(path.basename(server.command || '')), defaultArgs: args } : { url }),
    requiredEnvKeys: Object.keys(server.env || {}), category: 'productivity',
  };
}
