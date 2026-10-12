/* ai-tags.js — Claude-written captions + tags for "search by vibe".
 *
 * Every public, non-rejected project image gets a one-line caption and a
 * set of lowercase tags (colours, light, setting, wardrobe, mood, medium)
 * stored in data/ai-tags.json, keyed "<projectId>/<filename>". The public
 * site searches those tags (GET /api/public/search-index).
 *
 * Runs in the background: a few minutes after startup and then hourly it
 * tags whatever is new, 8 images per Claude request, so new uploads and
 * imports become searchable without any manual step. Tags are written
 * after each batch, so an interrupted run resumes where it stopped.
 */

import { readAiTags, writeAiTags } from './store.js';

const BATCH = 8;

const TAGS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:      { type: 'string' },
          caption: { type: 'string' },
          tags:    { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'caption', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const PROMPT = (n) => `These ${n} photographs are from a fashion/editorial photographer's portfolio. For each, write:
- caption: one plain sentence describing what's in the frame (subject, wardrobe, setting, light), no flattery.
- tags: 12-20 lowercase search tags a visitor might type: dominant colours, light (daylight, flash, golden hour, night, studio), setting (street, studio, beach, interior, car…), wardrobe and styling, mood, composition (close-up, full length, portrait, group), medium cues (film grain, black and white, polaroid) and notable objects. Single words or short phrases; no names of people or brands.
Return one item per id.`;

export const tagStatus = { running: false, tagged: 0, pending: 0, lastError: null, lastRunAt: null };

/**
 * @param {object} deps
 *   askClaudeJSON({ system, content, schema, effort }) → { data }
 *   readProjects() → { projects }
 *   imageForClaude(projectId, filename) → { data: base64, mediaType } (~800px) or null
 */
export async function tagUntagged({ askClaudeJSON, readProjects, imageForClaude }) {
  if (tagStatus.running) return tagStatus;
  tagStatus.running = true;
  tagStatus.lastRunAt = new Date().toISOString();
  try {
    const store = await readAiTags();
    const { projects } = await readProjects();
    const todo = [];
    for (const p of projects || []) {
      if (p.public === false || p.raw) continue;
      for (const img of p.images || []) {
        if (img.rejected) continue;
        const key = `${p.id}/${img.filename}`;
        if (!store.images[key]) todo.push({ key, projectId: p.id, filename: img.filename });
      }
    }
    tagStatus.pending = todo.length;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = [];
      for (const t of todo.slice(i, i + BATCH)) {
        const img = await imageForClaude(t.projectId, t.filename).catch(() => null);
        if (img) batch.push({ ...t, id: String(batch.length + 1), img });
      }
      if (!batch.length) continue;
      const content = [{ type: 'text', text: PROMPT(batch.length) }];
      for (const b of batch) {
        content.push({ type: 'text', text: `[${b.id}]` });
        content.push({ type: 'image', source: { type: 'base64', media_type: b.img.mediaType, data: b.img.data } });
      }
      const { data } = await askClaudeJSON({ system: 'You index photographs for search.', content, schema: TAGS_SCHEMA, effort: 'low' });
      const fresh = await readAiTags(); // re-read: another writer may have added keys
      for (const item of data.items || []) {
        const b = batch.find(x => x.id === item.id);
        if (!b) continue;
        fresh.images[b.key] = {
          caption: String(item.caption || '').slice(0, 300),
          tags: [...new Set((item.tags || []).map(t => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 25),
          at: new Date().toISOString(),
        };
        tagStatus.tagged++;
      }
      await writeAiTags(fresh);
      tagStatus.pending = Math.max(0, todo.length - (i + BATCH));
    }
    tagStatus.lastError = null;
  } catch (err) {
    tagStatus.lastError = err?.message || String(err);
    console.error('[ai-tags] failed:', tagStatus.lastError);
  } finally {
    tagStatus.running = false;
  }
  return tagStatus;
}

export function scheduleTagging(deps) {
  const run = () => tagUntagged(deps).catch(() => {});
  setTimeout(run, 5 * 60 * 1000);
  setInterval(run, 60 * 60 * 1000);
}
