// ─── Real-Time Cloud Relay for Cross-Device Sync (Laptop <-> HP) ─────────────
const SYNC_TOPIC = 'klinixflow_natanchy_live_sync';
const SYNC_URL   = `https://ntfy.sh/${SYNC_TOPIC}`;

// Unique ID for this device session
export const DEVICE_ID = `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

/**
 * Broadcast an action or full snapshot to all connected devices over the internet
 */
export async function broadcastCloud(payload) {
  try {
    const body = JSON.stringify({
      ...payload,
      senderId: DEVICE_ID,
      timestamp: Date.now(),
    });
    await fetch(SYNC_URL, {
      method: 'POST',
      body: body,
      headers: {
        'Title': 'KlinixFlow Sync',
      },
    });
  } catch (err) {
    console.warn('Cloud sync broadcast failed:', err);
  }
}

/**
 * Subscribe to real-time events sent by other devices (e.g. HP -> Laptop or Laptop -> HP)
 */
export function subscribeCloud(onAction) {
  if (typeof window === 'undefined' || !window.EventSource) return () => {};

  // 1. Initial catch-up from last broadcast
  fetch(`${SYNC_URL}/json?poll=1`)
    .then((res) => res.text())
    .then((text) => {
      const lines = text.trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message) {
            const data = JSON.parse(parsed.message);
            if (data && data.senderId !== DEVICE_ID) {
              onAction(data);
            }
          }
        } catch {}
      }
    })
    .catch(() => {});

  // 2. Real-time stream using Server-Sent Events (SSE)
  let eventSource = null;
  try {
    eventSource = new EventSource(`${SYNC_URL}/sse`);
    eventSource.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        if (raw.event === 'message' && raw.message) {
          const data = JSON.parse(raw.message);
          if (data && data.senderId !== DEVICE_ID) {
            onAction(data);
          }
        }
      } catch (err) {
        console.error('SSE data parse error:', err);
      }
    };
    eventSource.onerror = () => {
      // Browser will automatically reconnect SSE
    };
  } catch (e) {
    console.warn('SSE not supported or blocked:', e);
  }

  return () => {
    if (eventSource) eventSource.close();
  };
}
