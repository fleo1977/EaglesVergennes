const albums = document.querySelector('#gallery-albums');
const notice = document.querySelector('#gallery-status');
const create = document.querySelector('#gallery-create');
const viewer = document.querySelector('#photo-viewer');
const expandedAlbums = new Set();
const mobileGallery = window.matchMedia('(max-width: 720px)');
mobileGallery.addEventListener('change', () => render());
let authenticated = false;
let gallery = { events: [] };
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render() {
  albums.replaceChildren();
  for (const event of [...gallery.events].sort((a, b) => b.date.localeCompare(a.date))) {
    const card = element('section', '', 'gallery-album');
    card.append(element('h2', event.title));
    const day = element('time', new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    day.dateTime = event.date;
    card.append(day);
    const photos = element('div', '', 'gallery-photos');
    const expanded = expandedAlbums.has(event.id);
    const previewLimit = mobileGallery.matches ? 5 : 4;
    const previewPhotos = expanded ? event.photos : event.photos.slice(0, previewLimit);
    previewPhotos.forEach((photo, index) => {
      const button = element('button', '', 'gallery-photo');
      button.type = 'button';
      const img = element('img');
      img.src = photo.url; img.alt = `${event.title} — photo ${index + 1}`; img.loading = 'lazy';
      button.append(img);
      const remaining = event.photos.length - (previewLimit - 1);
      const showMore = !expanded && event.photos.length > previewLimit && index === previewLimit - 1;
      if (showMore) {
        button.append(element('span', `+${remaining}`, 'gallery-more'));
        button.setAttribute('aria-label', `View ${remaining} more pictures from ${event.title}`);
        button.setAttribute('aria-expanded', 'false');
      }
      button.addEventListener('click', () => {
        if (showMore) {
          expandedAlbums.add(event.id); render();
          document.getElementById(`collapse-${event.id}`)?.focus();
          return;
        }
        const full = document.querySelector('#full-photo'); full.src = photo.url; full.alt = img.alt; viewer.showModal();
      });
      const tile = element('div', '', 'gallery-tile');
      tile.append(button);
      if (authenticated && !showMore) {
        const remove = element('button', '×', 'gallery-remove-photo');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove picture ${index + 1} from ${event.title}`);
        remove.title = 'Remove picture';
        remove.addEventListener('click', () => removeItem(remove, '/api/gallery/delete-photo',
          { eventId: event.id, photoId: photo.id },
          `Remove picture ${index + 1} from “${event.title}”?`, 'Picture removed.'));
        tile.append(remove);
      }
      photos.append(tile);
    });
    card.append(photos);
    if (expanded && event.photos.length > previewLimit) {
      const collapse = element('button', 'Show fewer pictures', 'button gallery-collapse');
      collapse.type = 'button'; collapse.id = `collapse-${event.id}`;
      collapse.setAttribute('aria-expanded', 'true');
      collapse.addEventListener('click', () => {
        expandedAlbums.delete(event.id); render();
        document.getElementById(`album-${event.id}`)?.querySelector('[aria-expanded]')?.focus();
      });
      card.append(collapse);
    }
    card.id = `album-${event.id}`;
    if (!event.photos.length) card.append(element('p', 'No pictures added yet.'));
    if (authenticated) {
      const form = element('form', '', 'gallery-upload');
      const label = element('label', 'Add pictures to this event');
      const input = element('input'); input.type = 'file'; input.multiple = true; input.required = true; input.accept = 'image/jpeg,image/png,image/webp';
      label.append(input);
      const button = element('button', 'Upload Pictures', 'button'); button.type = 'submit';
      const status = element('p'); status.setAttribute('role', 'status');
      form.append(label, element('small', 'JPG, PNG or WebP. Maximum 5 MB per picture.'), button, status);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); button.disabled = true;
        let uploaded = 0;
        const files = [...input.files];
        try {
          if (files.some(file => file.size > 5 * 1024 * 1024)) throw new Error('Each picture must be under 5 MB.');
          for (const file of files) {
            status.textContent = `Uploading ${uploaded + 1} of ${files.length}…`;
            const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read picture.')); reader.readAsDataURL(file); });
            gallery = await post('/api/gallery/photos', { eventId: event.id, image }); uploaded++;
          }
          notice.textContent = `${uploaded} picture${uploaded === 1 ? '' : 's'} added to ${event.title}.`;
          render();
        } catch (error) {
          // Keep successful uploads visible; do not resend them on a retry.
          if (uploaded) { render(); notice.textContent = `${uploaded} pictures saved. ${error.message} Select only the remaining pictures to retry.`; }
          else status.textContent = error.message;
        } finally { button.disabled = false; }
      });
      card.append(form);
      const deleteEvent = element('button', 'Delete Event', 'button gallery-remove');
      deleteEvent.type = 'button';
      deleteEvent.addEventListener('click', () => removeItem(deleteEvent, '/api/gallery/delete-event',
        { eventId: event.id },
        `Delete “${event.title}” (${event.date}) and remove all ${event.photos.length} pictures from the gallery?`, 'Event deleted.'));
      card.append(deleteEvent);
    }
    albums.append(card);
  }
}
async function removeItem(button, url, data, confirmation, success) {
  if (!window.confirm(confirmation)) return;
  button.disabled = true;
  try {
    gallery = await post(url, data);
    if (url.endsWith('delete-event')) expandedAlbums.delete(data.eventId);
    render();
    notice.textContent = success;
    notice.tabIndex = -1;
    notice.focus();
  } catch (error) { notice.textContent = error.message; }
  finally { button.disabled = false; }
}
async function post(url, data) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Unable to save.');
  return result;
}
create.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = create.querySelector('button'); button.disabled = true;
  try {
    gallery = await post('/api/gallery/events', { title: create.elements.title.value, date: create.elements.date.value });
    create.reset(); render(); notice.textContent = 'Event created. Add pictures to it below.';
  } catch (error) { notice.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#close-photo').addEventListener('click', () => viewer.close());
async function loadGallery() {
  try {
    const response = await fetch('data/gallery.json', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    gallery = await response.json();
    notice.textContent = '';
    render();
  } catch { notice.textContent = 'The gallery is temporarily unavailable. Please try again later.'; return; }
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    authenticated = response.ok && (await response.json()).authenticated === true;
    document.querySelector('#gallery-admin').hidden = !authenticated;
    document.querySelector('#gallery-sign-out').hidden = !authenticated;
    render();
  } catch { /* Static hosting offers public viewing only. */ }
}
loadGallery();
