document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-service-quote-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const button = form.querySelector('button');
      if (button) {
        button.textContent = "Quote Sent! We'll call you soon.";
        button.classList.add('quote-sent');
      }

      form.querySelectorAll('input, select').forEach((field) => {
        field.disabled = true;
      });
    });
  });
});
