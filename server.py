"""Local admin server. Run with python3 server.py; production requires HTTPS hosting."""
import base64
import io
import warnings
from PIL import Image, ImageOps
import hashlib
import hmac
import json
import secrets
import time
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent
ACCOUNT = json.loads((ROOT / '.admin-account.json').read_text())
SESSIONS = {}
ATTEMPTS = {}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

    def token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return cookie['eagles_session'].value if 'eagles_session' in cookie else ''
        except Exception:
            return ''

    def redirect(self, location, cookie=None):
        self.send_response(303)
        self.send_header('Location', location)
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/admin':
            if SESSIONS.get(self.token(), 0) <= time.time():
                return self.redirect('/admin-login.html')
            return self.redirect('/event-info.html')
        if path == '/api/session':
            return self.reply(200, {'authenticated': SESSIONS.get(self.token(), 0) > time.time()})
        target = (ROOT / path.lstrip('/')).resolve()
        if target == ROOT:
            target = ROOT / 'index.html'
        # Serve only public site files, never credentials, source, or directory listings.
        if (not target.is_relative_to(ROOT) or any(p.startswith('.') for p in target.relative_to(ROOT).parts)
                or target.suffix.lower() not in {'.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.pdf'}
                or not target.is_file()):
            return self.send_error(404)
        if self.command == 'HEAD':
            super().do_HEAD()
        else:
            super().do_GET()

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.send_error(403)
        if self.path == '/api/event-info':
            return self.save_event()
        if self.path == '/api/logout':
            SESSIONS.pop(self.token(), None)
            return self.redirect('/admin-login.html', 'eagles_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
        if self.path != '/api/login':
            return self.send_error(404)
        now = time.time()
        key = self.client_address[0]
        attempts = [t for t in ATTEMPTS.get(key, []) if now - t < 300]
        ATTEMPTS[key] = attempts
        if len(attempts) >= 5:
            return self.reply(429, 'Too many attempts. Try again in five minutes.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            username, password = data['username'], data['password']
            if not isinstance(username, str) or not isinstance(password, str):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            return self.reply(400, 'Enter your username and password.')
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(ACCOUNT['salt']), 600000).hex()
        if not (hmac.compare_digest(digest, ACCOUNT['hash']) and hmac.compare_digest(username.encode(), ACCOUNT['username'].encode())):
            attempts.append(now)
            return self.reply(401, 'Incorrect username or password.')
        ATTEMPTS.pop(key, None)
        for token, expiry in list(SESSIONS.items()):
            if expiry <= now:
                SESSIONS.pop(token, None)
        SESSIONS.pop(self.token(), None)
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = now + 3600
        self.reply(200, 'Signed in.', f'eagles_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600')

    def save_event(self):
        if SESSIONS.get(self.token(), 0) <= time.time():
            return self.reply(401, 'Please sign in again to save changes.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 7 * 1024 * 1024:
                return self.reply(413, 'Choose an image smaller than 5 MB.')
            data = json.loads(self.rfile.read(length))
            description = data['description']
            if not isinstance(description, str) or len(description) > 10000:
                raise ValueError()
            path = ROOT / 'data/event-info.json'
            previous = json.loads(path.read_text()) if path.exists() else {}
            image_url = previous.get('image', '')
            if data.get('image') is not None:
                header, encoded = data['image'].split(',', 1)
                if header not in {'data:image/png;base64', 'data:image/jpeg;base64', 'data:image/webp;base64'}:
                    raise ValueError()
                raw = base64.b64decode(encoded, validate=True)
                if len(raw) > 5 * 1024 * 1024:
                    raise ValueError()
                with warnings.catch_warnings():
                    warnings.simplefilter('error', Image.DecompressionBombWarning)
                    with Image.open(io.BytesIO(raw)) as uploaded:
                        if uploaded.format not in {'PNG', 'JPEG', 'WEBP'} or uploaded.width * uploaded.height > 20000000:
                            raise ValueError()
                        image = ImageOps.exif_transpose(uploaded)
                        image.thumbnail((2400, 2400))
                        output = io.BytesIO()
                        image.convert('RGB').save(output, format='JPEG', quality=90)
                # Store only a decoded, re-encoded raster; discard filenames and metadata.
                image_url = 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()
            result = {'image': image_url, 'description': description}
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(result))
            temporary.replace(path)
        except (ValueError, KeyError, TypeError, AttributeError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            return self.reply(400, 'Use a valid JPG, PNG or WebP under 5 MB and a description under 10,000 characters.')
        return self.reply(200, result)

    def reply(self, status, message, cookie=None):
        body = json.dumps(message if isinstance(message, dict) else {'message': message}).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    print('Eagles running at http://localhost:8000', flush=True)
    HTTPServer(('127.0.0.1', 8000), Handler).serve_forever()
