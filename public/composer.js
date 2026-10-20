// Composer: textarea, drafts, attachments (picker / drag-drop / paste), send with upload progress
// (DESIGN §15). Client checks only give fast feedback; the server validates authoritatively.

import * as api from './api.js';
import * as config from './config.js';
import { formatSize, icon } from './render.js';
import { MentionPicker } from './mentions.js';

const DRAFT_DEBOUNCE_MS = 400;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function testRe(re, value) {
  return new RegExp(re.source, re.flags.replace('g', '').replace('y', '')).test(value);
}

function formatMb(bytes) {
  const mb = bytes / (1024 * 1024);
  return (Math.round(mb * 10) / 10).toString();
}

function pastedName(file, C) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let ext = '.png';
  if (file.type && file.type !== 'image/png') {
    const match = Object.entries(C.EXT_MIME ?? {}).find(([, mime]) => mime === file.type);
    if (match) ext = match[0];
  }
  return `pasted-${stamp}${ext}`;
}

export class Composer {
  // els: { form, textarea, sendBtn, attachBtn, fileInput, attachments, progress, progressBar,
  //        progressLabel, cancelBtn, error, dropZone, dropOverlay }
  // getCtx() -> { C, limits, author }; getParticipants() -> names for @mention suggestions
  constructor({ els, getCtx, getParticipants, onSent, onNeedAuthor, onRetest }) {
    this.els = els;
    this.getCtx = getCtx;
    this.onSent = onSent;
    this.onNeedAuthor = onNeedAuthor;
    this.onRetest = onRetest;
    this.chatId = null;
    this.attachments = []; // { file, url|null, node }
    this.sending = null;   // { abort }
    this.draftTimer = null;
    this.dragDepth = 0;
    this.mentions = new MentionPicker(els.textarea, getParticipants ?? (() => []));
    this.bind();
  }

  bind() {
    const { form, textarea, attachBtn, fileInput, cancelBtn, dropZone } = this.els;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });
    textarea.addEventListener('keydown', (e) => {
      if (this.mentions.handleKey(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        this.send();
      }
    });
    textarea.addEventListener('input', () => {
      this.autoGrow();
      this.scheduleDraft();
    });
    textarea.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      const { C } = this.getCtx();
      this.addFiles(files.map((f) => (f.name ? f : new File([f], pastedName(f, C), { type: f.type }))));
      const text = e.clipboardData.getData('text/plain');
      if (text) document.execCommand('insertText', false, text);
    });
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      this.addFiles([...fileInput.files]);
      fileInput.value = '';
    });
    cancelBtn.addEventListener('click', () => this.sending?.abort());
    window.addEventListener('resize', () => this.autoGrow());

    const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    dropZone.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e) || !this.chatId) return;
      e.preventDefault();
      this.dragDepth += 1;
      this.els.dropOverlay.hidden = false;
    });
    dropZone.addEventListener('dragover', (e) => {
      if (!isFileDrag(e) || !this.chatId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = this.sending ? 'none' : 'copy';
    });
    dropZone.addEventListener('dragleave', (e) => {
      if (!isFileDrag(e)) return;
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) this.els.dropOverlay.hidden = true;
    });
    dropZone.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      this.dragDepth = 0;
      this.els.dropOverlay.hidden = true;
      if (!this.sending && this.chatId) this.addFiles([...e.dataTransfer.files]);
    });
  }

  // Switching chats: flush the old draft, cancel any upload, load the new draft.
  setChat(chatId) {
    if (this.chatId) this.saveDraftNow();
    this.sending?.abort();
    this.clearAttachments();
    this.showError(null);
    this.mentions.close();
    this.chatId = chatId;
    this.els.textarea.value = chatId ? config.getDraft(chatId) : '';
    this.autoGrow();
  }

  focus() {
    if (!this.sending) this.els.textarea.focus();
  }

  autoGrow() {
    const ta = this.els.textarea;
    ta.style.height = 'auto';
    const max = Math.round(window.innerHeight * 0.4);
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }

  scheduleDraft() {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.saveDraftNow(), DRAFT_DEBOUNCE_MS);
  }

  saveDraftNow() {
    clearTimeout(this.draftTimer);
    if (this.chatId) config.setDraft(this.chatId, this.els.textarea.value);
  }

  addFiles(files) {
    if (this.sending || !files.length) return;
    const { limits } = this.getCtx();
    const maxCount = limits.MAX_ASSETS_PER_MESSAGE;
    const maxBytes = limits.MAX_ASSET_BYTES;
    const rejected = [];
    for (const file of files) {
      if (file.size > maxBytes) {
        rejected.push(`${file.name} is ${formatSize(file.size)}; the limit is ${formatSize(maxBytes)} per file.`);
        continue;
      }
      if (this.attachments.length >= maxCount) {
        rejected.push(`${file.name} not added: at most ${maxCount} files per message.`);
        continue;
      }
      this.attachments.push(this.makeChip(file));
    }
    this.renderAttachments();
    this.showError(rejected.length ? rejected.join(' ') : null);
  }

  makeChip(file) {
    const entry = { file, url: null, node: null };
    const chip = el('div', 'pending-chip');
    if (file.type.startsWith('image/')) {
      entry.url = URL.createObjectURL(file);
      const img = el('img', 'pending-thumb');
      img.alt = '';
      img.src = entry.url;
      img.addEventListener('error', () => img.replaceWith(icon('file')));
      chip.append(img);
    } else {
      chip.append(icon('file'));
    }
    const info = el('span', 'pending-info');
    info.append(el('span', 'pending-name', file.name), el('span', 'pending-size', formatSize(file.size)));
    chip.append(info);
    const remove = el('button', 'pending-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => this.removeAttachment(entry));
    chip.append(remove);
    entry.node = chip;
    return entry;
  }

  removeAttachment(entry) {
    if (this.sending) return;
    if (entry.url) URL.revokeObjectURL(entry.url);
    this.attachments = this.attachments.filter((a) => a !== entry);
    this.renderAttachments();
    this.showError(null);
  }

  clearAttachments() {
    for (const a of this.attachments) if (a.url) URL.revokeObjectURL(a.url);
    this.attachments = [];
    this.renderAttachments();
  }

  renderAttachments() {
    this.els.attachments.replaceChildren(...this.attachments.map((a) => a.node));
    this.els.attachments.hidden = this.attachments.length === 0;
  }

  showError(message, { retest = false } = {}) {
    const box = this.els.error;
    box.replaceChildren();
    if (!message) {
      box.hidden = true;
      return;
    }
    box.append(document.createTextNode(message));
    if (retest) {
      box.append(document.createTextNode(' '));
      const link = el('button', 'link-btn', 'Re-test connection');
      link.type = 'button';
      link.addEventListener('click', () => this.onRetest?.());
      box.append(link);
    }
    box.hidden = false;
  }

  setLocked(locked) {
    const { textarea, sendBtn, attachBtn, attachments } = this.els;
    textarea.readOnly = locked;
    sendBtn.disabled = locked;
    attachBtn.disabled = locked;
    attachments.classList.toggle('locked', locked);
    for (const btn of attachments.querySelectorAll('button')) btn.disabled = locked;
  }

  validate(text, files) {
    const { C, limits } = this.getCtx();
    if (!text.trim() && files.length === 0) return 'Type a message or attach a file.';
    if (text.length > limits.MAX_TEXT_CHARS) {
      return `Message is too long: ${text.length.toLocaleString()} characters (limit ${limits.MAX_TEXT_CHARS.toLocaleString()}).`;
    }
    if (testRe(C.FORBIDDEN_CTRL_RE, text)) return 'Message contains control characters that are not allowed.';
    const placeholders = C.findPlaceholders(text);
    const tooHigh = placeholders.find((n) => n > files.length);
    if (tooHigh) {
      return `asset:$${tooHigh} refers to attachment ${tooHigh}, but ${files.length} file(s) are attached.`;
    }
    if (files.length > limits.MAX_ASSETS_PER_MESSAGE) return `At most ${limits.MAX_ASSETS_PER_MESSAGE} files per message.`;
    const big = files.find((f) => f.size > limits.MAX_ASSET_BYTES);
    if (big) return `${big.name} is larger than ${formatSize(limits.MAX_ASSET_BYTES)}.`;
    return null;
  }

  async send() {
    if (this.sending || !this.chatId) return;
    const { C, author } = this.getCtx();
    if (!author) {
      this.onNeedAuthor?.();
      return;
    }
    const chatId = this.chatId;
    const text = C.normalizeNewlines(this.els.textarea.value);
    const files = this.attachments.map((a) => a.file);
    const problem = this.validate(text, files);
    if (problem) {
      this.showError(problem);
      return;
    }
    this.showError(null);
    this.setLocked(true);
    const path = api.chatPath(chatId, '/messages');
    let cancelled = false;
    try {
      let body;
      if (files.length === 0) {
        const controller = new AbortController();
        this.sending = { abort: () => controller.abort() };
        body = await api.post(path, { author, text }, { signal: controller.signal });
      } else {
        const form = new FormData();
        form.append('author', author);
        form.append('text', text);
        for (const file of files) form.append('files', file, file.name);
        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
        this.showProgress(0, totalBytes, files.length);
        const upload = api.uploadMultipart(path, form, {
          onProgress: (loaded, total) => this.showProgress(loaded, total ?? totalBytes, files.length),
        });
        this.sending = { abort: () => upload.abort() };
        body = await upload.promise;
      }
      if (this.chatId !== chatId) return;
      this.mentions.close();
      this.els.textarea.value = '';
      config.clearDraft(chatId);
      this.clearAttachments();
      this.autoGrow();
      if (body?.message) this.onSent?.(body.message);
    } catch (err) {
      cancelled = err?.code === 'aborted';
      if (this.chatId !== chatId) return;
      if (cancelled) this.showError('Upload cancelled. Your message and attachments are still here.');
      else if (err?.code === 'network_error') {
        this.showError(`${err.message}. Your message was not sent.`, { retest: true });
      } else this.showError(err?.message ?? 'Sending failed.');
    } finally {
      this.sending = null;
      this.hideProgress();
      this.setLocked(false);
      if (this.chatId === chatId && !cancelled) this.focus();
    }
  }

  showProgress(loaded, total, count) {
    const { progress, progressBar, progressLabel } = this.els;
    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    progress.hidden = false;
    progressBar.value = pct;
    progressLabel.textContent = `${pct}% · Uploading ${count} file${count === 1 ? '' : 's'}, ${formatMb(loaded)} / ${formatMb(total)} MB`;
  }

  hideProgress() {
    this.els.progress.hidden = true;
    this.els.progressBar.value = 0;
    this.els.progressLabel.textContent = '';
  }
}
