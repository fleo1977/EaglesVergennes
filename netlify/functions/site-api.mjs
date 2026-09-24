export { default } from '../../lib/netlify-handler.mjs';
export const config = { path: ['/api/session', '/api/logout', '/api/event-info', '/api/event-info/delete', '/api/gallery/*', '/api/media/*', '/data/event-info.json', '/data/gallery.json'], rateLimit: { windowLimit: 180, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
