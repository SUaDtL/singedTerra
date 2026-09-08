import type { VerifiedHumanFire } from '@shared/net/verifiedDuel';
import type { AccountState } from './AccountSession';
import { createFieldOrder, type FieldOrder } from './fieldOrder';
import {
  parseVerifiedDeploymentDescriptor, sameVerifiedDeploymentDescriptor, verifiedDeploymentDeadline,
  type VerifiedDeploymentDeadline, type VerifiedDeploymentDescriptor,
  type VerifiedDeploymentReceipt, type VerifiedDeploymentStart,
} from './verifiedDeployment';
import { VerifiedDeploymentStorage } from './verifiedDeploymentStorage';

/** Account IO is injected; the session owns lifecycle and persistence, never presentation. */
export interface VerifiedDeploymentAccountPort {
  readonly state: AccountState;
  startVerifiedDeployment?(): Promise<VerifiedDeploymentStart | null>;
  abandonVerifiedDeployment?(sessionId: string): Promise<boolean>;
  completeVerifiedDeployment?(sessionId: string, transcript: readonly VerifiedHumanFire[]): Promise<VerifiedDeploymentReceipt | null>;
}

interface VerifiedDeploymentDetails {
  readonly descriptor: VerifiedDeploymentDescriptor;
  readonly transcript: readonly VerifiedHumanFire[];
  readonly deadline: VerifiedDeploymentDeadline;
  readonly fieldOrder: FieldOrder | null;
}

export type VerifiedDeploymentState =
  | { readonly status: 'idle' }
  | ({ readonly status: 'active' | 'completion-pending' } & VerifiedDeploymentDetails)
  | ({
      readonly status: 'retryable';
      readonly error: 'Verification is pending. Retry before the deployment deadline.';
    } & VerifiedDeploymentDetails)
  | ({
      readonly status: 'expired';
      readonly choices: readonly ['continue-casual', 'return-to-battery'];
    } & VerifiedDeploymentDetails)
  | { readonly status: 'verified'; readonly receipt: VerifiedDeploymentReceipt }
  | { readonly status: 'casual' }
  | ({
      readonly status: 'frozen';
      readonly error: 'Return to the deployment owner account to resume verification.';
    } & VerifiedDeploymentDetails)
  | {
      readonly status: 'failed';
      readonly error: 'Verified deployment is unavailable. Try again.';
    };

/** Descriptor-bound verified mission lifecycle, independent of Lobby and the DOM. */
export class VerifiedDeploymentSession {
  private readonly verifiedStorage: VerifiedDeploymentStorage;
  private verifiedNow = Date.now();
  private verifiedOwnerId: string | null = null;
  private verifiedCurrent: VerifiedDeploymentState = Object.freeze({ status: 'idle' as const });
  private verifiedAccountIdentity: string | null = null;
  private verifiedAccountGeneration = 0;
  private verifiedRecoveryGeneration = 0;

  constructor(
    private readonly accountSession: VerifiedDeploymentAccountPort,
    createStorage: (now: () => number) => VerifiedDeploymentStorage,
  ) {
    this.verifiedAccountIdentity = this.authenticatedAccountId();
    this.verifiedStorage = createStorage(() => this.verifiedNow);
  }

  syncAccountIdentity(beforeIdentityChange: () => void = () => {}): boolean {
    const accountIdentity = this.authenticatedAccountId();
    const identityChanged = accountIdentity !== this.verifiedAccountIdentity;
    if (identityChanged) {
      beforeIdentityChange();
      this.verifiedAccountIdentity = accountIdentity;
      this.verifiedAccountGeneration += 1;
    }
    return identityChanged;
  }

  advanceRecoveryGeneration(): number {
    return ++this.verifiedRecoveryGeneration;
  }

  get verifiedDeployment(): VerifiedDeploymentState {
    return this.verifiedCurrent;
  }

  async startVerifiedDeployment(now = Date.now()): Promise<VerifiedDeploymentStart | null> {
    this.verifiedNow = now;
    const account = this.accountSession.state;
    if (account.status !== 'authenticated' || account.busy) return null;
    if (!this.accountSession.startVerifiedDeployment) return null;
    const accountId = account.profile.id;
    const priorDeployment = this.verifiedCurrent;
    const accountGeneration = this.verifiedAccountGeneration;
    let started: VerifiedDeploymentStart | null;
    try {
      started = await this.accountSession.startVerifiedDeployment();
    } catch {
      if (accountGeneration === this.verifiedAccountGeneration) {
        this.verifiedCurrent = Object.freeze({
          status: 'failed',
          error: 'Verified deployment is unavailable. Try again.',
        });
      }
      return null;
    }
    if (accountGeneration !== this.verifiedAccountGeneration
      || this.accountSession.state.status !== 'authenticated'
      || this.accountSession.state.profile.id !== accountId) return null;
    const descriptor = parseVerifiedDeploymentDescriptor(started?.descriptor);
    if (!started || typeof started.resumed !== 'boolean' || !descriptor) {
      this.verifiedCurrent = Object.freeze({
        status: 'failed',
        error: 'Verified deployment is unavailable. Try again.',
      });
      return null;
    }
    const deadline = verifiedDeploymentDeadline(descriptor.expiresAt, now);
    if (!deadline.canComplete) {
      this.verifiedStorage.clear(descriptor);
      this.verifiedCurrent = Object.freeze({
        status: 'failed',
        error: 'Verified deployment is unavailable. Try again.',
      });
      return null;
    }
    const recovered = this.verifiedStorage.recover(descriptor);
    if (!recovered && !this.verifiedStorage.begin(descriptor)) {
      this.verifiedCurrent = Object.freeze({
        status: 'failed',
        error: 'Verified deployment is unavailable. Try again.',
      });
      return null;
    }
    const transcript = recovered?.transcript ?? Object.freeze([]);
    const sameBoundDescriptor = (
      priorDeployment.status === 'active'
      || priorDeployment.status === 'completion-pending'
      || priorDeployment.status === 'retryable'
      || priorDeployment.status === 'expired'
      || priorDeployment.status === 'frozen'
    ) && sameVerifiedDeploymentDescriptor(priorDeployment.descriptor, descriptor);
    const fieldOrder = sameBoundDescriptor
      ? priorDeployment.fieldOrder
      : createFieldOrder(account.profile.summary?.verifiedProgression);
    this.verifiedOwnerId = accountId;
    this.verifiedCurrent = recovered?.terminal
      ? Object.freeze({
          status: 'retryable',
          descriptor,
          transcript,
          deadline,
          fieldOrder,
          error: 'Verification is pending. Retry before the deployment deadline.',
        })
      : Object.freeze({ status: 'active', descriptor, transcript, deadline, fieldOrder });
    return Object.freeze({ resumed: started.resumed, descriptor });
  }

  recordVerifiedDeploymentFire(value: VerifiedHumanFire, now = Date.now()): boolean {
    this.refreshVerifiedDeploymentDeadline(now);
    const current = this.verifiedCurrent;
    if (current.status !== 'active' || !this.ownsVerifiedDeployment()) return false;
    if (!this.verifiedStorage.recordAcceptedFire(current.descriptor, value)) return false;
    const recovered = this.verifiedStorage.recover(current.descriptor);
    if (!recovered) {
      this.verifiedCurrent = Object.freeze({
        status: 'failed',
        error: 'Verified deployment is unavailable. Try again.',
      });
      return false;
    }
    this.verifiedCurrent = Object.freeze({
      status: 'active',
      descriptor: current.descriptor,
      transcript: recovered.transcript,
      deadline: verifiedDeploymentDeadline(current.descriptor.expiresAt, now),
      fieldOrder: current.fieldOrder,
    });
    return true;
  }

  refreshVerifiedDeploymentDeadline(now = Date.now()): VerifiedDeploymentState {
    this.verifiedNow = now;
    const current = this.verifiedCurrent;
    if (current.status !== 'active' && current.status !== 'completion-pending'
      && current.status !== 'retryable' && current.status !== 'expired') return current;
    const deadline = verifiedDeploymentDeadline(current.descriptor.expiresAt, now);
    if (!deadline.canComplete) {
      this.verifiedCurrent = Object.freeze({
        status: 'expired',
        descriptor: current.descriptor,
        transcript: current.transcript,
        deadline,
        fieldOrder: null,
        choices: Object.freeze(['continue-casual', 'return-to-battery'] as const),
      });
      return this.verifiedCurrent;
    }
    if (current.status === 'expired') return current;
    this.verifiedCurrent = current.status === 'retryable'
      ? Object.freeze({ ...current, deadline })
      : Object.freeze({ ...current, deadline });
    return this.verifiedCurrent;
  }

  async completeVerifiedDeployment(now = Date.now()): Promise<VerifiedDeploymentReceipt | null> {
    this.refreshVerifiedDeploymentDeadline(now);
    const current = this.verifiedCurrent;
    if ((current.status !== 'active' && current.status !== 'retryable')
      || !current.deadline.canComplete || !this.ownsVerifiedDeployment()
      || current.transcript.length === 0 || !this.accountSession.completeVerifiedDeployment) return null;
    if (current.status === 'active' && !this.verifiedStorage.markTerminal(current.descriptor)) {
      this.verifiedCurrent = Object.freeze({
        status: 'failed',
        error: 'Verified deployment is unavailable. Try again.',
      });
      return null;
    }
    this.verifiedCurrent = Object.freeze({
      status: 'completion-pending',
      descriptor: current.descriptor,
      transcript: current.transcript,
      deadline: current.deadline,
      fieldOrder: current.fieldOrder,
    });
    const accountGeneration = this.verifiedAccountGeneration;
    const receipt = await this.accountSession.completeVerifiedDeployment(
      current.descriptor.sessionId,
      current.transcript,
    );
    const completedAt = Date.now();
    this.verifiedNow = completedAt;
    if (accountGeneration !== this.verifiedAccountGeneration || !this.ownsVerifiedDeployment()) return null;
    this.refreshVerifiedDeploymentDeadline(completedAt);
    if (receipt && receipt.result.sessionId === current.descriptor.sessionId
      && receipt.progression.evidence === 'verified_replay_v2') {
      this.verifiedStorage.clear(current.descriptor);
      this.verifiedCurrent = Object.freeze({ status: 'verified', receipt });
      return receipt;
    }
    const deadline = verifiedDeploymentDeadline(current.descriptor.expiresAt, completedAt);
    this.verifiedCurrent = deadline.canComplete
      ? Object.freeze({
          status: 'retryable',
          descriptor: current.descriptor,
          transcript: current.transcript,
          deadline,
          fieldOrder: current.fieldOrder,
          error: 'Verification is pending. Retry before the deployment deadline.',
        })
      : Object.freeze({
          status: 'expired',
          descriptor: current.descriptor,
          transcript: current.transcript,
          deadline,
          fieldOrder: null,
          choices: Object.freeze(['continue-casual', 'return-to-battery'] as const),
        });
    return null;
  }

  retryVerifiedDeploymentCompletion(now = Date.now()): Promise<VerifiedDeploymentReceipt | null> {
    if (this.refreshVerifiedDeploymentDeadline(now).status !== 'retryable') return Promise.resolve(null);
    return this.completeVerifiedDeployment(now);
  }

  async abandonVerifiedDeployment(): Promise<boolean> {
    const current = this.refreshVerifiedDeploymentDeadline(Date.now());
    if ((current.status !== 'active' && current.status !== 'retryable')
      || !current.deadline.canComplete || !this.ownsVerifiedDeployment()
      || !this.accountSession.abandonVerifiedDeployment) return false;
    const accountGeneration = this.verifiedAccountGeneration;
    let abandoned = false;
    try {
      abandoned = await this.accountSession.abandonVerifiedDeployment(current.descriptor.sessionId);
    } catch {
      return false;
    }
    const abandonedAt = Date.now();
    this.verifiedNow = abandonedAt;
    if (accountGeneration !== this.verifiedAccountGeneration || !this.ownsVerifiedDeployment()) return false;
    this.refreshVerifiedDeploymentDeadline(abandonedAt);
    if (!abandoned) return false;
    this.verifiedStorage.clear(current.descriptor);
    this.verifiedOwnerId = null;
    this.verifiedCurrent = Object.freeze({ status: 'idle' as const });
    return true;
  }

  continueVerifiedDeploymentCasually(): boolean {
    if (this.verifiedCurrent.status !== 'expired') return false;
    this.verifiedStorage.clear(this.verifiedCurrent.descriptor);
    this.verifiedOwnerId = null;
    this.verifiedCurrent = Object.freeze({ status: 'casual' as const });
    return true;
  }

  returnVerifiedDeploymentToBattery(): boolean {
    const current = this.verifiedCurrent;
    if (current.status !== 'expired' && current.status !== 'verified') return false;
    if (current.status === 'expired') this.verifiedStorage.clear(current.descriptor);
    this.verifiedOwnerId = null;
    this.verifiedCurrent = Object.freeze({ status: 'idle' as const });
    return true;
  }

  private ownsVerifiedDeployment(): boolean {
    const account = this.accountSession.state;
    return this.verifiedOwnerId !== null
      && account.status === 'authenticated'
      && account.profile.id === this.verifiedOwnerId;
  }

  private authenticatedAccountId(): string | null {
    const account = this.accountSession.state;
    return account.status === 'authenticated' ? account.profile.id : null;
  }

  freezeVerifiedDeploymentForAccountChange(): void {
    const current = this.verifiedCurrent;
    if (this.verifiedOwnerId === null || this.ownsVerifiedDeployment()
      || (current.status !== 'active' && current.status !== 'completion-pending'
        && current.status !== 'retryable' && current.status !== 'expired')) return;
    this.verifiedCurrent = Object.freeze({
      status: 'frozen',
      descriptor: current.descriptor,
      transcript: current.transcript,
      deadline: current.deadline,
      fieldOrder: null,
      error: 'Return to the deployment owner account to resume verification.',
    });
  }

  async revalidateFrozenVerifiedDeployment(recoveryGeneration: number): Promise<void> {
    const current = this.verifiedCurrent;
    if (current.status !== 'frozen' || !this.ownsVerifiedDeployment()
      || this.accountSession.state.status !== 'authenticated' || this.accountSession.state.busy
      || !this.accountSession.startVerifiedDeployment) return;
    let started: VerifiedDeploymentStart | null;
    try {
      started = await this.accountSession.startVerifiedDeployment();
    } catch {
      return;
    }
    const resumedAt = Date.now();
    this.verifiedNow = resumedAt;
    if (recoveryGeneration !== this.verifiedRecoveryGeneration
      || this.verifiedCurrent !== current || !this.ownsVerifiedDeployment()) return;
    const descriptor = parseVerifiedDeploymentDescriptor(started?.descriptor);
    if (!started || started.resumed !== true || !descriptor
      || !sameVerifiedDeploymentDescriptor(descriptor, current.descriptor)) return;
    const deadline = verifiedDeploymentDeadline(descriptor.expiresAt, resumedAt);
    if (!deadline.canComplete) return;
    const recovered = this.verifiedStorage.recover(descriptor);
    if (!recovered) return;
    this.verifiedCurrent = recovered.terminal
      ? Object.freeze({
          status: 'retryable',
          descriptor,
          transcript: recovered.transcript,
          deadline,
          fieldOrder: null,
          error: 'Verification is pending. Retry before the deployment deadline.',
        })
      : Object.freeze({ status: 'active', descriptor, transcript: recovered.transcript, deadline, fieldOrder: null });
  }

}
