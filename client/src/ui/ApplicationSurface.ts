export type ApplicationSurfaceState = 'pregame' | 'launching' | 'battle';

export interface ApplicationSurfaceRoots {
  readonly pregame: HTMLElement;
  readonly battle: HTMLElement;
}

export interface ApplicationLaunchOptions<FocusSnapshot, Result> {
  readonly captureFocus: () => FocusSnapshot;
  readonly acquire: () => Result | null | Promise<Result | null>;
  readonly commit: (result: Result) => void;
  readonly restore: (snapshot: FocusSnapshot, error: unknown) => void;
}

export class ApplicationSurfaceController {
  private currentState: ApplicationSurfaceState;

  constructor(
    private readonly roots: ApplicationSurfaceRoots,
    initialState: ApplicationSurfaceState,
  ) {
    this.currentState = initialState;
    this.applyState();
  }

  get state(): ApplicationSurfaceState {
    return this.currentState;
  }

  setState(state: ApplicationSurfaceState): void {
    this.currentState = state;
    this.applyState();
  }

  private applyState(): void {
    const pregameActive = this.currentState === 'pregame';
    const launching = this.currentState === 'launching';
    const battleActive = this.currentState === 'battle';

    this.roots.pregame.hidden = battleActive;
    this.roots.pregame.inert = !pregameActive;
    if (battleActive) this.roots.pregame.setAttribute('aria-hidden', 'true');
    else this.roots.pregame.removeAttribute('aria-hidden');
    if (launching) this.roots.pregame.setAttribute('aria-busy', 'true');
    else this.roots.pregame.removeAttribute('aria-busy');

    this.roots.battle.hidden = !battleActive;
    this.roots.battle.inert = !battleActive;
    if (battleActive) this.roots.battle.removeAttribute('aria-hidden');
    else this.roots.battle.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Generation-binds one asynchronous launch to the application surfaces.
 * Domain owners still acquire and dispose their own resources; this class owns
 * only when preparation becomes inert, when battle may be revealed, and which
 * focus snapshot a current failure may restore.
 */
export class ApplicationLaunchLifecycle<FocusSnapshot> {
  private generation = 0;

  constructor(private readonly surfaces: ApplicationSurfaceController) {}

  async launch<Result>(
    options: ApplicationLaunchOptions<FocusSnapshot, Result>,
  ): Promise<Result | null> {
    const generation = ++this.generation;
    const snapshot = options.captureFocus();
    this.surfaces.setState('launching');

    let result: Result | null;
    try {
      result = await options.acquire();
    } catch (error) {
      if (generation === this.generation) {
        this.surfaces.setState('pregame');
        options.restore(snapshot, error);
      }
      return null;
    }

    if (generation !== this.generation) return null;
    if (result === null) {
      this.surfaces.setState('pregame');
      options.restore(snapshot, undefined);
      return null;
    }

    try {
      options.commit(result);
    } catch (error) {
      if (generation === this.generation) {
        this.surfaces.setState('pregame');
        options.restore(snapshot, error);
      }
      return null;
    }
    if (generation !== this.generation) return null;
    this.surfaces.setState('battle');
    return result;
  }

  returnToPregame(show: () => void): void {
    this.generation += 1;
    this.surfaces.setState('pregame');
    show();
  }

  async returnToPregameAfter(
    retire: Promise<unknown>,
    show: () => void,
  ): Promise<void> {
    const generation = ++this.generation;
    await retire;
    if (generation !== this.generation) return;
    this.surfaces.setState('pregame');
    show();
  }
}
