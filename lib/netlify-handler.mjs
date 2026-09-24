import { getStore } from '@netlify/blobs';
import { createHandler } from './backend.mjs';
export default async function handler(request) {
  try {
    const account = JSON.parse(process.env.EAGLES_ADMIN_ACCOUNT || 'null');
    if (!account || !/^[a-f0-9]{64}$/.test(account.hash) || !/^[a-f0-9]{64}$/.test(account.salt) || typeof account.username !== 'string') throw new Error('Missing configuration');
    // Draft tests never write into production storage.
    const name = process.env.EAGLES_STORE;
    if (!name) throw new Error('Missing storage configuration');
    return await createHandler({ account, store: getStore({ name, consistency: 'strong' }) })(request);
  } catch { return Response.json({ message: 'Admin service is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
