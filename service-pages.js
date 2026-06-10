document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-service-quote-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const button = form.querySelector('button[type="submit"]');
      const originalText = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = 'Sending…';
      }

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error('Submission failed');
          }
          window.location.assign('/thank-you');
        })
        .catch(() => {
          // Fall back to a native POST so the lead still reaches Formspree.
          if (button) {
            button.disabled = false;
            button.textContent = originalText;
          }
          form.submit();
        });
    });
  });
});
