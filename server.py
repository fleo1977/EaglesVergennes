"""Local admin server. Run with python3 server.py; production requires HTTPS hosting."""
from datetime import date
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
from urllib.parse import urlsplit, unquote, parse_qs

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
        if self.path in {'/api/gallery/events', '/api/gallery/photos', '/api/gallery/delete-event', '/api/gallery/delete-photo'}:
            return self.save_gallery()
        if self.path in {'/api/event-info', '/api/event-info/delete'}:
            return self.save_event()
        if urlsplit(self.path).path == '/api/logout':
            SESSIONS.pop(self.token(), None)
            destination = parse_qs(urlsplit(self.path).query).get('returnTo', ['/index.html'])[0]
            if destination not in {'/index.html', '/event-info.html', '/gallery.html'}:
                destination = '/index.html'
            return self.redirect(destination, 'eagles_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
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
            path = ROOT / 'data/event-info.json'
            previous = json.loads(path.read_text()) if path.exists() else {}
            events = previous.get('events', [])
            if 'events' not in previous and (previous.get('image') or previous.get('description')):
                events = [dict(previous, id='legacy', title='Upcoming Event')]
            event_id = data.get('id')
            current = next((e for e in events if e['id'] == event_id), None)
            if event_id and current is None:
                return self.reply(404, 'Event not found. Refresh the page.')
            if self.path.endswith('/delete'):
                if not current:
                    return self.reply(404, 'Event not found.')
                result = {'events': [e for e in events if e['id'] != event_id]}
                temporary = path.with_suffix('.tmp')
                temporary.write_text(json.dumps(result))
                temporary.replace(path)
                return self.reply(200, result)
            title = data.get('title', '')
            if not isinstance(title, str) or not title.strip() or len(title) > 120:
                raise ValueError()
            description = data['description']
            if not isinstance(description, str) or len(description) > 10000:
                raise ValueError()
            image_url = (current or {}).get('image', '')
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
            if not image_url:
                raise ValueError()
            event = {'id': event_id or secrets.token_hex(16), 'title': title.strip(), 'image': image_url, 'description': description}
            if current:
                events[events.index(current)] = event
            else:
                events.append(event)
            result = {'events': events}
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(result))
            temporary.replace(path)
        except (ValueError, KeyError, TypeError, AttributeError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            return self.reply(400, 'Use a valid JPG, PNG or WebP under 5 MB and a description under 10,000 characters.')
        return self.reply(200, result)

    def save_gallery(self):
        if SESSIONS.get(self.token(), 0) <= time.time():
            return self.reply(401, 'Please sign in again before making changes.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 7 * 1024 * 1024:
                return self.reply(413, 'Choose a picture smaller than 5 MB.')
            data = json.loads(self.rfile.read(length))
            path = ROOT / 'data/gallery.json'
            gallery = json.loads(path.read_text()) if path.exists() else {'events': []}
            if self.path in {'/api/gallery/delete-event', '/api/gallery/delete-photo'}:
                album = next((e for e in gallery['events'] if e['id'] == data['eventId']), None)
                if album is None:
                    return self.reply(404, 'Event not found. Refresh the gallery.')
                if self.path == '/api/gallery/delete-event':
                    removed = album
                    gallery['events'].remove(album)
                else:
                    photo = next((p for p in album['photos'] if p['id'] == data['photoId']), None)
                    if photo is None:
                        return self.reply(404, 'Picture not found. Refresh the gallery.')
                    removed = {'eventId': album['id'], 'photo': photo}
                    album['photos'].remove(photo)
                # Retain a private recovery record and original files; remove from public gallery.
                archive = ROOT / '.gallery-trash'
                archive.mkdir(exist_ok=True)
                (archive / (secrets.token_hex(16) + '.json')).write_text(json.dumps(removed))
            elif self.path == '/api/gallery/events':
                title = data['title'].strip()
                day = date.fromisoformat(data['date']).isoformat()
                if not title or len(title) > 120:
                    raise ValueError()
                album = {'id': secrets.token_hex(16), 'title': title, 'date': day, 'photos': []}
                gallery['events'].append(album)
            else:
                album = next((e for e in gallery['events'] if e['id'] == data['eventId']), None)
                if album is None:
                    return self.reply(404, 'Event not found. Refresh the gallery.')
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
                folder = ROOT / 'assets/gallery'
                folder.mkdir(exist_ok=True)
                name = secrets.token_hex(16) + '.jpg'
                (folder / name).write_bytes(output.getvalue())
                album['photos'].append({'id': name[:-4], 'url': 'assets/gallery/' + name})
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(gallery))
            temporary.replace(path)
        except (ValueError, KeyError, TypeError, AttributeError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            return self.reply(400, 'Check the title and date, or use a valid JPG, PNG or WebP picture under 5 MB.')
        return self.reply(200, gallery)

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
