// Nitro-only setup API behind /admin. Every call except "status" and the one-time "setup"
// needs the admin code in the x-admin-code header.
// The admin code is chosen on first visit to /admin and stored only as a salted hash.
// (Optional: an ADMIN_CODE environment variable overrides it.)
import { getStore } from '@netlify/blobs';
import { sanitizeConfig, buildTasks, defaultDates, DEFAULT_CRITERIA, DEFAULT_DOCS, CUSTOMER_ROLES, isFileId, readUpload, newFileId } from '../lib/template.mjs';

const STAGES = ['Pilot', 'Decision', 'Rollout'];
const cleanS = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const libDoc = (l) => ({ title: l.title, desc: l.desc, stage: l.stage, url: '', file: l.fid, fileName: l.name, size: l.size });

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
    case 'uploadFile': {
      const f = readUpload(body.name, body.data);
      if (f.error) return json({ error: f.error }, 400);
      const fid = newFileId();
      const lib = body.scope === 'library';
      const meta = { fid, name: f.name, type: f.type, size: f.bytes.length, at: Date.now(), scope: lib ? 'library' : 'room' };
      await store.set('file/' + fid, f.bytes);
      await store.setJSON('filemeta/' + fid, meta);
      if (lib) {
        const entry = { ...meta, title: cleanS(body.title, 100) || f.name.replace(/\.[^.]+$/, ''), desc: cleanS(body.desc, 160), stage: STAGES.includes(body.stage) ? body.stage : 'Pilot', auto: body.auto !== false };
        await store.setJSON('library/' + fid, entry);
        return json({ ok: true, file: entry });
      }
      return json({ ok: true, file: meta });
    }
    case 'library':
      return json({ library: (await listJSON(store, 'library/')).sort((a, b) => a.at - b.at) });
    case 'updateLibrary': {
      if (!isFileId(body.fid)) return json({ error: 'not found' }, 404);
      const cur = await store.get('library/' + body.fid, { type: 'json' });
      if (!cur) return json({ error: 'not found' }, 404);
      const next = { ...cur };
      if ('title' in body) next.title = cleanS(body.title, 100) || cur.title;
      if ('desc' in body) next.desc = cleanS(body.desc, 160);
      if ('stage' in body && STAGES.includes(body.stage)) next.stage = body.stage;
      if ('auto' in body) next.auto = !!body.auto;
      await store.setJSON('library/' + body.fid, next);
      return json({ ok: true, file: next });
    }
    case 'deleteLibrary': {
      if (!isFileId(body.fid)) return json({ error: 'not found' }, 404);
      // The file itself stays so deal rooms that already share it keep working.
      await store.delete('library/' + body.fid);
      return json({ ok: true });
    }
    case 'list': {
      const rooms = await listJSON(store, 'rooms/');
      const out = await Promise.all(rooms.map(async (r) => {
        const base = 'room/' + r.rid + '/';
        const [tasks, requests, activity, uploads] = await Promise.all([listJSON(store, base + 'task/'), listJSON(store, base + 'request/'), store.get(base + 'activity', { type: 'json' }), listJSON(store, base + 'upload/')]);
        return { ...r, total: tasks.length, done: tasks.filter((t) => t.status === 'done').length, risk: tasks.filter((t) => t.status === 'risk').length, requests: requests.sort((a, b) => b.at - a.at).slice(0, 5), activity, uploads: uploads.sort((a, b) => b.at - a.at).map((u) => ({ fid: u.fid, name: u.name, at: u.at, by: u.by })) };
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
      const input = { ...(body.config || {}) };
      if (body.includeLibrary !== false) {
        const lib = (await listJSON(store, 'library/')).filter((l) => l.auto).sort((a, b) => a.at - b.at);
        const docs = (Array.isArray(input.docs) && input.docs.length ? input.docs : DEFAULT_DOCS).map((d) => ({ ...d }));
        const have = new Set(docs.map((d) => d.file).filter(Boolean));
        const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        for (const l of lib) {
          if (have.has(l.fid)) continue;
          // A library file whose title matches an empty placeholder fills that placeholder.
          const slot = docs.find((d) => !d.file && !d.url && key(d.title) === key(l.title));
          if (slot) Object.assign(slot, { file: l.fid, fileName: l.name, size: l.size, url: '', desc: slot.desc || l.desc });
          else docs.push(libDoc(l));
          have.add(l.fid);
        }
        input.docs = docs;
      }
      const config = sanitizeConfig(input, today());
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
      const base = 'room/' + body.rid + '/';
      const [cfg, uploads] = await Promise.all([store.get(base + 'config', { type: 'json' }), listJSON(store, base + 'upload/')]);
      const roomFiles = uploads.map((u) => u.fid);
      for (const d of (cfg?.docs || [])) {
        if (!d.file) continue;
        const m = await store.get('filemeta/' + d.file, { type: 'json' });
        if (m && m.scope === 'room') roomFiles.push(d.file);
      }
      await Promise.all(roomFiles.flatMap((fid) => [store.delete('file/' + fid), store.delete('filemeta/' + fid)]));
      const { blobs } = await store.list({ prefix: base });
      await Promise.all(blobs.map((b) => store.delete(b.key)));
      await store.delete('rooms/' + body.rid);
      return json({ ok: true });
    }
    default:
      return json({ error: 'unknown op' }, 400);
  }
};

export const config = { path: '/api/admin' };
