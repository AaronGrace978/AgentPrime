const statusMessage = document.getElementById('status-message');
const primaryCta = document.getElementById('primary-cta');
const secondaryCta = document.getElementById('secondary-cta');

function setStatus(message) {
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

primaryCta?.addEventListener('click', () => {
  setStatus('Launch sequence confirmed.');
});

secondaryCta?.addEventListener('click', () => {
  setStatus('Preview mode is ready.');
});
