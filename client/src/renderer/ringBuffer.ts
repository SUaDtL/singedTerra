/**
 * A fixed-capacity ring buffer for 2D points, used by ProjectileRenderer to
 * maintain per-slot projectile position history without allocating unbounded
 * arrays.
 *
 * Push always succeeds; when the buffer is full the oldest entry is overwritten.
 * Iteration via forEach visits items in insertion order (oldest first → newest
 * last), which is the draw order: oldest (most faded) smoke puffs first, then
 * progressively fresher ones toward the shell tip.
 *
 * DOM-FREE: no browser APIs, importable in a Node/tsx harness.
 */
export interface Point2D {
  x: number;
  y: number;
}

export class RingBuffer {
  private readonly buf: Point2D[];
  private readonly cap: number;
  /** Index where the NEXT push will write. */
  private head = 0;
  /** Number of items currently stored (0..cap). */
  private size = 0;

  constructor(capacity: number) {
    if (capacity < 1) throw new RangeError(`RingBuffer capacity must be >= 1, got ${capacity}`);
    this.cap = capacity;
    this.buf = new Array<Point2D>(capacity);
  }

  /** Add a point. Evicts the oldest item when the buffer is already at capacity. */
  push(pt: Point2D): void {
    this.buf[this.head] = pt;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }

  /**
   * Iterate over all stored items in insertion order (oldest first).
   * Safe to call on an empty buffer — callback is never invoked.
   */
  forEach(cb: (pt: Point2D, index: number) => void): void {
    if (this.size === 0) return;
    // When the buffer is partially filled, items start at slot 0.
    // When it is full, the oldest item is at `head` (the slot just
    // past the most recently written one, which wraps around).
    const start = this.size < this.cap ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      cb(this.buf[(start + i) % this.cap], i);
    }
  }

  /** Remove all items. */
  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  /** Number of items currently stored. */
  get length(): number {
    return this.size;
  }
}
