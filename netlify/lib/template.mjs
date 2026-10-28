// Nitro's standard deal-room template: default content and the Mutual Action Plan
// built from Nitro's sales process (Discover & Demo -> Pilot -> Executive Briefing & Decide -> Commit & Rollout).

export const STATUSES = ['todo', 'progress', 'done', 'risk'];
export const OWNERS = ['Nitro', 'Customer', 'Joint'];

const DAY = 86400000;
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const num = (v, min, max, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
const url = (s) => { const v = clean(s, 500); return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : ''; };
export const isFileId = (s) => typeof s === 'string' && /^f[a-z0-9]{12,24}$/.test(s);

// Files people can upload: extension -> content type served back.
export const FILE_TYPES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip'
};
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Decode and check an uploaded file. Returns { error } or { name, ext, type, bytes }.
export function readUpload(name, base64) {
  const n = clean(name, 120).replace(/[\\/:*?"<>|]+/g, '-');
  const ext = (n.split('.').pop() || '').toLowerCase();
  if (!n || !FILE_TYPES[ext]) return { error: 'That file type isn’t supported. Use PDF, Word, Excel, PowerPoint, CSV, text, PNG, JPG or ZIP.' };
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8) return { error: 'Files can be up to 4 MB.' };
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) return { error: 'That file is empty.' };
  if (bytes.length > MAX_FILE_BYTES) return { error: 'Files can be up to 4 MB.' };
  return { name: n, ext, type: FILE_TYPES[ext], bytes };
}

export const newFileId = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.getRandomValues(new Uint8Array(18)); return 'f' + [...b].map((x) => a[x % a.length]).join(''); };

const email = (s) => { const v = clean(s, 120); return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v) ? v : ''; };

export const DEFAULT_CRITERIA = [
  { label: 'Pilot users rate Nitro equal or better than today', target: '≥ 80%' },
  { label: 'Weekly active pilot users', target: '≥ 70%' },
  { label: 'IT validates deployment, SSO and admin controls', target: 'Pass' },
  { label: 'Agreements signed in Nitro Sign during the pilot', target: '≥ 50' },
  { label: 'Security review completed with no critical findings', target: 'Pass' }
];

export const DEFAULT_DOCS = [
  { title: 'Nitro Trust Center', desc: 'Security controls, certifications, privacy and data residency', stage: 'Pilot', url: 'https://www.gonitro.com/security-compliance' },
  { title: 'Compliance certifications by product', desc: 'SOC 2 Type 2, ISO 27001, HIPAA and more, per Nitro product', stage: 'Pilot', url: 'https://www.gonitro.com/security-compliance/compliance' },
  { title: 'AI at Nitro: privacy and data handling', desc: 'How Nitro’s AI features protect your documents', stage: 'Pilot', url: 'https://www.gonitro.com/security-compliance/artificial-intelligence' },
  { title: 'Nitro PDF Pro training video', desc: 'A short introduction for pilot users', stage: 'Pilot', url: 'https://www.gonitro.com/tutorial-videos/introduction-to-nitro-pdf-pro' },
  { title: 'Nitro Pilot Overview', desc: 'How the pilot works, step by step', stage: 'Pilot', url: '' },
  { title: 'Pilot Mutual Activity Plan', desc: 'Products tested, timeline, decision criteria, success metrics, technical specs', stage: 'Pilot', url: '' },
  { title: 'Nitro Installation Guide', desc: 'Installers, Team Account setup, activation and self-help resources', stage: 'Pilot', url: '' },
  { title: 'Account Activation Instructions', desc: 'For pilot participants joining the Nitro Team', stage: 'Pilot', url: '' },
  { title: 'Pilot participant email templates', desc: 'Ready-to-send communications to pilot users', stage: 'Pilot', url: '' },
  { title: 'IT/Technical Validation Survey', desc: 'For your IT team, near the end of the pilot', stage: 'Pilot', url: '' },
  { title: 'Post-pilot user survey', desc: 'For all pilot participants', stage: 'Pilot', url: '' },
  { title: 'Executive Briefing — pilot results', desc: 'Survey results, usage, productivity, sustainability, time and $ saved', stage: 'Decision', url: '' },
  { title: 'Order form & MSA', desc: 'Annual subscription', stage: 'Decision', url: '' },
  { title: 'Onboarding plan', desc: 'Admin training, end-user webinars and rollout schedule', stage: 'Rollout', url: '' }
];

export const CUSTOMER_ROLES = ['Executive sponsor', 'Champion', 'Economic buyer', 'IT', 'Security', 'Procurement', 'Legal', 'Other'];

export function defaultDates(todayIso) {
  const pilotStart = addDays(todayIso, 7);
  const pilotEnd = addDays(pilotStart, 30);
  const briefing = addDays(pilotEnd, 6);
  const decision = addDays(briefing, 14);
  const goLive = addDays(decision, 28);
  return { pilotStart, pilotEnd, briefing, decision, goLive, renewal: '' };
}

// Validate and normalise a config coming from the setup form.
export function sanitizeConfig(c, todayIso) {
  c = c || {};
  const d = c.dates || {};
  const defs = defaultDates(todayIso);
  const dates = {};
  for (const k of ['pilotStart', 'pilotEnd', 'briefing', 'decision', 'goLive']) dates[k] = isDate(d[k]) ? d[k] : defs[k];
  dates.renewal = isDate(d.renewal) ? d.renewal : '';
  const person = (p) => ({ name: clean(p?.name, 80), title: clean(p?.title, 80), email: email(p?.email) });
  const t = c.team || {};
  const out = {
    account: clean(c.account, 80) || 'Your company',
    preparedOn: isDate(c.preparedOn) ? c.preparedOn : todayIso,
    incumbent: clean(c.incumbent, 60),
    seats: num(c.seats, 1, 1000000, 500),
    pilotUsers: num(c.pilotUsers, 1, 100000, 100),
    pilotLocations: clean(c.pilotLocations, 60),
    products: { pdf: c.products?.pdf !== false, sign: c.products?.sign !== false },
    dates,
    customer: (Array.isArray(c.customer) ? c.customer : []).slice(0, 8)
      .map((p) => ({ name: clean(p?.name, 80), title: clean(p?.title, 80), role: CUSTOMER_ROLES.includes(p?.role) ? p.role : 'Other' }))
      .filter((p) => p.name),
    team: { ae: person(t.ae), se: person(t.se), csm: person(t.csm) },
    bookingUrl: url(c.bookingUrl),
    videoUrl: url(c.videoUrl),
    pricing: {
      annual: clean(c.pricing?.annual, 40),
      perSeat: clean(c.pricing?.perSeat, 40),
      priceLock: clean(c.pricing?.priceLock, 80),
      quotedPerSeat: num(c.pricing?.quotedPerSeat, 0, 100000, 0),
      currentPerSeat: num(c.pricing?.currentPerSeat, 0, 100000, 240)
    },
    heard: (Array.isArray(c.heard) ? c.heard : []).slice(0, 4)
      .map((x) => ({ title: clean(x?.title, 60), quote: clean(x?.quote, 300), who: clean(x?.who, 80) }))
      .filter((x) => x.quote),
    criteria: (Array.isArray(c.criteria) && c.criteria.length ? c.criteria : DEFAULT_CRITERIA).slice(0, 8)
      .map((x) => ({ label: clean(x?.label, 120), target: clean(x?.target, 20) }))
      .filter((x) => x.label),
    docs: (Array.isArray(c.docs) && c.docs.length ? c.docs : DEFAULT_DOCS).slice(0, 30)
      .map((x) => {
        const d = { title: clean(x?.title, 100), desc: clean(x?.desc, 160), stage: ['Pilot', 'Decision', 'Rollout'].includes(x?.stage) ? x.stage : 'Pilot', url: url(x?.url) };
        if (isFileId(x?.file)) { d.file = x.file; d.fileName = clean(x.fileName, 120); d.size = num(x.size, 0, 50e6, 0); d.url = ''; }
        return d;
      })
      .filter((x) => x.title)
  };
  Object.assign(out, buildSchedule(out));
  return out;
}

// Phases and milestones shown on the plan's timeline.
export function buildSchedule(c) {
  const d = c.dates;
  const discoverStart = addDays(d.pilotStart, -21);
  const phases = [
    { id: 'p0', step: 'Step 1', name: 'Discover & Demo', start: discoverStart, end: addDays(d.pilotStart, -6) },
    { id: 'p1', step: 'Step 2', name: 'Pilot', start: addDays(d.pilotStart, -5), end: d.pilotEnd },
    { id: 'p2', step: 'Step 3', name: 'Executive Briefing & Decide', start: addDays(d.pilotEnd, 1), end: d.decision },
    { id: 'p3', step: 'Step 4', name: 'Commit & Rollout', start: addDays(d.decision, 1), end: addDays(d.goLive, 28) }
  ];
  const milestones = [
    { label: 'Pilot ends', date: d.pilotEnd },
    { label: 'Executive Briefing', date: d.briefing },
    { label: 'Go-live', date: d.goLive }
  ];
  if (d.renewal) milestones.push({ label: (c.incumbent ? c.incumbent + ' ' : '') + 'renewal', date: d.renewal });
  return { phases, milestones };
}

// Nitro's standard Mutual Action Plan, dated from the deal's key dates.
export function buildTasks(c) {
  const d = c.dates;
  const mid = addDays(d.pilotStart, Math.round((new Date(d.pilotEnd) - new Date(d.pilotStart)) / DAY / 2));
  const who = (role) => (c.customer.find((p) => p.role === role) || {}).name || '';
  const champ = who('Champion');
  const leaders = [who('Executive sponsor'), who('Economic buyer')].filter(Boolean).join(' and ');
  const products = [c.products.pdf && 'Nitro PDF Pro', c.products.sign && 'Nitro Sign'].filter(Boolean).join(' + ') || 'Nitro';
  const rows = [
    ['p0', 'Discovery call with IT, Finance and Operations', 'Joint', addDays(d.pilotStart, -21)],
    ['p0', products + ' demo for stakeholders', 'Nitro', addDays(d.pilotStart, -14)],
    ['p0', 'Agree pilot success criteria and decision criteria', 'Joint', addDays(d.pilotStart, -10)],
    ['p0', 'Sign off the Pilot Mutual Activity Plan', 'Joint', addDays(d.pilotStart, -7), 'Products, timeline, success metrics and technical specs agreed'],
    ['p1', 'Share security and compliance documentation', 'Nitro', addDays(d.pilotStart, -5)],
    ['p1', 'Confirm deployment model (NLS or DRM-free) and data residency', 'Joint', addDays(d.pilotStart, -3)],
    ['p1', 'Pilot kickoff call', 'Joint', d.pilotStart],
    ['p1', 'Send pilot participant emails', 'Customer', addDays(d.pilotStart, 1), 'Using Nitro’s end-user email templates'],
    ['p1', 'Deploy Nitro to ' + c.pilotUsers + ' pilot users and activate Nitro Team', 'Customer', addDays(d.pilotStart, 2)],
    ['p1', 'Configure SSO for the pilot group', 'Joint', addDays(d.pilotStart, 7)],
    ['p1', 'Security review complete', 'Customer', addDays(d.pilotStart, 10)],
    ['p1', 'Mid-pilot usage review', 'Nitro', mid],
    ['p1', 'Weekly champion check-ins' + (champ ? ' with ' + champ : ''), 'Joint', addDays(d.pilotEnd, -1)],
    ['p1', 'IT/Technical Validation Survey', 'Customer', addDays(d.pilotEnd, -5)],
    ['p1', 'Post-pilot user survey closes (target 60% response)', 'Customer', addDays(d.pilotEnd, -1)],
    ['p1', 'Pilot ends', 'Joint', d.pilotEnd],
    ['p2', 'Build Executive Briefing from pilot data', 'Nitro', addDays(d.briefing, -3), 'Survey results, usage, productivity, sustainability, time and $ saved'],
    ['p2', 'Executive Briefing' + (leaders ? ' with ' + leaders : ''), 'Joint', d.briefing],
    ['p2', 'Present quote and order form', 'Nitro', d.briefing],
    ['p2', 'Procurement vendor onboarding', 'Customer', addDays(d.decision, -7)],
    ['p2', 'MSA redlines and legal review', 'Joint', addDays(d.decision, -4)],
    ['p2', 'Final decision', 'Customer', d.decision],
    ['p3', 'Confirm AP contact and Nitro admin contact', 'Customer', addDays(d.decision, 3)],
    ['p3', 'Order form signed in Nitro Sign and PO issued', 'Customer', addDays(d.decision, 7)],
    ['p3', 'Customer Success onboarding kickoff', 'Nitro', addDays(d.goLive, -14)],
    ['p3', 'Admin training and end-user webinars', 'Nitro', addDays(d.goLive, -7)],
    ['p3', 'Production rollout to ' + c.seats.toLocaleString('en-US') + ' seats', 'Joint', d.goLive],
    ['p3', '30-day adoption review', 'Nitro', addDays(d.goLive, 28)]
  ];
  if (d.renewal) rows.push(['p3', (c.incumbent || 'Current tool') + ' renewal date — let lapse', 'Customer', d.renewal]);
  const base = Date.now();
  return rows.map((r, i) => ({ id: 't' + String(i + 1).padStart(2, '0'), phase: r[0], title: r[1], owner: r[2], due: r[3], status: 'todo', note: r[4] || '', createdAt: base + i }));
}
