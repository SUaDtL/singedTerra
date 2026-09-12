import {
  isActiveSeatLocal,
  type ActiveSeatOwnership,
} from '../input/inputGate';

export interface AimGuidePresentation {
  visible: boolean;
  gravity: number;
}

/** Keep aim-guide ownership separate from the client-authoritative gravity value. */
export function resolveAimGuidePresentation(
  ownership: ActiveSeatOwnership,
  gravity: number,
): AimGuidePresentation {
  return {
    visible: isActiveSeatLocal(ownership),
    gravity,
  };
}
