namespace SingedTerra.Encounter
{
    // Stable domain identities shared by content and combat without importing
    // the mutable encounter owner into content-only consumers.
    public enum FoeKind { Close=0, Ranged=1, Swarmer=2, ArmoredBrute=3, SiegeElite=4 }
}
