// Public project token: intended for browser event collection.
const PROJECT_TOKEN = 'phc_xbpgJpjo7ve7e8PyDA7UE56FE6jfZ4scTxwmnAFer3nq';
const API_HOST = 'https://us.i.posthog.com';
const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
const enabled = !localHost && /^https?:$/.test(window.location.protocol)
  && !window.location.pathname.startsWith('/tools/');

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

if (enabled) {
  try {
    // Queue initialization and captures while the async SDK loads.
    if (!window.posthog) {
      const posthog = [];
      posthog._i = [];
      posthog.__SV = 1;
      posthog.init = (token, options) => posthog._i.push([token, options, 'posthog']);
      posthog.capture = (...args) => posthog.push(['capture', ...args]);
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
      capture_pageview: true,
      disable_session_recording: true,
    });
  } catch {
    // Analytics must never prevent the game from starting.
  }
}

export function track(event, properties = {}) {
  if (!enabled) return;
  try {
    window.posthog?.capture(event, properties);
  } catch {
    // Tracking failures must not interrupt gameplay.
  }
}

if (referralShareId) track('invite_opened', { share_id: referralShareId, ...referralContext });
