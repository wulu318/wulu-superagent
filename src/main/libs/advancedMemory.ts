/**
 * WULU Advanced Memory System
 *
 * Provides layered memory, tag-based association, proactive diary,
 * and environmental awareness — inspired by next-generation agent memory architectures.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

/** Memory layer classification */
export type MemoryLayer = 'core' | 'working' | 'knowledge' | 'diary-index';

/** A single memory entry with optional tags and layer */
export interface AdvancedMemoryEntry {
  id: string;
  text: string;
  section?: string;
  layer: MemoryLayer;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
}

/** Tag association link between two entries */
export interface TagAssociation {
  tag: string;
  entryIds: string[];
  weight: number;
}

/** Result of a tag-expanded search */
export interface TagSearchResult {
  entry: AdvancedMemoryEntry;
  matchType: 'direct' | 'tag-association';
  matchedTags: string[];
  associationDepth: number;
}

/** Diary entry written by the agent */
export interface DiaryEntry {
  date: string;            // YYYY-MM-DD
  content: string;
  tags: string[];
  category: string;        // e.g. 'observation', 'decision', 'reflection', 'task'
  createdAt: number;
}

/** Future message (letter to future self) */
export interface FutureMessage {
  id: string;
  targetDate: string;      // YYYY-MM-DD
  content: string;
  tags: string[];
  createdAt: number;
  delivered: boolean;
}

/** Environment snapshot injected into context */
export interface EnvironmentSnapshot {
  timestamp: number;
  date: string;
  weekday: string;
  time: string;
  solarTerm?: string;
  weather?: {
    city: string;
    temperature: number;
    description: string;
  };
  systemStatus?: {
    cpuPercent: number;
    memoryPercent: number;
    diskFreeGB: number;
  };
  pendingFutureMessages: number;
  lastConversationAgo?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MEMORY_LAYERS: Record<MemoryLayer, { label: string; order: number }> = {
  'core':      { label: 'Core',      order: 0 },
  'working':   { label: 'Working',   order: 1 },
  'knowledge': { label: 'Knowledge', order: 2 },
  'diary-index': { label: 'Diary Index', order: 3 },
};

const TAG_SEPARATOR = '::tags:';
const TAG_REGEX = /::tags:([a-zA-Z0-9\u4e00-\u9fff,_\-\s]+)/;

// ── Path helpers ─────────────────────────────────────────────────────────────

export function getDiaryDir(workspaceDir: string): string {
  return path.join(workspaceDir, 'memory');
}

export function getDiaryPath(workspaceDir: string, date: string): string {
  return path.join(getDiaryDir(workspaceDir), `${date}.md`);
}

export function getFutureDir(workspaceDir: string): string {
  return path.join(workspaceDir, 'memory', 'future');
}

export function getFutureMessagePath(workspaceDir: string, date: string): string {
  return path.join(getFutureDir(workspaceDir), `${date}.md`);
}

// ── Tag parsing ──────────────────────────────────────────────────────────────

/** Extract tags from entry text (::tags:t1,t2 syntax) */
export function extractTags(text: string): { cleanText: string; tags: string[] } {
  const match = text.match(TAG_REGEX);
  if (!match) return { cleanText: text.trim(), tags: [] };

  const cleanText = text.replace(TAG_REGEX, '').trim();
  const tags = match[1]
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);
  return { cleanText, tags };
}

/** Append tags to entry text */
export function appendTags(text: string, tags: string[]): string {
  if (!tags.length) return text;
  const { cleanText, tags: existingTags } = extractTags(text);
  const merged = [...new Set([...existingTags, ...tags.map(t => t.toLowerCase())])];
  return `${cleanText} ${TAG_SEPARATOR}${merged.join(',')}`;
}

/** Remove specific tags from entry text */
export function removeTags(text: string, tagsToRemove: string[]): string {
  const { cleanText, tags: existingTags } = extractTags(text);
  const removeSet = new Set(tagsToRemove.map(t => t.toLowerCase()));
  const filtered = existingTags.filter(t => !removeSet.has(t));
  if (!filtered.length) return cleanText;
  return `${cleanText} ${TAG_SEPARATOR}${filtered.join(',')}`;
}

// ── Layer helpers ────────────────────────────────────────────────────────────

/** Detect layer from section name */
export function detectLayerFromSection(section?: string): MemoryLayer {
  if (!section) return 'working';
  const lower = section.toLowerCase();
  if (lower.includes('core') || lower.includes('核心')) return 'core';
  if (lower.includes('knowledge') || lower.includes('知识')) return 'knowledge';
  if (lower.includes('diary') || lower.includes('日记')) return 'diary-index';
  return 'working';
}

/** Convert layer to section header */
export function layerToSectionHeader(layer: MemoryLayer): string {
  switch (layer) {
    case 'core': return '## 核心记忆 (Core)';
    case 'working': return '## 工作记忆 (Working)';
    case 'knowledge': return '## 知识库 (Knowledge)';
    case 'diary-index': return '## 日记索引 (Diary Index)';
  }
}

// ── Tag index ────────────────────────────────────────────────────────────────

/** Build an in-memory tag → entryId[] index from a list of entries */
export function buildTagIndex(entries: AdvancedMemoryEntry[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const ids = index.get(tag) || [];
      ids.push(entry.id);
      index.set(tag, ids);
    }
  }
  return index;
}

/** Search entries with tag-based association expansion */
export function searchWithTagAssociation(
  entries: AdvancedMemoryEntry[],
  query: string,
  options: { maxDepth?: number; maxResults?: number } = {},
): TagSearchResult[] {
  const { maxDepth = 2, maxResults = 20 } = options;
  const tagIndex = buildTagIndex(entries);

  // Extract query keywords
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/[\s,，、]+/).filter(w => w.length > 0);

  const results: Map<string, TagSearchResult> = new Map();

  // Phase 1: Direct text match
  for (const entry of entries) {
    if (entry.text.toLowerCase().includes(queryLower)) {
      results.set(entry.id, {
        entry,
        matchType: 'direct',
        matchedTags: [],
        associationDepth: 0,
      });
    }
    // Also match tags
    for (const tag of entry.tags) {
      if (queryWords.some(w => tag.includes(w))) {
        if (!results.has(entry.id)) {
          results.set(entry.id, {
            entry,
            matchType: 'direct',
            matchedTags: [tag],
            associationDepth: 0,
          });
        } else {
          results.get(entry.id)!.matchedTags.push(tag);
        }
      }
    }
  }

  // Phase 2: Tag association expansion (up to maxDepth)
  if (maxDepth >= 1) {
    const directEntryIds = new Set(results.keys());
    for (const [_, result] of results) {
      for (const tag of result.entry.tags) {
        const associatedIds = tagIndex.get(tag) || [];
        for (const assocId of associatedIds) {
          if (directEntryIds.has(assocId)) continue;
          const assocEntry = entries.find(e => e.id === assocId);
          if (!assocEntry) continue;
          results.set(assocId, {
            entry: assocEntry,
            matchType: 'tag-association',
            matchedTags: [tag],
            associationDepth: 1,
          });
        }
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => a.associationDepth - b.associationDepth)
    .slice(0, maxResults);
}

// ── Diary operations ─────────────────────────────────────────────────────────

/** Write a diary entry for today (or specified date) */
export function writeDiaryEntry(
  workspaceDir: string,
  content: string,
  options: { date?: string; tags?: string[]; category?: string } = {},
): DiaryEntry {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const tags = options.tags || [];
  const category = options.category || 'observation';
  const diaryDir = getDiaryDir(workspaceDir);

  if (!fs.existsSync(diaryDir)) {
    fs.mkdirSync(diaryDir, { recursive: true });
  }

  const filePath = getDiaryPath(workspaceDir, date);
  const timestamp = Date.now();

  // Format the diary entry
  const tagLine = tags.length > 0 ? ` ${TAG_SEPARATOR}${tags.join(',')}` : '';
  const newBlock = [
    '',
    `### [${category}] ${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}${tagLine}`,
    '',
    content,
    '',
  ].join('\n');

  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, newBlock, 'utf-8');
  } else {
    const header = `# 日记 ${date}\n\n每日记录，由 WULU 智能体主动书写。`;
    fs.writeFileSync(filePath, header + newBlock, 'utf-8');
  }

  return { date, content, tags, category, createdAt: timestamp };
}

/** Read diary entries for a specific date */
export function readDiaryEntries(workspaceDir: string, date: string): string | null {
  const filePath = getDiaryPath(workspaceDir, date);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/** List all diary dates available */
export function listDiaryDates(workspaceDir: string): string[] {
  const diaryDir = getDiaryDir(workspaceDir);
  if (!fs.existsSync(diaryDir)) return [];
  return fs.readdirSync(diaryDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse();
}

// ── Future messages ──────────────────────────────────────────────────────────

/** Write a future message (letter to future self) */
export function writeFutureMessage(
  workspaceDir: string,
  targetDate: string,
  content: string,
  options: { tags?: string[] } = {},
): FutureMessage {
  const futureDir = getFutureDir(workspaceDir);

  if (!fs.existsSync(futureDir)) {
    fs.mkdirSync(futureDir, { recursive: true });
  }

  const id = crypto.randomUUID();
  const timestamp = Date.now();
  const tags = options.tags || [];
  const tagLine = tags.length > 0 ? ` ${TAG_SEPARATOR}${tags.join(',')}` : '';

  const filePath = getFutureMessagePath(workspaceDir, targetDate);

  // If file for this date exists, append; otherwise create
  const block = [
    '',
    `#### Message ${id.slice(0, 8)} (${new Date(timestamp).toLocaleString('zh-CN')})${tagLine}`,
    '',
    content,
    '',
  ].join('\n');

  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, block, 'utf-8');
  } else {
    const header = `# Future Messages for ${targetDate}\n\nMessages left by past self to be delivered on this date.`;
    fs.writeFileSync(filePath, header + block, 'utf-8');
  }

  return { id, targetDate, content, tags, createdAt: timestamp, delivered: false };
}

/** Get undelivered future messages for today (or a specific date) */
export function getPendingFutureMessages(
  workspaceDir: string,
  date?: string,
): FutureMessage[] {
  const today = date || new Date().toISOString().slice(0, 10);
  const futureDir = getFutureDir(workspaceDir);
  const messages: FutureMessage[] = [];

  if (!fs.existsSync(futureDir)) return messages;

  // Check all date files up to today
  const files = fs.readdirSync(futureDir)
    .filter(f => /^(\d{4}-\d{2}-\d{2})\.md$/.test(f))
    .map(f => ({ name: f, date: f.replace('.md', '') }))
    .filter(f => f.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const file of files) {
    const content = fs.readFileSync(path.join(futureDir, file.name), 'utf-8');
    // Parse message blocks
    const blocks = content.split(/^#### Message /m).slice(1);
    for (const block of blocks) {
      const idMatch = block.match(/^(\w+)/);
      const id = idMatch ? idMatch[1] : crypto.randomUUID();
      messages.push({
        id,
        targetDate: file.date,
        content: block.trim(),
        tags: [],
        createdAt: new Date(file.date).getTime(),
        delivered: false,
      });
    }
  }

  return messages;
}

/** Mark future messages as delivered (by removing the file or marking) */
export function markFutureMessagesDelivered(workspaceDir: string, date: string): void {
  const futureDir = getFutureDir(workspaceDir);
  const filePath = getFutureMessagePath(workspaceDir, date);

  if (fs.existsSync(filePath)) {
    // Move to delivered archive
    const archiveDir = path.join(futureDir, 'delivered');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    const archivePath = path.join(archiveDir, `${date}.md`);
    fs.renameSync(filePath, archivePath);
  }
}

// ── Memory consolidation ─────────────────────────────────────────────────────

/** Merge similar entries (basic: same first 50 chars after normalization) */
export function findSimilarEntries(entries: AdvancedMemoryEntry[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const entry of entries) {
    const { cleanText } = extractTags(entry.text);
    const key = cleanText.replace(/\s+/g, ' ').trim().slice(0, 50).toLowerCase();
    const existing = groups.get(key) || [];
    existing.push(entry.id);
    groups.set(key, existing);
  }

  // Only return groups with 2+ entries
  return new Map(
    Array.from(groups.entries()).filter(([_, ids]) => ids.length > 1),
  );
}

/** Promote an entry from working to core layer */
export function promoteEntryLayer(entries: AdvancedMemoryEntry[], entryId: string): AdvancedMemoryEntry[] {
  return entries.map(e => {
    if (e.id === entryId && e.layer === 'working') {
      return { ...e, layer: 'core' as MemoryLayer, section: '核心记忆 (Core)' };
    }
    return e;
  });
}

// ── Serialize helpers ────────────────────────────────────────────────────────

/** Convert AdvancedMemoryEntry to raw MEMORY.md line format */
export function entryToMarkdownLine(entry: AdvancedMemoryEntry): string {
  const { cleanText, tags } = extractTags(entry.text);
  const allTags = [...new Set([...tags, ...entry.tags])];
  const tagSuffix = allTags.length > 0 ? ` ${TAG_SEPARATOR}${allTags.join(',')}` : '';
  return `- [${MEMORY_LAYERS[entry.layer].label}] ${cleanText}${tagSuffix}`;
}

/** Parse a raw MEMORY.md line into an AdvancedMemoryEntry (partial) */
export function parseMarkdownLine(line: string): Partial<AdvancedMemoryEntry> | null {
  const bulletMatch = line.match(/^- (.+)$/);
  if (!bulletMatch) return null;

  const content = bulletMatch[1];
  const layerMatch = content.match(/^\[([^\]]+)\]\s*(.*)/);
  if (!layerMatch) {
    return { text: content, layer: 'working', tags: [] };
  }

  const layerLabel = layerMatch[1];
  const text = layerMatch[2];
  const { cleanText, tags } = extractTags(text);

  let layer: MemoryLayer = 'working';
  const labelLower = layerLabel.toLowerCase();
  if (labelLower.includes('core') || labelLower.includes('核心')) layer = 'core';
  else if (labelLower.includes('knowledge') || labelLower.includes('知识')) layer = 'knowledge';
  else if (labelLower.includes('diary') || labelLower.includes('日记')) layer = 'diary-index';

  return { text: cleanText, layer, tags };
}