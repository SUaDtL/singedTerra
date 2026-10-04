using System;
using SingedTerra.LastStand;

internal sealed class FakeStorage : ILastStandStorage
{
    public string Value;
    public bool FailRead;
    public bool FailWrite;
    public bool FailNextRead;
    public bool WriteThenFailRead;
    public bool MismatchAfterWrite;
    public bool MismatchNextRead;
    public string Read()
    {
        if (FailRead || FailNextRead) { FailNextRead = false; throw new Exception("read failed"); }
        if (MismatchNextRead) { MismatchNextRead = false; return "mismatch"; }
        return Value;
    }
    public void Write(string value)
    {
        if (FailWrite) throw new Exception("write failed");
        Value = value;
        if (WriteThenFailRead) { WriteThenFailRead = false; FailNextRead = true; }
        if (MismatchAfterWrite) { MismatchAfterWrite = false; MismatchNextRead = true; }
    }
}

internal static class Program
{
    private static void Main(string[] args)
    {
        var storage = new FakeStorage();
        var model = LastStandProgression.Load(storage);
        switch (args[0])
        {
            case "defeat":
                var deployed = model.TryDeploy();
                var staged = model.TryStageDefeat(42, 3);
                var claimed = model.TryClaim();
                var duplicate = model.TryClaim();
                Console.WriteLine($"{deployed},{staged},{claimed},{duplicate},{model.Wallet},{model.CannonAttackLevel},{model.FinalizedRunId}");
                break;
            case "excluded":
                var firstDeploy = model.TryDeploy();
                model.AbandonRun();
                var noClaim = model.TryClaim();
                var secondDeploy = model.TryDeploy();
                var noHorizon = model.TryStageNonDefeat();
                Console.WriteLine($"{firstDeploy},{secondDeploy},{model.Wallet},{noClaim},{model.FinalizedRunId},{noHorizon}");
                break;
            case "upgrade":
                var frozen = model.CannonDamage;
                model.TryDeploy();
                var refusedDuringRun = model.TryPurchase();
                storage.Value = "{\"version\":1,\"credits\":6,\"permanentLevel\":0,\"nextRunId\":2,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}";
                var live = model.CannonDamage;
                model.AbandonRun();
                model = LastStandProgression.Load(storage);
                var price = model.NextCost;
                model.TryPurchase();
                var first = model.CannonDamage;
                var secondPrice = model.NextCost;
                model.TryPurchase();
                var second = model.CannonDamage;
                var thirdPrice = model.NextCost;
                model.TryPurchase();
                var third = model.CannonDamage;
                var cap = model.TryPurchase();
                var empty = LastStandProgression.Load(new FakeStorage());
                var insufficient = empty.TryPurchase();
                Console.WriteLine($"{frozen},{live},{price},{first},{model.CannonAttackLevel - 2},{secondPrice},{second},{thirdPrice},{third},{cap},{model.CannonAttackLevel},{model.Wallet},{refusedDuringRun},{insufficient},{empty.Wallet},{empty.CannonAttackLevel}");
                break;
            case "reload":
                model.TryDeploy();
                model.TryStageDefeat(7, 4);
                var exactSchema = storage.Value.Contains("\"credits\":0") &&
                    storage.Value.Contains("\"permanentLevel\":0") &&
                    storage.Value.Contains("\"lastFinalizedRunId\":0") &&
                    !storage.Value.Contains("\"wallet\"") &&
                    !storage.Value.Contains("\"cannonAttackLevel\"") &&
                    !storage.Value.Contains("\"finalizedRunId\"");
                var restored = LastStandProgression.Load(storage);
                var pending = restored.PendingDefeat;
                var shape = pending == null ? "missing pending" : $"{restored.NextRunId},{restored.FinalizedRunId},{pending.RunId},{pending.ElapsedTicks},{pending.Kills},{pending != null}";
                storage.Value = storage.Value.Replace("\"nextRunId\":2", "\"nextRunId\":3");
                var stale = LastStandProgression.Load(storage);
                var staleState = stale.SaveState;
                storage.Value = "{\"version\":2,\"credits\":0,\"permanentLevel\":0,\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}";
                var blocked = LastStandProgression.Load(storage);
                storage.Value = "{\"version\":01,\"credits\":0,\"permanentLevel\":0,\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}";
                var leadingZero = LastStandProgression.Load(storage).SaveState;
                storage.Value = "{\"version\":1,\"credits\":0,\"permanentLevel\":0,\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}\v";
                var invalidWhitespace = LastStandProgression.Load(storage).SaveState;
                Console.WriteLine($"{shape};{exactSchema};{staleState};{blocked.TryDeploy()},{blocked.SaveState};{leadingZero},{invalidWhitespace}");
                break;
            case "failure":
                model.TryDeploy();
                model.TryStageDefeat(9, 2);
                storage.FailWrite = true;
                var failure = model.TryClaim();
                var oldWallet = model.Wallet;
                var hasPending = model.PendingDefeat != null;
                storage.FailWrite = false;
                var retry = model.Retry();
                var unreadable = new FakeStorage { FailRead = true };
                var initialBlocked = LastStandProgression.Load(unreadable);
                Console.WriteLine($"{failure},{oldWallet},{hasPending},{retry},{model.Wallet},{model.TryClaim()},{model.FinalizedRunId},{initialBlocked.SaveState},{initialBlocked.TryDeploy()}");
                break;
            case "uncertain":
                model.TryDeploy();
                model.TryStageDefeat(9, 2);
                storage.WriteThenFailRead = true;
                var uncertain = model.TryClaim();
                var before = model.Wallet;
                var reconciled = model.Retry();
                var mismatchStorage = new FakeStorage();
                var mismatchModel = LastStandProgression.Load(mismatchStorage);
                mismatchModel.TryDeploy();
                mismatchModel.TryStageDefeat(3, 1);
                mismatchStorage.MismatchAfterWrite = true;
                var mismatch = mismatchModel.TryClaim();
                var preserved = mismatchModel.Wallet == 0 && mismatchModel.PendingDefeat != null;
                var mismatchRetry = mismatchModel.Retry();
                Console.WriteLine($"{uncertain},{before},{reconciled},{model.Wallet},{model.TryClaim()},{model.FinalizedRunId},{mismatch},{preserved},{mismatchRetry},{mismatchModel.Wallet}");
                break;
        }
    }
}
