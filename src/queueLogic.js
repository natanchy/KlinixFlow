// ─────────────────────────────────────────────────────────────────────────────
// KlinixFlow – Queue Data Structure (Modified FIFO with IGD Priority)
// Implements a Singly Linked List under the hood.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a simulated hex memory address for educational display.
 * @param {string} id - unique patient id
 */
export function generateAddress(id) {
  const hash = id
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0xffff, 0x1000);
  return `0x${hash.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Generate a unique sequential queue number.
 */
export function generateQueueNumber(queue) {
  if (queue.length === 0) return 1;
  return Math.max(...queue.map((p) => p.queueNumber)) + 1;
}

/**
 * Enqueue a patient.
 * - IGD  → inserted at HEAD (front)
 * - Regular → appended at TAIL (back)
 *
 * @param {Array} queue - current queue array (represents linked list order)
 * @param {Object} patient - { id, name, complaint, status }
 * @returns {Array} new queue
 */
export function enqueue(queue, patient) {
  const queueNumber = generateQueueNumber(queue);
  const address = generateAddress(patient.id);
  const node = { ...patient, queueNumber, address, timestamp: Date.now() };

  if (patient.status === 'IGD') {
    // Find first non-IGD position and insert before it
    const firstRegularIdx = queue.findIndex((p) => p.status === 'Reguler');
    if (firstRegularIdx === -1) {
      // All are IGD → append at end
      return [...queue, node];
    }
    const next = [...queue];
    next.splice(firstRegularIdx, 0, node);
    return next;
  }

  // Reguler → push to tail
  return [...queue, node];
}

/**
 * Dequeue – remove from HEAD (index 0).
 * @param {Array} queue
 * @returns {{ patient: Object|null, newQueue: Array }}
 */
export function dequeue(queue) {
  if (queue.length === 0) return { patient: null, newQueue: [] };
  const [patient, ...newQueue] = queue;
  return { patient, newQueue };
}

/**
 * Remove a specific patient by id.
 */
export function removeById(queue, id) {
  return queue.filter((p) => p.id !== id);
}

