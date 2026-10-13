// Message composer: auto-growing textarea, Enter to send, Shift+Enter for newline.

export function setupComposer({ form, input, sendButton, stopButton, onSubmit, onStop }) {
  const resize = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, window.innerHeight * 0.4)}px`;
  };

  let busy = false;
  const updateButtons = () => {
    sendButton.disabled = busy || input.value.trim() === '';
    sendButton.classList.toggle('hidden', busy);
    stopButton.classList.toggle('hidden', !busy);
  };

  const submit = () => {
    const text = input.value;
    if (busy || !text.trim()) return;
    if (onSubmit(text) === false) return;
    input.value = '';
    resize();
    updateButtons();
  };

  input.addEventListener('input', () => {
    resize();
    updateButtons();
  });

  input.addEventListener('keydown', (event) => {
    // Respect IME composition (e.g. Japanese/Chinese input) before submitting.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape' && busy) {
      event.preventDefault();
      onStop();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  stopButton.addEventListener('click', () => {
    onStop();
    input.focus();
  });

  updateButtons();

  return {
    setBusy(value) {
      const hadFocus = document.activeElement === stopButton;
      busy = value;
      updateButtons();
      // Keep keyboard focus on the control that replaced the one that disappeared.
      if (!busy && hadFocus) input.focus();
    },
    setValue(text) {
      input.value = text;
      resize();
      updateButtons();
    },
    focus() {
      input.focus({ preventScroll: true });
    },
  };
}
