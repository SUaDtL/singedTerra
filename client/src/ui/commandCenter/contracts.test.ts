import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  commandCategoryId,
  commandItemId,
  isCommandCategoryId,
  isCommandItemId,
  type CampaignSavePresentation,
  type CommandCategoryContribution,
  type CommandCategoryId,
  type CommandItemContribution,
  type CommandViewLifetime,
  type MountedCommandView,
} from './contracts';

interface FixtureContext {
  readonly campaignReady: boolean;
  readonly itemReady: boolean;
}

function fixtureItem(release: () => void = () => undefined): CommandItemContribution<FixtureContext> {
  return {
    id: commandItemId('ash-road'),
    summary: {
      label: 'Ash Road',
      description: 'Continue the campaign.',
    },
    availability: (context) => context.itemReady,
    createView: (_host, context) => {
      let disposed = false;
      return {
        update: vi.fn((_next) => undefined),
        focusDefault: vi.fn(),
        dispose: vi.fn(() => {
          if (disposed) return;
          disposed = true;
          release();
        }),
        initialContext: context,
      } satisfies MountedCommandView<FixtureContext> & {
        readonly initialContext: Readonly<FixtureContext>;
      };
    },
  };
}

describe('command contribution contracts', () => {
  it('keeps category and item identifiers stable, validated, and type-distinct', () => {
    const categoryId = commandCategoryId('campaigns');
    const itemId = commandItemId('ash-road');

    expect(commandCategoryId('campaigns')).toBe(categoryId);
    expect(commandItemId('ash-road')).toBe(itemId);
    expect(isCommandCategoryId(categoryId)).toBe(true);
    expect(isCommandItemId(itemId)).toBe(true);
    expect(isCommandCategoryId('Campaigns')).toBe(false);
    expect(isCommandItemId('ash road')).toBe(false);
    expect(() => commandCategoryId('')).toThrow('command category ID');
    expect(() => commandItemId('online/room')).toThrow('command item ID');

    expectTypeOf(categoryId).toEqualTypeOf<CommandCategoryId>();
    // @ts-expect-error Category and item IDs must not be interchangeable.
    const wrongId: CommandCategoryId = itemId;
    void wrongId;
  });

  it('evaluates category and item availability at their explicit context boundary', () => {
    const item = fixtureItem();
    const category: CommandCategoryContribution<FixtureContext> = {
      id: commandCategoryId('campaigns'),
      label: 'Campaigns',
      icon: 'campaigns',
      order: 10,
      availability: (context) => context.campaignReady,
      provideItems: () => [item],
    };
    const unavailable = Object.freeze({ campaignReady: false, itemReady: false });
    const available = Object.freeze({ campaignReady: true, itemReady: true });

    expect(category.availability(unavailable)).toBe(false);
    expect(category.availability(available)).toBe(true);
    expect(category.provideItems(available)).toEqual([item]);
    expect(item.availability(unavailable)).toBe(false);
    expect(item.availability(available)).toBe(true);

    expectTypeOf(category.provideItems(available))
      .toEqualTypeOf<readonly CommandItemContribution<FixtureContext>[]>();
  });

  it('requires owned views to expose update, default focus, and idempotent disposal', () => {
    const context = Object.freeze({ campaignReady: true, itemReady: true });
    const release = vi.fn();
    const controller = new AbortController();
    const lifetime: CommandViewLifetime = {
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted,
      run: (effect) => {
        if (controller.signal.aborted) return false;
        effect();
        return true;
      },
    };
    const view = fixtureItem(release).createView(
      document.createElement('section'),
      context,
      lifetime,
    );

    view.update(context);
    view.focusDefault();
    view.dispose();
    view.dispose();

    expect(view.update).toHaveBeenCalledOnce();
    expect(view.focusDefault).toHaveBeenCalledOnce();
    expect(view.dispose).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('CampaignSavePresentation', () => {
  it('keeps all seven save outcomes explicit and exhaustively discriminated', () => {
    expectTypeOf<CampaignSavePresentation['status']>().toEqualTypeOf<
      | 'checking'
      | 'empty'
      | 'compatible'
      | 'incompatible'
      | 'unavailable'
      | 'restoring'
      | 'complete'
    >();
    const states = [
      { status: 'checking' },
      { status: 'empty' },
      { status: 'compatible' },
      { status: 'incompatible' },
      { status: 'unavailable' },
      { status: 'restoring' },
      { status: 'complete' },
    ] as const satisfies readonly CampaignSavePresentation[];

    expect(states.map((state) => state.status)).toEqual([
      'checking',
      'empty',
      'compatible',
      'incompatible',
      'unavailable',
      'restoring',
      'complete',
    ]);

    // @ts-expect-error Unknown save states cannot collapse into the presentation contract.
    const invalid: CampaignSavePresentation = { status: 'error' };
    void invalid;
  });
});
