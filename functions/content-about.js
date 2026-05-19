/* functions/content-about.js
 * GET /api/about
 * PUT /api/about   body: partial about object
 */

import { readAbout, writeAbout } from './utils/blobs.js';
import { withAuth } from './utils/auth.js';

const handler = async (req) => {
  if (req.method === 'GET') {
    return json(await readAbout());
  }
  if (req.method === 'PUT') {
    const current = await readAbout();
    const body = await req.json().catch(() => ({}));
    const merged = { ...current, ...body, education: { ...current.education, ...(body.education || {}) } };
    await writeAbout(merged);
    return json(merged);
  }
  return json({ error: 'method_not_allowed' }, 405);
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default withAuth(handler);
