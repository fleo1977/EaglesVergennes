# Publishing

Netlify hosts the live site. GitHub Pages is a static preview and cannot run admin login or save uploads.

Run `pnpm install`, `pnpm test`, then `netlify deploy --build --context deploy-preview` to verify a draft. Publish with `netlify deploy --prod --build --context production` only when ready. Automatic Netlify builds are deliberately stopped; GitHub pushes should not publish production.

The build publishes only `dist/`. Never upload the repository root as a static directory: local account and recovery files are private.

Netlify environment variables:
- `EAGLES_ADMIN_ACCOUNT`: private JSON account record with username, hex salt and PBKDF2-SHA256 hash (600,000 iterations, 32 bytes). Configure through Netlify; never commit it.
- `EAGLES_STORE`: `eagles-production` in production and `eagles-preview` for deploy previews. Keep these separate so testing does not change live content.

The free plan uses the default environment scopes. Functions check credentials and session cookies on the server. Login attempts are rate limited. Event content, albums, photos and sessions persist in Netlify Blobs independently of deployments. Changing the account hash invalidates existing sessions.

For local editing, the existing Python server uses `.admin-account.json` and local JSON files. Local data does not synchronize with Netlify Blobs. Production begins with empty Event Info and Gallery.
