import { randomBytes, createHash, pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import sharp from 'sharp';
const derive = promisify(pbkdf2);
const hash = text => createHash('sha256').update(text).digest('hex');
const cookieName = '__Host-eagles_session';
const cookie = value => `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value ? 3600 : 0}`;
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const idOK = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const tokenOf = req => (req.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
async function readJSON(req, limit = 5 * 1024 * 1024) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, 'Expected JSON.');
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > limit) fail(413, 'The upload is too large. Choose a smaller picture.');
  try { const data = JSON.parse(new TextDecoder().decode(bytes)); if (!data || Array.isArray(data) || typeof data !== 'object') throw 0; return data; }
  catch { fail(400, 'Invalid request.'); }
}
async function normalizedImage(value) {
  if (typeof value !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(value)) fail(400, 'Choose a JPG, PNG or WebP picture.');
  const encoded = value.split(',')[1];
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail(400, 'Invalid image.');
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length > 4 * 1024 * 1024) fail(413, 'Choose a smaller image.');
  try {
    const input = sharp(raw, { limitInputPixels: 20000000 });
    const meta = await input.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw 0;
    return await input.rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 85 }).toBuffer();
  } catch { fail(400, 'This picture cannot be read. Choose a valid image under 20 megapixels.'); }
}
export function createHandler({ store, account }) {
  async function session(req) {
    const token = tokenOf(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    const record = await store.get(`sessions/${hash(token)}`, { type: 'json' });
    return !!record && record.expires > Date.now() && record.version === account.hash;
  }
  async function keys(prefix) {
    const result = [];
    for await (const page of store.list({ prefix, paginate: true })) result.push(...page.blobs.map(b => b.key));
    return result;
  }
  async function gallery() {
    const events = [];
    for (const key of await keys('albums/')) {
      const album = await store.get(key, { type: 'json' });
      if (!album || album.deleted) continue;
      const photos = [];
      for (const key of await keys(`photos/${album.id}/`)) {
        const photo = await store.get(key, { type: 'json' });
        if (photo) photos.push(photo);
      }
      photos.sort((a,b) => a.created - b.created || a.id.localeCompare(b.id));
      events.push({ ...album, photos });
    }
    return { events: events.sort((a,b) => b.date.localeCompare(a.date)) };
  }
  async function albumBy(id) {
    if (!idOK(id)) fail(404, 'Event not found.');
    const album = await store.get(`albums/${id}`, { type: 'json' });
    if (!album || album.deleted) fail(404, 'Event not found.');
    return album;
  }
  return async function handler(req) {
    try {
      const url = new URL(req.url), path = url.pathname;
      if (req.method === 'GET') {
        if (path === '/api/session') return json({ authenticated: await session(req) });
        if (path === '/data/event-info.json') return json(await store.get('event-info', { type: 'json' }) || { image: '', description: '' });
        if (path === '/data/gallery.json') return json(await gallery());
        if (path.startsWith('/api/media/')) {
          const parts = path.split('/');
          const albumId = parts[3], photoId = parts[4];
          await albumBy(albumId);
          if (!idOK(photoId) || parts.length !== 5 || !await store.get(`photos/${albumId}/${photoId}`, { type: 'json' })) fail(404, 'Picture not found.');
          const bytes = await store.get(`images/${photoId}`, { type: 'arrayBuffer' });
          if (!bytes) fail(404, 'Picture not found.');
          return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
        }
        fail(404, 'Not found.');
      }
      if (req.method !== 'POST') fail(405, 'Method not allowed.');
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) fail(403, 'Request origin not allowed.');
      if (req.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'Cross-site request not allowed.');
      if (path === '/api/login') {
        const data = await readJSON(req, 4096);
        if (typeof data.username !== 'string' || typeof data.password !== 'string') fail(400, 'Enter your username and password.');
        const digest = await derive(data.password, Buffer.from(account.salt, 'hex'), 600000, 32, 'sha256');
        const passwordOK = timingSafeEqual(digest, Buffer.from(account.hash, 'hex'));
        const userOK = timingSafeEqual(Buffer.from(hash(data.username), 'hex'), Buffer.from(hash(account.username), 'hex'));
        if (!passwordOK || !userOK) fail(401, 'Incorrect username or password.');
        const previous = tokenOf(req); if (previous) await store.delete(`sessions/${hash(previous)}`);
        const token = randomBytes(32).toString('hex');
        await store.setJSON(`sessions/${hash(token)}`, { expires: Date.now() + 3600000, version: account.hash });
        return json({ message: 'Signed in.' }, 200, { 'Set-Cookie': cookie(token) });
      }
      if (path === '/api/logout') {
        const token = tokenOf(req); if (token) await store.delete(`sessions/${hash(token)}`);
        const requested = url.searchParams.get('returnTo');
        const target = ['/index.html', '/gallery.html', '/event-info.html'].includes(requested) ? requested : '/index.html';
        return new Response(null, { status: 303, headers: { Location: target, 'Set-Cookie': cookie(''), 'Cache-Control': 'no-store' } });
      }
      if (!await session(req)) fail(401, 'Please sign in again before making changes.');
      const data = await readJSON(req);
      if (path === '/api/event-info') {
        if (typeof data.description !== 'string' || data.description.length > 10000) fail(400, 'Description must be under 10,000 characters.');
        const current = await store.get('event-info', { type: 'json' }) || { image: '' };
        const image = data.image == null ? current.image : `data:image/jpeg;base64,${(await normalizedImage(data.image)).toString('base64')}`;
        const next = { image, description: data.description };
        await store.setJSON('event-info', next); return json(next);
      }
      if (path === '/api/gallery/events') {
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 120 || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0,10) !== data.date) fail(400, 'Enter a title and valid date.');
        const id = randomBytes(16).toString('hex');
        await store.setJSON(`albums/${id}`, { id, title: data.title.trim(), date: data.date });
        return json(await gallery());
      }
      if (path.startsWith('/api/gallery/')) {
        const album = await albumBy(data.eventId);
        if (path === '/api/gallery/photos') {
          const image = await normalizedImage(data.image), id = randomBytes(16).toString('hex');
          await store.set(`images/${id}`, image);
          await store.setJSON(`photos/${album.id}/${id}`, { id, url: `/api/media/${album.id}/${id}`, created: Date.now() });
        } else if (path === '/api/gallery/delete-event') {
          // Tombstone first: concurrent photo uploads cannot resurrect a deleted album.
          await store.setJSON(`albums/${album.id}`, { ...album, deleted: true });
        } else if (path === '/api/gallery/delete-photo') {
          if (!idOK(data.photoId) || !await store.get(`photos/${album.id}/${data.photoId}`, { type: 'json' })) fail(404, 'Picture not found.');
          await store.delete(`photos/${album.id}/${data.photoId}`);
          await store.delete(`images/${data.photoId}`);
        } else fail(404, 'Not found.');
        return json(await gallery());
      }
      fail(404, 'Not found.');
    } catch (error) {
      if (!error.status) console.error('Eagles backend operation failed:', error.name);
      return json({ message: error.status ? error.message : 'Service temporarily unavailable. Please try again.' }, error.status || 503);
    }
  };
}
