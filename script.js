const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const suggestionForm = document.querySelector('.suggestion-form');
const formStatus = document.querySelector('.form-status');
const dropdownToggles = document.querySelectorAll('.dropdown-toggle');

menuToggle?.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

dropdownToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const item = toggle.closest('.has-dropdown');
    const isOpen = item.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
});

suggestionForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  suggestionForm.reset();
  formStatus.textContent = 'Thanks. Your suggestion has been noted for the next build step.';
});
