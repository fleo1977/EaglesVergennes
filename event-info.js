const display = document.querySelector('#event-display');
const picture = document.querySelector('#event-picture');
const description = document.querySelector('#event-description');
const editor = document.querySelector('#event-editor');
const form = document.querySelector('#event-form');
const status = document.querySelector('#event-status');
let saved = { image: '', description: '' };
function render(data) {
  saved = data;
  display.hidden = !data.image && !data.description;
  picture.hidden = !data.image;
  if (data.image) picture.src = data.image;
  description.textContent = data.description || '';
}
async function load() {
  try {
    const response = await fetch('data/event-info.json', { cache: 'no-store' });
    if (response.ok) render(await response.json());
    else if (response.status !== 404) throw new Error();
  } catch { document.querySelector('#event-load-status').textContent = 'Event information is temporarily unavailable.'; }
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (response.ok && (await response.json()).authenticated) {
      editor.hidden = false;
      document.querySelector('#event-sign-out-area').hidden = false;
      form.elements.description.value = saved.description || '';
    }
  } catch { /* Public visitors do not need an admin session. */ }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Saving…';
  try {
    const file = form.elements.picture.files[0];
    if (file && file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
    const image = file ? await window.prepareUploadImage(file) : null;
    const response = await fetch('/api/event-info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, description: form.elements.description.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to save.');
    render(result);
    form.elements.picture.value = '';
    status.textContent = 'Saved. Your event information is now visible to visitors.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
load();
