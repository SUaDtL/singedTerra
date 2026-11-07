using System;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public enum LastStandRecoveryKind { Failed, General, Wave, Terminal, Abandoned, Started }
    public sealed class LastStandRecoveryResult
    {
        public LastStandRecoveryKind Kind { get; }
        public bool ReleaseResearchHold { get; }
        public string Error { get; }
        internal LastStandRecoveryResult(LastStandRecoveryKind kind, bool release = false, string error = null)
        { Kind = kind; ReleaseResearchHold = release; Error = error; }
    }

    // The profile remains the transaction owner. This coordinator owns the
    // pending application intents and the order in which recovery resumes them.
    public sealed class LastStandRunCoordinator
    {
        readonly LastStandProgression progression;
        public bool WavePending { get; private set; }
        public bool TerminalPending { get; private set; }
        public bool AbandonPending { get; private set; }
        public bool StartingPending { get; private set; }
        public bool ResearchPending { get; private set; }
        public bool HoldsRun => WavePending || TerminalPending || AbandonPending || ResearchPending;
        public LastStandRunCoordinator(LastStandProgression progression)
        { this.progression = progression ?? throw new ArgumentNullException(nameof(progression)); }
        public void ResearchFailed() { ResearchPending = true; }
        public void BeginRun() { WavePending = TerminalPending = false; }
        public void FinishAbandon() { AbandonPending = false; }
        public bool ReserveRun()
        {
            bool result = progression.TryDeploy();
            if (!result) StartingPending = progression.SaveState != "ready";
            return result;
        }
        public bool CommitWave(EncounterModel model, LastStandShopState shop, LastStandRunHistory history, Func<bool> reconcileResearch)
        {
            bool result = reconcileResearch() && progression.TryCommitWave(model, shop, history);
            WavePending = !result;
            return result;
        }
        public bool FinalizeRun(LastStandRunHistory history, LastStandShopState shop, bool abandon = false)
        {
            bool result = !progression.HasCheckpoint || progression.TryFinalizeRun(history, abandon ? "abandon" : "defeat", shop);
            if (!result) { if (abandon) AbandonPending = true; else TerminalPending = true; }
            return result;
        }
        public LastStandRecoveryResult Retry(EncounterModel model, LastStandShopState shop, LastStandRunHistory history,
            Func<bool> initializeResearch, Func<bool> reconcileResearch)
        {
            Func<string,LastStandRecoveryResult> Fail=error=>new LastStandRecoveryResult(LastStandRecoveryKind.Failed, error: error ?? progression.SaveError);
            if (!progression.Retry() || !initializeResearch() || progression.SaveState != "ready") return Fail(null);
            bool release = ResearchPending && model != null && !WavePending;
            ResearchPending = false;
            if (AbandonPending)
                return progression.HasCheckpoint ? Fail("Abandon is not confirmed.") : new LastStandRecoveryResult(LastStandRecoveryKind.Abandoned, release);
            if (WavePending && model != null)
            {
                bool committed = model.Status == EncounterStatus.Defeated ? progression.FinalizedRunId == shop.RunId :
                    progression.Checkpoint?.CompletedWave == model.CompletedWave;
                if (!committed && (!reconcileResearch() || !progression.TryCommitWave(model, shop, history)))
                    return Fail(progression.SaveError ?? "Checkpoint remains unconfirmed.");
                WavePending = false;
                return new LastStandRecoveryResult(LastStandRecoveryKind.Wave, release);
            }
            if (TerminalPending)
            {
                if (progression.HasCheckpoint && !progression.TryFinalizeRun(history, shop: shop)) return Fail(null);
                TerminalPending = false;
                return new LastStandRecoveryResult(LastStandRecoveryKind.Terminal, release);
            }
            if (StartingPending && progression.HasCheckpoint)
            { StartingPending = false; return new LastStandRecoveryResult(LastStandRecoveryKind.Started, release); }
            return new LastStandRecoveryResult(LastStandRecoveryKind.General, release);
        }
    }
}
