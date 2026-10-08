/* video.js — make uploaded videos web-friendly (ffmpeg, installed in the
 * Docker image).
 *
 * Videos used to go up exactly as exported: a 90 MB 4K file streamed over
 * the home connection and Cloudflare tunnel for a sidebar reel, and posters
 * straight off an iPhone (HEIC) that only Safari can show. For each video:
 *
 *   - If it's larger than 1080p, not H.264, or over ~12 Mbit/s, encode a
 *     1080p H.264/AAC web version (<name>.web.mp4, faststart so playback
 *     starts before the whole file arrives) and point the site at it. The
 *     original stays on disk as `originalBlobPath`.
 *   - If there's no poster, or it's HEIC, grab a frame at 1s as a JPEG.
 *
 * Jobs run one at a time (the NAS CPU is a 4-core Celeron); a 45s 4K clip
 * takes a few minutes. Videos marked `processedAt` are skipped.
 */

import { spawn } from 'node:child_process';
import fs   from 'node:fs/promises';
import path from 'node:path';
import { readVideos, writeVideos, videoFilePath, imageSubPath } from './store.js';

const MAX_EDGE    = 1920;
const MAX_BITRATE = 12_000_000;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err = (err + d).slice(-4000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-500)}`)));
  });
}

async function probe(file) {
  const json = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = (json.streams || []).find(s => s.codec_type === 'video') || {};
  return {
    width: v.width || 0,
    height: v.height || 0,
    codec: v.codec_name || '',
    bitRate: Number(v.bit_rate || json.format?.bit_rate || 0),
  };
}

export const videoJobs = { running: null, queue: [], done: [], failed: [] };

/* Re-read videos.json for every write: an encode takes minutes and the
   admin may edit other videos meanwhile. */
async function patchVideo(id, patch) {
  const data = await readVideos();
  const v = data.videos.find(x => x.id === id);
  if (!v) return null;
  Object.assign(v, patch, { updatedAt: new Date().toISOString() });
  await writeVideos(data);
  return v;
}

async function processOne(id) {
  const video = (await readVideos()).videos.find(v => v.id === id);
  if (!video?.blobPath || !video.blobPath.startsWith('__videos/')) return;
  const filename = video.blobPath.split('/').pop();
  const src = videoFilePath(id, filename);
  if (!src || !(await fs.stat(src).catch(() => null))) return;

  const patch = { processedAt: new Date().toISOString() };
  const info = await probe(src);
  patch.width = info.width; patch.height = info.height;

  const needsWeb = Math.max(info.width, info.height) > MAX_EDGE
    || info.codec !== 'h264' || info.bitRate > MAX_BITRATE;
  if (needsWeb && !filename.endsWith('.web.mp4')) {
    const webName = filename.replace(/\.[^.]+$/, '') + '.web.mp4';
    const dest = videoFilePath(id, webName);
    // Long edge capped at 1920, short edge rounded to even, never upscaled.
    const scale = info.width >= info.height
      ? `scale='min(${MAX_EDGE},iw)':-2`
      : `scale=-2:'min(${MAX_EDGE},ih)'`;
    try {
      await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', scale,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', dest]);
      const out = await fs.stat(dest);
      if (!out.size) throw new Error('empty output');
      const after = await probe(dest);
      Object.assign(patch, {
        originalBlobPath: video.originalBlobPath || video.blobPath,
        blobPath: `__videos/${id}/${webName}`,
        width: after.width, height: after.height,
      });
    } catch (err) {
      await fs.unlink(dest).catch(() => {});
      throw err;
    }
  }

  if (!video.poster || /\.hei[cf]$/i.test(video.poster)) {
    const posterName = `poster_auto_${Date.now()}.jpg`;
    const dest = imageSubPath(`__vidposters/${id}`, posterName);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', src, '-frames:v', '1',
      '-vf', `scale='min(1600,iw)':-2`, '-q:v', '3', dest]);
    patch.poster = `__vidposters/${id}/${posterName}`;
    if (video.poster) patch.originalPoster = video.poster;
  }

  await patchVideo(id, patch);
  return patch;
}

async function drain() {
  if (videoJobs.running) return;
  while (videoJobs.queue.length) {
    const id = videoJobs.queue.shift();
    videoJobs.running = { id, startedAt: new Date().toISOString() };
    const t0 = Date.now();
    try {
      const patch = await processOne(id);
      videoJobs.done.unshift({ id, seconds: Math.round((Date.now() - t0) / 1000), blobPath: patch?.blobPath || null, poster: patch?.poster || null });
      console.log(`[video] ${id} processed in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      videoJobs.failed.unshift({ id, error: err?.message?.slice(0, 500) });
      console.error(`[video] ${id} failed:`, err?.message);
    }
    videoJobs.done.length = Math.min(videoJobs.done.length, 20);
    videoJobs.failed.length = Math.min(videoJobs.failed.length, 20);
  }
  videoJobs.running = null;
}

/** Queue one video (e.g. right after upload). Clears its processed flag. */
export async function queueVideo(id, { force = false } = {}) {
  if (force) await patchVideo(id, { processedAt: null });
  if (!videoJobs.queue.includes(id) && videoJobs.running?.id !== id) videoJobs.queue.push(id);
  drain();
}

/** Queue every uploaded video that hasn't been processed yet. */
export async function queueUnprocessed() {
  const { videos } = await readVideos();
  for (const v of videos) if (v.blobPath?.startsWith('__videos/') && !v.processedAt) queueVideo(v.id);
  return videoJobs.queue.length + (videoJobs.running ? 1 : 0);
}
