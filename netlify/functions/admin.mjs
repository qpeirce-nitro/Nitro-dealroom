// Nitro-only setup API behind /admin. Every call except "status" and the one-time "setup"
// needs the admin code in the x-admin-code header.
// The admin code is chosen on first visit to /admin and stored only as a salted hash.
// (Optional: an ADMIN_CODE environment variable overrides it.)
import { getStore } from '@netlify/blobs';
import { sanitizeConfig, buildTasks, defaultDates, DEFAULT_CRITERIA, DEFAULT_DOCS, CUSTOMER_ROLES } from '../lib/template.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const rand = (n) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => a[x % a.length]).join(''); };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hash(code, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256));
}
const today = () => new Date().toISOString().slice(0, 10);
const isRid = (s) => typeof s === 'string' && /^[A-Za-z0-9]{16,40}$/.test(s);

async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
}

async function authorized(store, code) {
  if (!code) return false;
  if (process.env.ADMIN_CODE) return code === process.env.ADMIN_CODE;
  const auth = await store.get('admin/auth', { type: 'json' });
  if (!auth) return false;
  return (await hash(code, auth.salt)) === auth.hash;
}

export default async (req) => {
  const store = getStore({ name: 'dealroom', consistency: 'strong' });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  if (body.op === 'status') {
    const auth = await store.get('admin/auth', { type: 'json' });
    return json({ setup: !!auth || !!process.env.ADMIN_CODE });
  }
  if (body.op === 'setup') {
    if (process.env.ADMIN_CODE || (await store.get('admin/auth', { type: 'json' }))) return json({ error: 'already set up' }, 409);
    const code = String(body.code || '');
    if (code.length < 8) return json({ error: 'Use at least 8 characters.' }, 400);
    const salt = rand(16);
    await store.setJSON('admin/auth', { salt, hash: await hash(code, salt), at: Date.now() });
    return json({ ok: true });
  }

  if (!(await authorized(store, req.headers.get('x-admin-code') || ''))) {
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: 'locked' }, 401);
  }

  switch (body.op) {
    case 'check':
      return json({ ok: true });
    case 'defaults':
      return json({ criteria: DEFAULT_CRITERIA, docs: DEFAULT_DOCS, roles: CUSTOMER_ROLES, dates: defaultDates(today()) });
    case 'list': {
      const rooms = await listJSON(store, 'rooms/');
      const out = await Promise.all(rooms.map(async (r) => {
        const base = 'room/' + r.rid + '/';
        const [tasks, requests, activity] = await Promise.all([listJSON(store, base + 'task/'), listJSON(store, base + 'request/'), store.get(base + 'activity', { type: 'json' })]);
        return { ...r, total: tasks.length, done: tasks.filter((t) => t.status === 'done').length, risk: tasks.filter((t) => t.status === 'risk').length, requests: requests.sort((a, b) => b.at - a.at).slice(0, 5), activity };
      }));
      return json({ rooms: out.sort((a, b) => b.createdAt - a.createdAt) });
    }
    case 'get': {
      if (!isRid(body.rid)) return json({ error: 'not found' }, 404);
      const config = await store.get('room/' + body.rid + '/config', { type: 'json' });
      return config ? json({ config }) : json({ error: 'not found' }, 404);
    }
    case 'create': {
      const rid = rand(22);
      const config = sanitizeConfig(body.config, today());
      const base = 'room/' + rid + '/';
      await Promise.all(buildTasks(config).map((t) => store.setJSON(base + 'task/' + t.id, t)));
      await store.setJSON(base + 'config', config);
      await store.setJSON('rooms/' + rid, { rid, account: config.account, createdAt: Date.now(), ae: config.team.ae.name });
      return json({ ok: true, rid });
    }
    case 'save': {
      if (!isRid(body.rid)) return json({ error: 'not found' }, 404);
      const base = 'room/' + body.rid + '/';
      const cur = await store.get(base + 'config', { type: 'json' });
      if (!cur) return json({ error: 'not found' }, 404);
      const config = sanitizeConfig({ ...body.config, preparedOn: cur.preparedOn }, today());
      await store.setJSON(base + 'config', config);
      const idx = (await store.get('rooms/' + body.rid, { type: 'json' })) || { rid: body.rid, createdAt: Date.now() };
      await store.setJSON('rooms/' + body.rid, { ...idx, account: config.account, ae: config.team.ae.name });
      if (body.rebuildPlan) {
        const { blobs } = await store.list({ prefix: base + 'task/' });
        await Promise.all(blobs.map((b) => store.delete(b.key)));
        await Promise.all(buildTasks(config).map((t) => store.setJSON(base + 'task/' + t.id, t)));
      }
      return json({ ok: true });
    }
    case 'delete': {
      if (!isRid(body.rid)) return json({ error: 'not found' }, 404);
      const { blobs } = await store.list({ prefix: 'room/' + body.rid + '/' });
      await Promise.all(blobs.map((b) => store.delete(b.key)));
      await store.delete('rooms/' + body.rid);
      return json({ ok: true });
    }
    default:
      return json({ error: 'unknown op' }, 400);
  }
};

export const config = { path: '/api/admin' };
