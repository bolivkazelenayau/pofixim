'use server';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertAdminAuthorized } from '@/lib/admin-auth';

type RawNormalizationPreviewItem = {
  file: string;
  beforeIssues: {
    spacesBeforePunct: number;
    softHyphen: number;
    zeroWidth: number;
    tripleBreaks: number;
  };
  afterIssues: {
    spacesBeforePunct: number;
    softHyphen: number;
    zeroWidth: number;
    tripleBreaks: number;
  };
  changed: boolean;
  beforeSnippet: string;
  afterSnippet: string;
};

function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|td|th|section|article|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeOldForPreview(value: string) {
  return value
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\n([a-zа-яё])/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function normalizeNewForPreview(value: string) {
  return value
    .replace(/\u00ad/g, '\ue000')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\ue000\n([A-Za-zА-Яа-яЁё])/g, '$1$2')
    .replace(/([A-Za-zА-Яа-яЁё])-\n([A-Za-zА-Яа-яЁё])/g, '$1$2')
    .replace(/\ue000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function countPreviewIssues(text: string) {
  return {
    spacesBeforePunct: (text.match(/\s+[.,;:!?](?=\s|$)/g) ?? []).length,
    softHyphen: (text.match(/\u00ad/g) ?? []).length,
    zeroWidth: (text.match(/[\u200b\u200c\u200d\ufeff]/g) ?? []).length,
    tripleBreaks: (text.match(/\n{3,}/g) ?? []).length,
  };
}

function firstDiffIndex(a: string, b: string) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : n;
}

function snippetAt(text: string, index: number, radius = 180) {
  const from = Math.max(0, index < 0 ? 0 : index - radius);
  const to = Math.min(text.length, index < 0 ? radius * 2 : index + radius);
  return text.slice(from, to).replace(/\n/g, ' ⏎ ');
}

async function listHtmlFiles(rootDir: string) {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out.sort();
}

export async function previewRawNormalizationAction(input?: {
  fileFilter?: string;
  limit?: number;
}) {
  try {
    await assertAdminAuthorized();

    const rootDir = path.resolve(process.cwd(), 'test_sources', 'raw_live');
    const filter = String(input?.fileFilter ?? '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(Number(input?.limit ?? 3), 20));

    let files = await listHtmlFiles(rootDir);
    if (filter) files = files.filter((file) => file.toLowerCase().includes(filter));
    files = files.slice(0, limit);
    if (files.length === 0) {
      return { success: true, items: [] as RawNormalizationPreviewItem[] };
    }

    const items: RawNormalizationPreviewItem[] = [];
    for (const file of files) {
      const html = await readFile(file, 'utf8');
      const rawText = stripHtmlToText(html);
      const before = normalizeOldForPreview(rawText);
      const after = normalizeNewForPreview(rawText);
      const diffAt = firstDiffIndex(before, after);
      items.push({
        file: path.basename(file),
        beforeIssues: countPreviewIssues(before),
        afterIssues: countPreviewIssues(after),
        changed: diffAt >= 0,
        beforeSnippet: snippetAt(before, diffAt, 180),
        afterSnippet: snippetAt(after, diffAt, 180),
      });
    }

    return { success: true, items };
  } catch (error) {
    console.error('Failed to preview raw normalization:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      items: [],
    };
  }
}
