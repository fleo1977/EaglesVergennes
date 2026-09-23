const loginForm = document.querySelector('#admin-login-form');
const loginStatus = document.querySelector('#login-status');
const signIn = document.querySelector('#sign-in');
const requestedPage = new URLSearchParams(window.location.search).get('returnTo');
const returnTo = ['index.html', 'event-info.html', 'gallery.html'].includes(requestedPage)
  ? requestedPage : 'event-info.html';
loginStatus.textContent = 'Enter your admin username and password.';
loginForm.querySelectorAll('[disabled]').forEach((field) => { field.disabled = false; });
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signIn.disabled = true;
  loginStatus.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      window.location.assign(returnTo);
      return;
    }
    loginStatus.textContent = result.message;
  } catch {
    loginStatus.textContent = 'Sign-in is unavailable. Please try again later.';
  } finally {
    loginForm.elements.password.value = '';
    signIn.disabled = false;
  }
});
