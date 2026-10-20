// @mention autocomplete for the composer textarea: a small listbox shown at the caret while the user
// types "@name". Candidates are people who have posted in the open chat (most recent first).
// Mentions are a convention only (DESIGN §10.2), so any name can still be typed by hand.

const TRIGGER_RE = /(?:^|[^\w@])@([a-z0-9_-]{0,31})$/i;
const MAX_ITEMS = 8;

// Styles copied onto the mirror div so its text wraps exactly like the textarea's.
const MIRROR_PROPS = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
  'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize',
];

// Caret position inside the textarea, in px relative to its top-left corner (before scrolling).
function caretOffset(textarea, index) {
  const mirror = document.createElement('div');
  const cs = getComputedStyle(textarea);
  for (const prop of MIRROR_PROPS) mirror.style[prop] = cs[prop];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const pos = { top: marker.offsetTop, left: marker.offsetLeft, height: parseFloat(cs.lineHeight) || marker.offsetHeight };
  mirror.remove();
  return pos;
}

export class MentionPicker {
  // getCandidates() -> string[] of author names, most relevant first
  constructor(textarea, getCandidates) {
    this.textarea = textarea;
    this.getCandidates = getCandidates;
    this.match = null;   // { start, query }
    this.items = [];
    this.active = 0;

    this.list = document.createElement('ul');
    this.list.id = 'mention-list';
    this.list.className = 'mention-picker';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Mention someone');
    this.list.hidden = true;
    document.body.appendChild(this.list);
    textarea.setAttribute('aria-controls', this.list.id);
    textarea.setAttribute('aria-autocomplete', 'list');

    // mousedown (not click) so the textarea keeps focus and the caret position.
    this.list.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const item = e.target.closest('[data-index]');
      if (item) this.select(Number(item.dataset.index));
    });
    textarea.addEventListener('input', () => this.update());
    textarea.addEventListener('click', () => this.update());
    textarea.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') this.update();
    });
    textarea.addEventListener('blur', () => this.close());
    textarea.addEventListener('scroll', () => this.position());
    window.addEventListener('resize', () => this.position());
  }

  get isOpen() {
    return !this.list.hidden;
  }

  // Called from the composer's keydown handler first. Returns true when the key was consumed.
  handleKey(e) {
    if (!this.isOpen) return false;
    if (e.key === 'Escape') {
      this.close();
      return true;
    }
    if (!this.items.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.active = (this.active + step + this.items.length) % this.items.length;
      this.renderActive();
      return true;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.isComposing) {
      this.select(this.active);
      return true;
    }
    return false;
  }

  update() {
    const ta = this.textarea;
    if (ta.readOnly || ta.selectionStart !== ta.selectionEnd) return this.close();
    const before = ta.value.slice(0, ta.selectionStart);
    const m = TRIGGER_RE.exec(before);
    if (!m) return this.close();
    const query = m[1].toLowerCase();
    this.match = { start: ta.selectionStart - query.length - 1, query };

    const names = this.getCandidates();
    const starts = names.filter((n) => n.startsWith(query));
    const contains = names.filter((n) => !n.startsWith(query) && n.includes(query));
    this.items = [...starts, ...contains].filter((n) => n !== query).slice(0, MAX_ITEMS);
    this.active = 0;
    this.render();
  }

  render() {
    this.list.replaceChildren();
    if (!this.items.length) {
      const hint = document.createElement('li');
      hint.className = 'mention-hint';
      hint.textContent = this.match.query
        ? `Mentioning @${this.match.query}`
        : 'Mention someone — type a name';
      this.list.appendChild(hint);
    }
    this.items.forEach((name, i) => {
      const li = document.createElement('li');
      li.id = `mention-opt-${i}`;
      li.className = 'mention-option';
      li.dataset.index = String(i);
      li.setAttribute('role', 'option');
      const at = document.createElement('span');
      at.className = 'mention-at';
      at.textContent = '@';
      li.append(at, document.createTextNode(name));
      this.list.appendChild(li);
    });
    this.list.hidden = false;
    this.textarea.setAttribute('aria-expanded', 'true');
    this.renderActive();
    this.position();
  }

  renderActive() {
    [...this.list.querySelectorAll('.mention-option')].forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === this.active));
    });
    if (this.items.length) this.textarea.setAttribute('aria-activedescendant', `mention-opt-${this.active}`);
    else this.textarea.removeAttribute('aria-activedescendant');
  }

  // Place the list just above the "@" (the composer sits at the bottom of the screen); flip below if
  // there's no room, and keep it inside the viewport horizontally.
  position() {
    if (!this.isOpen || !this.match) return;
    const ta = this.textarea;
    const rect = ta.getBoundingClientRect();
    const caret = caretOffset(ta, this.match.start);
    const caretTop = rect.top + caret.top - ta.scrollTop;
    const caretLeft = rect.left + caret.left - ta.scrollLeft;
    const listRect = this.list.getBoundingClientRect();
    const gap = 4;
    let top = caretTop - listRect.height - gap;
    if (top < 8) top = caretTop + caret.height + gap;
    const left = Math.max(8, Math.min(caretLeft, window.innerWidth - listRect.width - 8));
    this.list.style.top = `${Math.round(top)}px`;
    this.list.style.left = `${Math.round(left)}px`;
  }

  select(index) {
    const name = this.items[index];
    if (!name || !this.match) return;
    const ta = this.textarea;
    const end = ta.selectionStart;
    const after = ta.value.slice(end);
    const insert = `@${name}${after.startsWith(' ') ? '' : ' '}`;
    ta.setRangeText(insert, this.match.start, end, 'end');
    if (after.startsWith(' ')) ta.selectionStart = ta.selectionEnd = ta.selectionStart + 1;
    this.close();
    ta.dispatchEvent(new Event('input', { bubbles: true })); // autogrow + draft save
  }

  close() {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.match = null;
    this.items = [];
    this.textarea.setAttribute('aria-expanded', 'false');
    this.textarea.removeAttribute('aria-activedescendant');
  }
}
