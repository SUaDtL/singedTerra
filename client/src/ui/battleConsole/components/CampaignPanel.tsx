import { type JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { BattleConsoleIntent, CampaignBattleConsolePresentation } from '../types';
import { ashRoadAsset } from '../../../assets/campaign/manifest';

const panelStyle: JSX.CSSProperties = {
  position: 'absolute', inset: '8px', zIndex: 20, overflow: 'auto',
  border: '1px solid #ffcf64', borderRadius: '6px', padding: '16px',
  background: 'rgba(12, 12, 11, 0.98)', color: '#fff1c7',
  fontFamily: 'var(--font-mono)', pointerEvents: 'auto',
};

const actionsStyle: JSX.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px',
};

export function CampaignPanel({ campaign, dispatch }: Readonly<{
  campaign: CampaignBattleConsolePresentation;
  dispatch: (intent: BattleConsoleIntent) => void;
}>) {
  const checkpoint = campaign.checkpoint ?? null;
  const root = useRef<HTMLElement>(null);
  const [storyVisible, setStoryVisible] = useState(true);
  const focusFirstControl = (): void => {
    root.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!checkpoint) return;
    setStoryVisible(true);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = [...(root.current?.parentElement?.children ?? [])]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root.current)
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    for (const { element } of siblings) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    focusFirstControl();
    return () => {
      for (const { element, inert, ariaHidden } of siblings) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
      previous?.focus({ preventScroll: true });
    };
  }, [checkpoint?.encounterId]);
  useEffect(() => {
    if (checkpoint && !storyVisible && !root.current?.contains(document.activeElement)) {
      focusFirstControl();
    }
  }, [checkpoint?.encounterId, storyVisible]);
  if (!checkpoint || campaign.result?.outcome !== 'success') return null;

  const canChoose = checkpoint.decisionPending;
  const supplies = campaign.supplies;
  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Campaign checkpoint"
      data-campaign-checkpoint={checkpoint.encounterId}
      style={panelStyle}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [...(root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [])].filter((control) => !control.hidden);
        if (controls.length === 0) {
          event.preventDefault();
          root.current?.focus({ preventScroll: true });
          return;
        }
        const first = controls[0]!;
        const last = controls.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      tabIndex={-1}
    >
      {checkpoint.encounterId === 'relay-ridge' ? (
        <img
          src={`${import.meta.env.BASE_URL}${ashRoadAsset('siege').path}`}
          alt=""
          aria-hidden="true"
          onError={(event) => { event.currentTarget.hidden = true; }}
          style={{ float: 'right', width: 'min(38%, 220px)', maxHeight: '120px', objectFit: 'contain' }}
        />
      ) : null}
      {checkpoint.story && storyVisible ? <header data-campaign-story={checkpoint.story.id}>
        <h2>{checkpoint.story.title}</h2>
        <p>{checkpoint.story.body}</p>
        <button type="button" onClick={() => setStoryVisible(false)}>Skip story</button>
      </header> : null}
      <p role="status">{supplies} supplies · {Math.round(checkpoint.hull)} hull</p>
      {checkpoint.emergencyPatchAvailable ? (
        <button type="button" onClick={() => dispatch({ type: 'campaign-emergency-patch' })}>
          Apply emergency hull patch · free · restore to 60
        </button>
      ) : null}
      <ul aria-label="Carried kit">
        {checkpoint.ammunition.map((entry) => (
          <li key={entry.weaponId}>
            {entry.weaponId.replaceAll('_', ' ')} · {entry.quantity === null ? 'unlimited' : `${entry.quantity} / ${entry.maximum}`}
          </li>
        ))}
      </ul>
      {checkpoint.routeRequired ? <fieldset>
        <legend>Choose route</legend>
        <button type="button" onClick={() => dispatch({
          type: 'campaign-route-select', routeId: 'high-road-route',
        })}>Take High Road</button>{' '}
        <button type="button" onClick={() => dispatch({
          type: 'campaign-route-select', routeId: 'salvage-pit-route',
        })}>Enter Salvage Pit</button>
      </fieldset> : null}
      {canChoose ? <fieldset>
        <legend>Service carried kit</legend>
        <div style={actionsStyle}>
          <button type="button" onClick={() => dispatch({
            type: 'campaign-checkpoint-choice', choice: { kind: 'retain' },
          })}>Retain loadout</button>
          <button type="button" disabled={supplies < 2 || checkpoint.hull >= 100} onClick={() => dispatch({
            type: 'campaign-checkpoint-choice', choice: { kind: 'repair' },
          })}>Repair hull · 2</button>
          {checkpoint.ammunition.filter(({ quantity }) => quantity !== null).map((entry) => (
            <button
              type="button"
              key={entry.weaponId}
              disabled={supplies < 1 || entry.quantity === entry.maximum}
              onClick={() => dispatch({
                type: 'campaign-checkpoint-choice',
                choice: { kind: 'refill', weaponId: entry.weaponId },
              })}
            >Refill {entry.weaponId.replaceAll('_', ' ')} · 1</button>
          ))}
        </div>
      </fieldset> : null}
      {!checkpoint.finalEncounter && checkpoint.decisionApplied
        && (!checkpoint.routeRequired || checkpoint.selectedRouteId !== null) ? (
          <button type="button" onClick={() => dispatch({ type: 'campaign-continue' })}>
            Continue Ash Road
          </button>
        ) : null}
      {checkpoint.finalEncounter ? <p role="status">Chapter complete</p> : null}
    </section>
  );
}
