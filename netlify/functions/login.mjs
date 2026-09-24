export { default } from '../../lib/netlify-handler.mjs';
export const config = { path: '/api/login', rateLimit: { windowLimit: 5, windowSize: 180, aggregateBy: ['ip', 'domain'] } };
