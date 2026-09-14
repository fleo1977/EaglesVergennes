const loginForm = document.querySelector('#admin-login-form');
const loginStatus = document.querySelector('#login-status');
const signIn = document.querySelector('#sign-in');
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
      window.location.assign('/event-info.html');
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
