const list = document.querySelector('#event-list');
const editor = document.querySelector('#event-editor');
const form = document.querySelector('#event-form');
const status = document.querySelector('#event-status');
const cancel = document.querySelector('#cancel-edit');
let events = [], authenticated = false, editingId = null;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function resetEditor() {
  editingId = null; form.reset(); cancel.hidden = true;
  document.querySelector('#editor-title').textContent = 'Add an Event';
  form.querySelector('[type="submit"]').textContent = 'Add Event';
  form.elements.picture.required = true;
}
function render(data) {
  events = data.events || ((data.image || data.description) ? [{...data, id:'legacy', title:'Upcoming Event'}] : []);
  list.replaceChildren();
  for (const event of events) {
    const card = element('article', '', 'event-card');
    if (event.image) {
      const image = element('img', '', 'event-picture');
      image.src = event.image; image.alt = `${event.title} flyer`; card.append(image);
    }
    const details = element('div', '', 'event-details');
    details.append(element('h2', event.title), element('p', event.description, 'event-description'));
    if (authenticated) {
      const actions = element('div', '', 'event-actions');
      const edit = element('button', 'Edit Event', 'button primary'); edit.type = 'button';
      edit.addEventListener('click', () => {
        editingId = event.id; form.reset(); form.elements.title.value = event.title;
        form.elements.description.value = event.description; form.elements.picture.required = false;
        document.querySelector('#editor-title').textContent = 'Edit Event';
        form.querySelector('[type="submit"]').textContent = 'Save Event'; cancel.hidden = false;
        status.textContent = ''; editor.scrollIntoView({behavior:'smooth', block:'start'}); form.elements.title.focus({preventScroll:true});
      });
      const remove = element('button', 'Delete Event', 'button event-delete'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete “${event.title}” and its picture and description?`)) return;
        remove.disabled = true;
        try {
          const data = await post('/api/event-info/delete', {id:event.id});
          if (editingId === event.id) resetEditor();
          render(data); document.querySelector('#event-load-status').textContent = 'Event deleted.';
        } catch(error) { document.querySelector('#event-load-status').textContent = error.message; remove.disabled = false; }
      });
      actions.append(edit, remove); details.append(actions);
    }
    card.append(details); list.append(card);
  }
}
async function post(url, data) {
  const response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Unable to save.');
  return result;
}
async function load() {
  try {
    const response = await fetch('data/event-info.json', {cache:'no-store'});
    if (!response.ok) throw new Error();
    const data = await response.json(); render(data);
    try {
      const response = await fetch('/api/session', {cache:'no-store'});
      authenticated = response.ok && (await response.json()).authenticated === true;
    } catch { /* Public viewing does not need a session. */ }
    editor.hidden = !authenticated;
    document.querySelector('#event-sign-out-area').hidden = !authenticated;
    resetEditor(); render(data);
  } catch { document.querySelector('#event-load-status').textContent = 'Event information is temporarily unavailable.'; }
}
cancel.addEventListener('click', () => { resetEditor(); status.textContent = ''; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]'); button.disabled = true; cancel.disabled = true;
  status.textContent = 'Saving…';
  try {
    const file = form.elements.picture.files[0];
    const image = file ? await window.prepareUploadImage(file) : null;
    const data = await post('/api/event-info', {id:editingId, title:form.elements.title.value, description:form.elements.description.value, image});
    render(data); resetEditor(); status.textContent = 'Saved. Your event is now visible to visitors.';
  } catch(error) { status.textContent = error.message; }
  finally { button.disabled = false; cancel.disabled = false; }
});
load();
