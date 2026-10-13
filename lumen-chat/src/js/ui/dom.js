// Small DOM helpers, icons, clipboard and toasts.

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
  'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  spark: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" fill="currentColor" stroke="none"/>',
  'spark-lg': '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" fill="currentColor" stroke="none"/>',
};

/** Returns an inline SVG string for a built-in (trusted) icon. */
export function iconSvg(name, size = name === 'spark-lg' ? 24 : name === 'spark' ? 16 : 18) {
  const paths = ICONS[name] ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** Fills every `[data-icon]` placeholder under `root`. */
export function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    node.innerHTML = iconSvg(node.dataset.icon);
  }
}

/** Tiny element factory: el('button', { class: 'x', onclick }, child1, 'text'). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // only used with trusted/sanitized markup
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure contexts or denied permissions.
    const area = el('textarea', { class: 'fixed -left-[9999px]', 'aria-hidden': 'true' });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Creates a copy button that briefly shows a checkmark after copying. */
export function createCopyButton(getText, label = 'Copy', { showLabel = true } = {}) {
  const text = el('span', { class: showLabel ? 'text-xs' : 'sr-only', text: showLabel ? 'Copy' : label });
  const icon = el('span', { html: iconSvg('copy', 14) });
  const button = el(
    'button',
    {
      type: 'button',
      class: 'icon-btn-sm',
      'aria-label': label,
      title: label,
      onclick: async () => {
        const ok = await copyText(getText());
        if (!ok) return toast('Could not copy to clipboard.', 'error');
        icon.innerHTML = iconSvg('check', 14);
        if (showLabel) text.textContent = 'Copied';
        button.setAttribute('aria-label', 'Copied');
        setTimeout(() => {
          icon.innerHTML = iconSvg('copy', 14);
          if (showLabel) text.textContent = 'Copy';
          button.setAttribute('aria-label', label);
        }, 1600);
      },
    },
    icon,
    text,
  );
  return button;
}

export function toast(message, variant = 'info', duration = 3500) {
  const container = document.getElementById('toasts');
  if (!container) return;
  const node = el('div', { class: 'toast', dataset: { variant }, text: message });
  container.append(node);
  setTimeout(() => node.remove(), duration);
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatTime(timestamp) {
  const date = new Date(timestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? timeFormatter.format(date) : dateTimeFormatter.format(date);
}
