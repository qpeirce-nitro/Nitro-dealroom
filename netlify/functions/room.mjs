// One deal room, opened by its private link: /r/<roomId>
// GET  /api/room?r=<roomId>              -> { config, tasks }
// POST /api/room?r=<roomId> { op, ... }  -> add | update | delete a plan step, or log a CTA click
import { getStore } from '@netlify/blobs';
import { STATUSES, OWNERS, isFileId, readUpload, newFileId } from '../lib/template.mjs';

const MAX_UPLOADS = 30;
const INLINE = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

async function serveFile(store, base, config, fid) {
  if (!isFileId(fid)) return json({ error: 'not found' }, 404);
  const linked = (config.docs || []).some((d) => d.file === fid) || !!(await store.get(base + 'upload/' + fid, { type: 'json' }));
  if (!linked) return json({ error: 'not found' }, 404);
  const [meta, data] = await Promise.all([store.get('filemeta/' + fid, { type: 'json' }), store.get('file/' + fid, { type: 'arrayBuffer' })]);
  if (!meta || !data) return json({ error: 'not found' }, 404);
  const safe = meta.name.replace(/[^\w .()-]+/g, '_');
  return new Response(data, { status: 200, headers: {
    'content-type': meta.type,
    'content-disposition': (INLINE.includes(meta.type) ? 'inline' : 'attachment') + '; filename="' + safe + '"; filename*=UTF-8\'\'' + encodeURIComponent(meta.name),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    'cache-control': 'private, max-age=300'
  } });
}

const MAX_TASKS = 200;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9]{1,40}$/.test(s);
const rand = (n) => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => a[x % a.length]).join(''); };

async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
}

export default async (req) => {
  const rid = new URL(req.url).searchParams.get('r') || '';
  if (!/^[A-Za-z0-9]{16,40}$/.test(rid)) return json({ error: 'not found' }, 404);
  const store = getStore({ name: 'dealroom', consistency: 'strong' });
  const base = 'room/' + rid + '/';
  const config = await store.get(base + 'config', { type: 'json' });
  if (!config) return json({ error: 'not found' }, 404);
  const phaseIds = (config.phases || []).map((p) => p.id);

  if (req.method === 'GET') {
    const fid = new URL(req.url).searchParams.get('f');
    if (fid) return serveFile(store, base, config, fid);
    const [tasks, uploads] = await Promise.all([listJSON(store, base + 'task/'), listJSON(store, base + 'upload/')]);
    return json({ config, tasks, uploads: uploads.sort((a, b) => b.at - a.at) });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const by = clean(body.by, 60);
  const now = Date.now();
  const touch = () => store.setJSON(base + 'activity', { at: now, by });

  switch (body.op) {
    case 'add': {
      const t = body.task || {};
      const title = clean(t.title, 200);
      if (!title || !OWNERS.includes(t.owner) || !phaseIds.includes(t.phase) || !isDate(t.due)) return json({ error: 'invalid step' }, 400);
      const { blobs } = await store.list({ prefix: base + 'task/' });
      if (blobs.length >= MAX_TASKS) return json({ error: 'plan is full' }, 409);
      const task = { id: 'x' + rand(10), title, owner: t.owner, phase: t.phase, due: t.due, status: 'todo', note: '', createdAt: now, updatedAt: now, updatedBy: by };
      await store.setJSON(base + 'task/' + task.id, task);
      await touch();
      return json({ ok: true, task });
    }
    case 'update': {
      if (!isId(body.id)) return json({ error: 'invalid id' }, 400);
      const cur = await store.get(base + 'task/' + body.id, { type: 'json' });
      if (!cur) return json({ error: 'not found' }, 404);
      const p = body.patch || {};
      const next = { ...cur };
      if ('title' in p) { const v = clean(p.title, 200); if (!v) return json({ error: 'invalid title' }, 400); next.title = v; }
      if ('note' in p) next.note = clean(p.note, 400);
      if ('owner' in p) { if (!OWNERS.includes(p.owner)) return json({ error: 'invalid owner' }, 400); next.owner = p.owner; }
      if ('status' in p) { if (!STATUSES.includes(p.status)) return json({ error: 'invalid status' }, 400); next.status = p.status; }
      if ('due' in p) { if (!isDate(p.due)) return json({ error: 'invalid date' }, 400); next.due = p.due; }
      next.updatedAt = now;
      next.updatedBy = by;
      await store.setJSON(base + 'task/' + body.id, next);
      await touch();
      return json({ ok: true, task: next });
    }
    case 'delete': {
      if (!isId(body.id)) return json({ error: 'invalid id' }, 400);
      await store.delete(base + 'task/' + body.id);
      await touch();
      return json({ ok: true });
    }
    case 'upload': {
      const f = readUpload(body.name, body.data);
      if (f.error) return json({ error: f.error }, 400);
      const { blobs } = await store.list({ prefix: base + 'upload/' });
      if (blobs.length >= MAX_UPLOADS) return json({ error: 'This deal room has reached its upload limit. Ask your Nitro contact to remove old files.' }, 409);
      const fid = newFileId();
      const meta = { fid, name: f.name, type: f.type, size: f.bytes.length, at: now, by, scope: 'customer', rid };
      await store.set('file/' + fid, f.bytes);
      await store.setJSON('filemeta/' + fid, meta);
      await store.setJSON(base + 'upload/' + fid, meta);
      await touch();
      return json({ ok: true, upload: meta });
    }
    case 'deleteUpload': {
      if (!isFileId(body.fid)) return json({ error: 'invalid id' }, 400);
      if (!(await store.get(base + 'upload/' + body.fid, { type: 'json' }))) return json({ error: 'not found' }, 404);
      await Promise.all([store.delete(base + 'upload/' + body.fid), store.delete('file/' + body.fid), store.delete('filemeta/' + body.fid)]);
      await touch();
      return json({ ok: true });
    }
    case 'request': {
      const kind = body.kind === 'approve' ? 'approve' : 'questions';
      await store.setJSON(base + 'request/' + now + '-' + rand(5), { kind, at: now, by, page: clean(body.page, 20) });
      await touch();
      return json({ ok: true });
    }
    default:
      return json({ error: 'unknown op' }, 400);
  }
};

export const config = { path: '/api/room' };
