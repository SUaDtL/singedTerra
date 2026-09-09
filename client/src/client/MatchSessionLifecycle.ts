export interface MatchClientResource { stop(): void; }
export interface MatchInputResource { detach(): void; }
export interface MatchRendererResource { reset(): void; }

/** Owns the resources and invalidation token for one live match generation. */
export class MatchSessionLifecycle<
  Client extends MatchClientResource,
  Input extends MatchInputResource,
  Renderer extends MatchRendererResource,
> {
  private generation = 0;
  private ownedClient: Client | null = null;
  private ownedInput: Input | null = null;
  private unsubscribe: (() => void) | null = null;
  private ownedRenderer: Renderer | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  get client(): Client | null { return this.ownedClient; }
  get input(): Input | null { return this.ownedInput; }
  get renderer(): Renderer | null { return this.ownedRenderer; }
  get currentGeneration(): number { return this.generation; }

  isCurrent(generation: number, client?: Client | null): boolean {
    return generation === this.generation
      && (client === undefined || client === this.ownedClient);
  }

  ownClient(generation: number, client: Client): boolean {
    if (generation !== this.generation) {
      client.stop();
      return false;
    }
    this.ownedClient = client;
    return true;
  }

  ownInput(input: Input): void { this.ownedInput = input; }
  ownSubscription(unsubscribe: () => void): void { this.unsubscribe = unsubscribe; }
  ownRenderer(renderer: Renderer): void { this.ownedRenderer = renderer; }

  /** Roll back only the partially-built match that still owns this generation. */
  rollbackIfCurrent(generation: number, client: Client): boolean {
    if (!this.isCurrent(generation, client)) return false;
    this.generation += 1;
    const unsubscribe = this.unsubscribe;
    const input = this.ownedInput;
    const ownedClient = this.ownedClient;
    const renderer = this.ownedRenderer;
    this.unsubscribe = null;
    this.ownedInput = null;
    this.ownedClient = null;
    this.ownedRenderer = null;
    this.clearTimers();
    for (const dispose of [
      () => unsubscribe?.(),
      () => input?.detach(),
      () => ownedClient?.stop(),
      () => renderer?.reset(),
    ]) {
      try { dispose(); } catch { /* preserve the original setup failure */ }
    }
    return true;
  }

  schedule(callback: () => void, delayMs: number): void {
    this.timers.push(setTimeout(callback, delayMs));
  }

  clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  async retire(beforeRenderer: () => void | Promise<void>): Promise<number> {
    const generation = ++this.generation;
    const renderer = this.ownedRenderer;
    this.ownedRenderer = null;
    this.clearTimers();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ownedInput?.detach();
    this.ownedInput = null;
    this.ownedClient?.stop();
    this.ownedClient = null;
    await beforeRenderer();
    renderer?.reset();
    return generation;
  }
}
