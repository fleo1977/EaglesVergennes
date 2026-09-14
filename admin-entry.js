const adminEntry = document.querySelector('#admin-entry');
let adminClicks = 0;
let lastAdminClick = 0;

adminEntry?.addEventListener('click', () => {
  const now = Date.now();
  adminClicks = now - lastAdminClick > 3000 ? 1 : adminClicks + 1;
  lastAdminClick = now;
  if (adminClicks === 5) window.location.assign('admin-login.html');
});
