// Shared storage for the deal room's mutual action plan.
// GET  /api/plan                 -> { meta, tasks }
// POST /api/plan { op, ... }     -> add | update | delete a step, or log a CTA request
// GET  /api/plan?requests=1      -> CTA requests (needs the x-admin-code header = ADMIN_CODE)
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   ROOM_CODE   optional. When set, every visitor must enter this code once to see or edit the plan.
//   ADMIN_CODE  optional. Lets the Nitro team read the "Approve" / "I have questions" requests.
import { getStore } from '@netlify/blobs';
import seed from '../../seed.json';

const STATUSES = ['todo', 'progress', 'done', 'risk'];
const OWNERS = ['Nitro', 'Kestrel', 'Joint'];
const MAX_TASKS = 300;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9]{1,40}$/.test(s);
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function ensureSeeded(store) {
  let meta = await store.get('meta', { type: 'json' });
  if (!meta) {
    meta = seed.meta;
    await Promise.all(seed.tasks.map((t) => store.setJSON('task/' + t.id, t)));
    await store.setJSON('meta', meta);
  }
  return meta;
}

async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  return items.filter(Boolean);
}

export default async (req) => {
  const roomCode = process.env.ROOM_CODE || '';
  if (roomCode && req.headers.get('x-room-code') !== roomCode) return json({ error: 'locked' }, 401);

  const store = getStore({ name: 'dealroom', consistency: 'strong' });
  const meta = await ensureSeeded(store);
  const phaseIds = (meta.phases || []).map((p) => p.id);

  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.has('requests')) {
      const admin = process.env.ADMIN_CODE;
      if (!admin || req.headers.get('x-admin-code') !== admin) return json({ error: 'forbidden' }, 403);
      const requests = (await listJSON(store, 'request/')).sort((a, b) => b.at - a.at);
      return json({ requests });
    }
    return json({ meta, tasks: await listJSON(store, 'task/') });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const by = clean(body.by, 60);
  const now = Date.now();

  switch (body.op) {
    case 'add': {
      const t = body.task || {};
      const title = clean(t.title, 200);
      if (!title || !OWNERS.includes(t.owner) || !phaseIds.includes(t.phase) || !isDate(t.due)) return json({ error: 'invalid step' }, 400);
      const { blobs } = await store.list({ prefix: 'task/' });
      if (blobs.length >= MAX_TASKS) return json({ error: 'plan is full' }, 409);
      const task = { id: newId(), title, owner: t.owner, phase: t.phase, due: t.due, status: 'todo', note: '', createdAt: now, updatedAt: now, updatedBy: by };
      await store.setJSON('task/' + task.id, task);
      return json({ ok: true, task });
    }
    case 'update': {
      if (!isId(body.id)) return json({ error: 'invalid id' }, 400);
      const cur = await store.get('task/' + body.id, { type: 'json' });
      if (!cur) return json({ error: 'not found' }, 404);
      const p = body.patch || {};
      const next = { ...cur };
      if ('title' in p) { const v = clean(p.title, 200); if (!v) return json({ error: 'invalid title' }, 400); next.title = v; }
      if ('note' in p) next.note = clean(p.note, 400);
      if ('owner' in p) { if (!OWNERS.includes(p.owner)) return json({ error: 'invalid owner' }, 400); next.owner = p.owner; }
      if ('status' in p) { if (!STATUSES.includes(p.status)) return json({ error: 'invalid status' }, 400); next.status = p.status; }
      if ('due' in p) { if (!isDate(p.due)) return json({ error: 'invalid date' }, 400); next.due = p.due; }
      if ('phase' in p) { if (!phaseIds.includes(p.phase)) return json({ error: 'invalid step group' }, 400); next.phase = p.phase; }
      next.updatedAt = now;
      next.updatedBy = by;
      await store.setJSON('task/' + body.id, next);
      return json({ ok: true, task: next });
    }
    case 'delete': {
      if (!isId(body.id)) return json({ error: 'invalid id' }, 400);
      await store.delete('task/' + body.id);
      return json({ ok: true });
    }
    case 'request': {
      const kind = body.kind === 'approve' ? 'approve' : 'questions';
      await store.setJSON('request/' + now + '-' + Math.random().toString(36).slice(2, 7), { kind, at: now, by, page: clean(body.page, 20) });
      return json({ ok: true });
    }
    default:
      return json({ error: 'unknown op' }, 400);
  }
};

export const config = { path: '/api/plan' };
