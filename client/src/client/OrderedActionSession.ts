import { shouldBufferSeq } from '@shared/net/seqGuard';

export interface OrderedActionRow<Action> {
  seq: number;
  action: Action;
}

/** Owns canonical sequence admission and drain state independently of transport. */
export class OrderedActionSession<Action> {
  private pending = new Map<number, Action>();
  private expectedSeq = 0;
  private replaying = false;
  private disposed = false;

  get nextExpectedSeq(): number { return this.expectedSeq; }
  get isReplaying(): boolean { return this.replaying; }
  get pendingSize(): number { return this.pending.size; }
  get pendingSequences(): number[] { return [...this.pending.keys()]; }
  get pendingActions(): ReadonlyMap<number, Action> { return this.pending; }

  beginReplay(): void { this.replaying = true; }
  finishReplay(nextExpectedSeq = this.expectedSeq): void {
    this.expectedSeq = nextExpectedSeq;
    this.replaying = false;
  }

  buffer(seq: number, action: Action): boolean {
    if (this.disposed || !shouldBufferSeq(seq, this.expectedSeq)) return false;
    this.pending.set(seq, action);
    return true;
  }

  drain(
    canApply: () => boolean,
    apply: (action: Action) => void,
    settleReplay: () => void,
    emit: () => void,
  ): void {
    while (canApply() && this.pending.has(this.expectedSeq)) {
      const action = this.pending.get(this.expectedSeq)!;
      apply(action);
      this.pending.delete(this.expectedSeq);
      this.expectedSeq += 1;
      if (this.replaying) settleReplay();
      emit();
    }
  }

  acceptResync(rows: OrderedActionRow<Action>[]): boolean {
    if (this.disposed) return false;
    for (const row of rows) this.buffer(row.seq, row.action);
    return true;
  }

  /** Admit a captured recovery only when its rows plus live pending rows cover the target. */
  acceptRecovery(rows: OrderedActionRow<Action>[], targetExclusive: number): boolean {
    if (
      this.disposed
      || !Number.isInteger(targetExclusive)
    ) return false;
    // Realtime may drain through (or beyond) the captured HTTP target while the
    // request is in flight. That target is already satisfied; ignore its stale
    // rows rather than rewinding or admitting them again.
    if (targetExclusive <= this.expectedSeq) return true;
    const incoming = new Map<number, Action>();
    for (const row of rows) {
      if (!Number.isInteger(row.seq) || incoming.has(row.seq)) return false;
      if (row.seq >= this.expectedSeq && row.seq < targetExclusive) {
        incoming.set(row.seq, row.action);
      }
    }
    for (let seq = this.expectedSeq; seq < targetExclusive; seq += 1) {
      if (!this.pending.has(seq) && !incoming.has(seq)) return false;
    }
    for (const [seq, action] of incoming) this.buffer(seq, action);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
  }
}
