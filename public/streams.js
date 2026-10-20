// EventSource management (DESIGN §12). Native EventSource reconnects by itself and resends
// Last-Event-ID; we only step in when it gives up (readyState CLOSED, e.g. a 404/500/502 response).

const RETRY_CLOSED_MS = 5000;
const OFFLINE_AFTER_MS = 10_000; // still not open after this long -> report offline

// status: 'connecting' | 'open' | 'reconnecting' | 'offline' | 'closed'
export class ManagedStream {
  constructor({ getUrl, events = {}, onOpen, onStatus, beforeRecreate }) {
    this.getUrl = getUrl;
    this.events = events;
    this.onOpen = onOpen;
    this.onStatus = onStatus;
    this.beforeRecreate = beforeRecreate;
    this.es = null;
    this.status = 'closed';
    this.stopped = true;
    this.retryTimer = null;
    this.offlineTimer = null;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    this.onStatus?.(status);
  }

  armOfflineTimer() {
    if (this.offlineTimer) return;
    this.offlineTimer = setTimeout(() => {
      this.offlineTimer = null;
      if (!this.stopped && this.status !== 'open') this.setStatus('offline');
    }, OFFLINE_AFTER_MS);
  }

  clearOfflineTimer() {
    clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
  }

  connect() {
    if (this.stopped) return;
    let es;
    try {
      es = new EventSource(this.getUrl().href);
    } catch (err) {
      console.warn('EventSource failed to start', err);
      this.setStatus('offline');
      this.scheduleRecreate();
      return;
    }
    this.es = es;
    if (this.status !== 'offline') this.setStatus(this.status === 'closed' ? 'connecting' : 'reconnecting');
    this.armOfflineTimer();

    es.addEventListener('open', () => {
      if (this.es !== es) return;
      this.clearOfflineTimer();
      this.setStatus('open');
      this.onOpen?.();
    });
    es.addEventListener('error', () => {
      if (this.es !== es) return;
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        this.es = null;
        this.clearOfflineTimer();
        this.setStatus('offline');
        this.scheduleRecreate();
      } else {
        if (this.status !== 'offline') this.setStatus('reconnecting');
        this.armOfflineTimer();
      }
    });
    for (const [name, handler] of Object.entries(this.events)) {
      es.addEventListener(name, (event) => {
        if (this.es !== es) return;
        try {
          handler(event);
        } catch (err) {
          console.warn(`SSE "${name}" handler failed`, err);
        }
      });
    }
  }

  scheduleRecreate() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(async () => {
      if (this.stopped) return;
      if (this.beforeRecreate) {
        let proceed = true;
        try {
          proceed = await this.beforeRecreate();
        } catch {
          proceed = true;
        }
        if (this.stopped) return;
        if (!proceed) {
          this.stop();
          return;
        }
      }
      this.connect();
    }, RETRY_CLOSED_MS);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.clearOfflineTimer();
    if (this.es) this.es.close();
    this.es = null;
    this.setStatus('closed');
  }
}
