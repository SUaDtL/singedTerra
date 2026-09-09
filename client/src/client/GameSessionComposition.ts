import type { ClientModeSetup } from './modeConfig';
import type { ClientConstructionSetup } from './createModeClient';
import {
  MatchSessionLifecycle,
  type MatchClientResource,
  type MatchInputResource,
  type MatchRendererResource,
} from './MatchSessionLifecycle';

export type SessionClientAcquisition<Client> =
  | { readonly status: 'acquired'; readonly client: Client; readonly verifiedComplete: boolean }
  | { readonly status: 'unavailable' };

export interface SessionConstructionContext<Client, Renderer, State, Setup extends ClientConstructionSetup> {
  readonly generation: number;
  readonly setup: Setup;
  readonly client: Client;
  readonly renderer: Renderer;
  readonly initial: State | null;
  readonly terminalHistoryPrimed: boolean;
}

export interface ActiveSessionContext<Client, Input, Renderer, State, Setup extends ClientConstructionSetup>
  extends SessionConstructionContext<Client, Renderer, State, Setup> {
  readonly input: Input;
}

export interface GameSessionCompositionPorts<
  Client, Input, Renderer, State, Setup extends ClientConstructionSetup = ClientModeSetup,
> {
  retirePresentation(): void | Promise<void>;
  afterRetire(): void;
  prepareAcquisition(): Setup;
  acquireClient(setup: Setup): Promise<SessionClientAcquisition<Client>>;
  constructRenderer(): Renderer;
  configureRendererEvents(renderer: Renderer): void;
  primeTerminalHistory(renderer: Renderer, state: State): void;
  configureInitialPresentation(context: SessionConstructionContext<Client, Renderer, State, Setup>): void;
  constructInput(context: SessionConstructionContext<Client, Renderer, State, Setup>): Input;
  attachInput(input: Input): void;
  configureClient(context: ActiveSessionContext<Client, Input, Renderer, State, Setup>): void;
  createStateListener(context: ActiveSessionContext<Client, Input, Renderer, State, Setup>): (state: State) => void;
  subscribe(client: Client, listener: (state: State) => void): () => void;
  start(client: Client): void;
}

/** Owns the ordered, failure-safe construction of one match generation. */
export class GameSessionComposition<
  Client extends MatchClientResource & { getState(): State | null },
  Input extends MatchInputResource,
  Renderer extends MatchRendererResource,
  State,
  Setup extends ClientConstructionSetup = ClientModeSetup,
> {
  constructor(private readonly lifecycle: MatchSessionLifecycle<Client, Input, Renderer>) {}

  retire(beforeRenderer: () => void | Promise<void>): Promise<number> {
    return this.lifecycle.retire(beforeRenderer);
  }

  async start(
    ports: GameSessionCompositionPorts<Client, Input, Renderer, State, Setup>,
  ): Promise<ActiveSessionContext<Client, Input, Renderer, State, Setup> | null> {
    const generation = await this.lifecycle.retire(ports.retirePresentation);
    ports.afterRetire();
    if (!this.lifecycle.isCurrent(generation)) return null;
    const setup = ports.prepareAcquisition();
    if (!this.lifecycle.isCurrent(generation)) return null;
    const acquisition = await ports.acquireClient(setup);
    if (acquisition.status === 'unavailable') return null;
    const { client } = acquisition;
    if (!this.lifecycle.ownClient(generation, client)) return null;

    try {
      const renderer = ports.constructRenderer();
      if (!this.lifecycle.isCurrent(generation, client)) {
        renderer.reset();
        return null;
      }
      this.lifecycle.ownRenderer(renderer);
      ports.configureRendererEvents(renderer);
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const initial = client.getState();
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const terminalHistoryPrimed = acquisition.verifiedComplete && initial !== null;
      if (terminalHistoryPrimed) ports.primeTerminalHistory(renderer, initial);
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const construction = { generation, setup, client, renderer, initial, terminalHistoryPrimed };
      ports.configureInitialPresentation(construction);
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const input = ports.constructInput(construction);
      if (!this.lifecycle.isCurrent(generation, client)) {
        input.detach();
        return null;
      }
      this.lifecycle.ownInput(input);
      ports.attachInput(input);
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const active = { ...construction, input };
      ports.configureClient(active);
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const listener = ports.createStateListener(active);
      if (!this.lifecycle.isCurrent(generation, client)) return null;
      const unsubscribe = ports.subscribe(client, listener);
      if (!this.lifecycle.isCurrent(generation, client)) {
        unsubscribe();
        return null;
      }
      this.lifecycle.ownSubscription(unsubscribe);
      ports.start(client);
      return this.lifecycle.isCurrent(generation, client) ? active : null;
    } catch (error) {
      this.lifecycle.rollbackIfCurrent(generation, client);
      throw error;
    }
  }
}
