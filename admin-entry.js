const adminEntry = document.querySelector('#admin-entry');
let adminClicks = 0;
let lastAdminClick = 0;

adminEntry?.addEventListener('click', () => {
  const now = Date.now();
  adminClicks = now - lastAdminClick > 3000 ? 1 : adminClicks + 1;
  lastAdminClick = now;
  if (adminClicks === 5) {
    const slug = window.location.pathname.replace(/\/$/, '').split('/').pop() || 'index';
    const page = slug.endsWith('.html') ? slug : `${slug}.html`;
    const returnTo = ['index.html', 'event-info.html', 'gallery.html'].includes(page) ? page : 'index.html';
    window.location.assign(`admin-login.html?returnTo=${encodeURIComponent(returnTo)}`);
  }
});
