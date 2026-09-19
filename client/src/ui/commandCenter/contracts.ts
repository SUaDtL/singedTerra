declare const commandCategoryIdBrand: unique symbol;
declare const commandItemIdBrand: unique symbol;

export type CommandCategoryId = string & {
  readonly [commandCategoryIdBrand]: 'CommandCategoryId';
};

export type CommandItemId = string & {
  readonly [commandItemIdBrand]: 'CommandItemId';
};

export type CommandSemanticIcon = 'campaigns' | 'skirmishes' | 'multiplayer';

export interface CommandItemSummary {
  readonly label: string;
  readonly description: string;
}

export type CommandAvailability<Context> = (context: Readonly<Context>) => boolean;

export interface MountedCommandView<Update> {
  update(update: Readonly<Update>): void;
  focusDefault(): void;
  /** Safe to call repeatedly; owned resources are released at most once. */
  dispose(): void;
}

/** Shell-owned authority for asynchronous work started by one mounted view. */
export interface CommandViewLifetime {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  /** Run a stale-sensitive side effect only while this view still owns its mount. */
  run(effect: () => void): boolean;
}

export interface CommandItemContribution<Context> {
  readonly id: CommandItemId;
  readonly summary: Readonly<CommandItemSummary>;
  readonly availability: CommandAvailability<Context>;
  readonly createView: (
    host: HTMLElement,
    context: Readonly<Context>,
    lifetime: CommandViewLifetime,
  ) => MountedCommandView<Context>;
}

export interface CommandCategoryContribution<Context> {
  readonly id: CommandCategoryId;
  readonly label: string;
  readonly icon: CommandSemanticIcon;
  readonly order: number;
  readonly availability: CommandAvailability<Context>;
  readonly provideItems: (
    context: Readonly<Context>,
  ) => readonly CommandItemContribution<Context>[];
}

export type CampaignSavePresentation =
  | Readonly<{ status: 'checking' }>
  | Readonly<{ status: 'empty' }>
  | Readonly<{ status: 'compatible' }>
  | Readonly<{ status: 'incompatible' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'restoring' }>
  | Readonly<{ status: 'complete' }>;

const STABLE_COMMAND_ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const MAX_COMMAND_ID_LENGTH = 64;

function isStableCommandId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_COMMAND_ID_LENGTH
    && STABLE_COMMAND_ID.test(value);
}

function requireStableCommandId(value: string, name: string): string {
  if (!isStableCommandId(value)) throw new Error(`invalid ${name}`);
  return value;
}

export function commandCategoryId(value: string): CommandCategoryId {
  return requireStableCommandId(value, 'command category ID') as CommandCategoryId;
}

export function commandItemId(value: string): CommandItemId {
  return requireStableCommandId(value, 'command item ID') as CommandItemId;
}

export function isCommandCategoryId(value: unknown): value is CommandCategoryId {
  return isStableCommandId(value);
}

export function isCommandItemId(value: unknown): value is CommandItemId {
  return isStableCommandId(value);
}
