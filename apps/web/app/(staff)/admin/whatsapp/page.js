'use client';

import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  MessageSquareDashed,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../../../components/Toast.js';
import { EmptyState } from '../../../../components/ui.js';
import { useUser } from '../../../../components/UserContext.js';
import { api, chatPath, errorText } from '../../../../lib/client-api.js';
import { formatFull } from '../../../../lib/format.js';
import { usePolling } from '../../../../lib/use-polling.js';

// I3 demo: connect a WhatsApp number through Meta Embedded Signup (v4). The Facebook SDK is
// loaded on this page only. The browser gets an exchangeable code and the WABA / number IDs;
// everything else (token exchange, webhook subscription, registration) runs on the server.

const SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
const STEP_LABELS = {
  signup: 'Facebook signup (business, WhatsApp account, number)',
  exchanged: 'Business token issued',
  verified: 'WhatsApp account and number checked',
  subscribed: 'Webhooks subscribed',
  registered: 'Number registered for the Cloud API',
  live: 'Vartalap is using the number',
};
const SOURCE_LABELS = {
  embedded_signup: ['Connected via signup', 'success'],
  manual: ['Manual set-up (SSM)', 'info'],
  none: ['Not connected', 'warn'],
};
// The session info event usually arrives just before the login callback; wait this long for it.
const SESSION_INFO_WAIT_MS = 2000;
const FIRST_MESSAGE_POLL_MS = 4000;

function useFacebookSdk(config) {
  const [sdk, setSdk] = useState('idle'); // idle | loading | ready | failed
  const { ready, appId, graphVersion } = config ?? {};

  useEffect(() => {
    if (!ready) return;
    if (window.FB) {
      setSdk('ready');
      return;
    }
    setSdk('loading');
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      setSdk('ready');
    };
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => setSdk('failed');
    document.body.appendChild(script);
  }, [ready, appId, graphVersion]);

  return sdk;
}

// Embedded Signup posts WA_EMBEDDED_SIGNUP events from facebook.com to this window.
function useSignupEvents(onEvent) {
  const saved = useRef(onEvent);
  useEffect(() => {
    saved.current = onEvent;
  });
  useEffect(() => {
    const listener = (event) => {
      let host;
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type === 'WA_EMBEDDED_SIGNUP') saved.current(data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// signup runs in Meta's popup; the rest are the server's steps (lib/wa-onboarding.js).
function StepList({ connection, phase }) {
  const steps = Object.keys(STEP_LABELS);
  let done = -1;
  let active = -1;
  let failed = -1;
  if (phase === 'signup') {
    active = 0;
  } else if (phase === 'connecting') {
    done = 0;
    active = 1;
  } else if (connection) {
    done = steps.indexOf(connection.step);
    if (phase === 'retrying') active = done + 1;
    else if (connection.lastError) failed = steps.indexOf(connection.lastError.step);
  }
  return (
    <ol className="wa-steps">
      {steps.map((step, i) => {
        const state =
          i <= done ? 'done' : i === failed ? 'failed' : i === active ? 'active' : 'todo';
        return (
          <li key={step} className={`wa-step ${state}`}>
            <span className="wa-step-icon" aria-hidden="true">
              {state === 'done' && <CircleCheck size={16} />}
              {state === 'failed' && <CircleAlert size={16} />}
              {state === 'active' && <LoaderCircle size={16} className="spin" />}
              {state === 'todo' && <span className="wa-step-dot" />}
            </span>
            <span>{STEP_LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="wa-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function NumberCard({ status, onRefresh, onDisconnect, busy }) {
  const { active, connection, canRestorePrevious } = status;
  const [label, tone] = SOURCE_LABELS[active.source];
  const n = active.number;
  return (
    <section className="card" aria-labelledby="wa-number">
      <h2 className="section-title" id="wa-number">
        <Smartphone size={18} aria-hidden="true" />
        Number in use
        <span className={`badge ${tone}`}>{label}</span>
      </h2>

      {active.source === 'none' && (
        <p className="muted small">
          No WhatsApp number is set. Connect one below; the webhook and sender pick it up within
          seconds.
        </p>
      )}
      {active.numberError && (
        <p className="alert danger" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {active.numberError}
        </p>
      )}
      {n && (
        <dl className="wa-fields">
          <Field label="Number">{n.displayPhoneNumber}</Field>
          <Field label="Display name">{n.verifiedName}</Field>
          <Field label="Name status">{n.nameStatus}</Field>
          <Field label="Quality">{n.qualityRating}</Field>
          <Field label="Messaging limit">{n.whatsappBusinessManagerMessagingLimit}</Field>
          <Field label="Platform">{n.platformType}</Field>
          <Field label="Status">{n.status}</Field>
          <Field label="Phone number ID">{active.phoneNumberId}</Field>
          {active.source === 'embedded_signup' && (
            <>
              <Field label="WhatsApp Business Account">{connection.wabaId}</Field>
              <Field label="Connected">{formatFull(connection.connectedAt)}</Field>
            </>
          )}
        </dl>
      )}

      <div className="wa-actions">
        <button type="button" className="button ghost" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
        {connection && (
          <button type="button" className="button ghost" onClick={onDisconnect} disabled={busy}>
            <Unplug size={16} aria-hidden="true" />
            {connection.status === 'connected' ? 'Disconnect' : 'Discard attempt'}
          </button>
        )}
      </div>
      {connection?.status === 'connected' && (
        <p className="field-hint">
          {canRestorePrevious
            ? 'Disconnecting restores the manually configured number.'
            : 'Disconnecting leaves no number set until you connect one again.'}
        </p>
      )}
    </section>
  );
}

function FirstMessage({ connection, number }) {
  const [chat, setChat] = useState(null);
  usePolling(
    async () => {
      if (chat) return;
      try {
        const { chats } = await api.listChats('all');
        const since = Date.parse(connection.connectedAt);
        setChat(chats.find((c) => Date.parse(c.lastMessageAt) >= since) ?? null);
      } catch {
        // Keep polling; a transient error is not worth showing here.
      }
    },
    FIRST_MESSAGE_POLL_MS,
    [connection.connectedAt, chat],
  );

  const digits = String(number?.displayPhoneNumber ?? '').replace(/\D/g, '');
  return (
    <section className="card" aria-labelledby="wa-test">
      <h2 className="section-title" id="wa-test">
        <MessageSquareDashed size={18} aria-hidden="true" />
        Try it end to end
      </h2>
      {!chat ? (
        <>
          <p>
            From your own phone, send <strong>Hi</strong> to{' '}
            <strong>{number?.displayPhoneNumber ?? 'the new number'}</strong>. It appears in{' '}
            <em>Unassigned</em>, and you can reply from Vartalap.
          </p>
          <div className="wa-actions">
            {digits && (
              <a
                className="button primary"
                href={`https://wa.me/${digits}?text=${encodeURIComponent('Hi')}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Open WhatsApp
              </a>
            )}
            <span className="muted small wa-waiting">
              <LoaderCircle size={14} className="spin" aria-hidden="true" />
              Waiting for the first message…
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="alert success" role="status">
            <CircleCheck size={16} aria-hidden="true" />
            Message received from {chat.displayName}: “{chat.lastMessagePreview}”
          </p>
          <div className="wa-actions">
            <Link className="button primary" href={chatPath(chat.id)}>
              Open the chat
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

export default function WhatsAppSettingsPage() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | signup | connecting | retrying
  const [error, setError] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(null);
  const sdk = useFacebookSdk(status?.config);

  const load = useCallback(async () => {
    try {
      setStatus(await api.waOnboardingStatus());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);

  const newState = useCallback(async () => {
    try {
      setState((await api.waOnboardingStart()).state);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    newState();
  }, [isAdmin, load, newState]);

  useSignupEvents((data) => {
    if (String(data.event).startsWith('FINISH')) {
      sessionRef.current = {
        wabaId: data.data?.waba_id ? String(data.data.waba_id) : undefined,
        phoneNumberId: data.data?.phone_number_id ? String(data.data.phone_number_id) : undefined,
      };
    } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
      const info = data.data ?? {};
      setError(
        info.error_message
          ? `Meta signup error: ${info.error_message}`
          : `Signup closed at step “${info.current_step ?? 'unknown'}”`,
      );
    }
  });

  if (!isAdmin) {
    return (
      <div className="page">
        <EmptyState icon={ShieldCheck} title="Admins only">
          Only admins can connect WhatsApp numbers.
        </EmptyState>
      </div>
    );
  }

  const finish = async (code) => {
    setPhase('connecting');
    for (let waited = 0; !sessionRef.current && waited < SESSION_INFO_WAIT_MS; waited += 100) {
      await sleep(100);
    }
    try {
      await api.waOnboardingComplete({ code, state, ...(sessionRef.current ?? {}) });
      toast.success('WhatsApp number connected');
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPhase('idle');
      await load();
      newState();
    }
  };

  // FB.login must run straight from the click (popup blockers), and its callback must not be
  // an async function (the SDK rejects it).
  const launch = () => {
    setError(null);
    sessionRef.current = null;
    setPhase('signup');
    window.FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (code) {
          finish(code);
        } else {
          setPhase('idle');
          setError((prev) => prev ?? 'Signup was closed before it finished');
        }
      },
      {
        config_id: status.config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  };

  const retry = async () => {
    setBusy(true);
    setPhase('retrying');
    setError(null);
    try {
      await api.waOnboardingRetry(pin || undefined);
      toast.success('WhatsApp number connected');
      setPin('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setPhase('idle');
      load();
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this number? Vartalap stops receiving and sending on it.')) {
      return;
    }
    setBusy(true);
    try {
      const { restored, warnings } = await api.waOnboardingDisconnect();
      toast.success(restored ? 'Disconnected; the previous number is back' : 'Disconnected');
      for (const warning of warnings) toast.error(warning);
    } catch (err) {
      toast.error(`Could not disconnect: ${errorText(err)}`);
    } finally {
      setBusy(false);
      load();
    }
  };

  const refresh = async () => {
    setBusy(true);
    await load();
    setBusy(false);
  };

  const connection = status?.connection;
  const connected = connection?.status === 'connected';
  const pending = connection && !connected;
  const canLaunch =
    status?.config.ready && sdk === 'ready' && state && phase === 'idle' && !connected && !busy;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">WhatsApp</h1>
        <p className="page-subtitle">
          Connect a WhatsApp Business number in a few clicks with Meta’s Embedded Signup. Demo
          build: the Meta app is in development mode, so only people with a role on it can sign up.
        </p>
      </header>

      {loadError && (
        <p className="alert danger" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {loadError}
        </p>
      )}
      {!status && !loadError && <p className="muted small">Loading…</p>}

      {status && !status.config.ready && (
        <p className="alert danger" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          Set {status.config.missing.join(' and ')} in apps/web/.env.local and restart the dev
          server (docs/demo-whatsapp-onboarding.md).
        </p>
      )}

      {status && (
        <NumberCard status={status} onRefresh={refresh} onDisconnect={disconnect} busy={busy} />
      )}

      {connected && status.active.source === 'embedded_signup' && (
        <FirstMessage connection={connection} number={status.active.number} />
      )}

      {status && !connected && (
        <section className="card" aria-labelledby="wa-connect">
          <h2 className="section-title" id="wa-connect">
            <PlugZap size={18} aria-hidden="true" />
            Connect a number
          </h2>
          <ul className="wa-checklist">
            <li>A Facebook account that is an admin on the business (and has a role on the app)</li>
            <li>
              A phone number not active on another WhatsApp account, able to get an SMS or call
            </li>
            <li>The business display name you want clients to see</li>
          </ul>

          <StepList connection={connection} phase={phase} />

          {error && (
            <p className="alert danger" role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="wa-actions">
            <button type="button" className="button primary" onClick={launch} disabled={!canLaunch}>
              {phase === 'idle' ? (
                <PlugZap size={16} aria-hidden="true" />
              ) : (
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
              )}
              {phase === 'signup'
                ? 'Finish the signup in the popup…'
                : phase === 'connecting'
                  ? 'Connecting…'
                  : pending
                    ? 'Start over'
                    : 'Connect WhatsApp'}
            </button>
            {sdk === 'loading' && <span className="muted small">Loading Facebook…</span>}
            {sdk === 'failed' && (
              <span className="inline-error">
                Could not load the Facebook SDK (blocked by an extension or offline?)
              </span>
            )}
          </div>

          {pending && connection.lastError && (
            <div className="wa-retry">
              <p className="small">
                The last attempt stopped at “{STEP_LABELS[connection.lastError.step]}”. Retry
                resumes from there without a new signup.
              </p>
              <div className="wa-actions">
                <input
                  className="input wa-pin"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="Existing PIN (optional)"
                  aria-label="Existing two-step verification PIN"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                />
                <button
                  type="button"
                  className="button"
                  onClick={retry}
                  disabled={busy || (pin !== '' && pin.length !== 6)}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw size={16} aria-hidden="true" />
                  )}
                  Retry
                </button>
              </div>
              <p className="field-hint">
                Enter a PIN only if the number already had two-step verification set elsewhere.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
