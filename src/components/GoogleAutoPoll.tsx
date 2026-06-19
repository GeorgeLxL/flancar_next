'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

/**
 * Triggers `/google/poll` automatically while an admin is using the app:
 *   - on first mount,
 *   - whenever the browser tab regains focus,
 *   - and every POLL_INTERVAL_MS while open.
 *
 * Throttled to MIN_INTERVAL_MS so quick focus toggles don't hammer the API.
 * Fire-and-forget — silent on failure. Successful imports broadcast via SSE,
 * which the Calendar already listens to, so the UI refreshes itself.
 */
const POLL_INTERVAL_MS = 60_000; // foreground tick: 1 min
const MIN_INTERVAL_MS = 30_000;  // throttle: at most one call per 30 s

export default function GoogleAutoPoll() {
  const { user } = useAuth();
  const lastFiredAt = useRef(0);

  useEffect(() => {
    if (!user) return;
    // Only admins should be hitting the import endpoint.
    if (user.roleId !== '1') return;

    const fire = (mode: 'login' | 'heartbeat') => {
      const now = Date.now();
      if (now - lastFiredAt.current < MIN_INTERVAL_MS) return;
      lastFiredAt.current = now;
      // login → 1-day window; heartbeat → 30-min window (server default).
      const url = mode === 'login' ? '/google/poll?mode=login' : '/google/poll';
      fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      }).catch(() => {
        /* silent */
      });
    };

    fire('login'); // wider one-day scan on page load
    const interval = window.setInterval(() => fire('heartbeat'), POLL_INTERVAL_MS);
    const onFocus = () => fire('heartbeat');
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fire('heartbeat');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  return null;
}
