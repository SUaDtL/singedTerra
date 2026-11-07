using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public interface ILastStandPurchaseSession
    {
        EncounterModel Model { get; }
        LastStandShopState Shop { get; }
        bool Paused { get; }
        bool CatchingUp { get; }
        string Failure { get; }
        void AdvanceAt(double timestamp);
        void ApplyShopProjection();
    }
}
