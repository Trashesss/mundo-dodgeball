// Public project token: intended for browser event collection.
const PROJECT_TOKEN = 'phc_xbpgJpjo7ve7e8PyDA7UE56FE6jfZ4scTxwmnAFer3nq';
const API_HOST = 'https://us.i.posthog.com';
const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
const enabled = !localHost && /^https?:$/.test(window.location.protocol)
  && !window.location.pathname.startsWith('/tools/');
export const CONSENT_KEY = 'mundo-analytics-consent-v1';
function readConsent() {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'declined' ? value : null;
  } catch { return null; }
}
let consent = readConsent();
let initialized = false;
export const getAnalyticsConsent = () => consent;

// Keep attribution for this page visit, including rematches. Direct visits start fresh.
const incomingShareId = new URLSearchParams(window.location.search).get('share_id');
const referralShareId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  .test(incomingShareId ?? '') ? incomingShareId : null;
export const referralContext = referralShareId
  ? { entry_source: 'share', referral_share_id: referralShareId }
  : { entry_source: 'direct' };

export function createTrackingId() {
  return globalThis.crypto?.randomUUID?.()
    ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const value = Math.floor(Math.random() * 16);
      return (char === 'x' ? value : (value & 3) | 8).toString(16);
    });
}

function startAnalytics() {
  if (!enabled || consent !== 'accepted' || initialized) return;
  try {
    // Queue initialization and captures while the async SDK loads.
    if (!window.posthog) {
      const posthog = [];
      posthog._i = [];
      posthog.__SV = 1;
      posthog.init = (token, options) => posthog._i.push([token, options, 'posthog']);
      for (const method of ['capture', 'opt_in_capturing', 'opt_out_capturing']) {
        posthog[method] = (...args) => posthog.push([method, ...args]);
      }
      window.posthog = posthog;
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `${API_HOST.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
      document.head.appendChild(script);
    }
    window.posthog.init(PROJECT_TOKEN, {
      api_host: API_HOST,
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
    });
    initialized = true;
    window.posthog.opt_in_capturing?.();
    track('$pageview');
    if (referralShareId) track('invite_opened', { share_id: referralShareId, ...referralContext });
  } catch {
    // Analytics must never prevent the game from starting.
  }
}

export function track(event, properties = {}) {
  if (!enabled || consent !== 'accepted') return;
  try {
    window.posthog?.capture(event, properties);
  } catch {
    // Tracking failures must not interrupt gameplay.
  }
}

function applyConsent(value) {
  const previous = consent;
  consent = value;
  if (consent === 'accepted') {
    if (!initialized) startAnalytics();
    else if (previous !== 'accepted') window.posthog?.opt_in_capturing?.();
  } else if (initialized) {
    window.posthog?.opt_out_capturing?.({ clear_persistence: true });
  }
  window.dispatchEvent(new Event('analytics-consent-change'));
}

export function setAnalyticsConsent(value) {
  if (value !== 'accepted' && value !== 'declined') return;
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* Keep this visit's choice. */ }
  applyConsent(value);
}

window.addEventListener('storage', event => {
  if (event.key === CONSENT_KEY || event.key === null) applyConsent(readConsent());
});
startAnalytics();
