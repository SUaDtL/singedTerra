using System;
using System.Collections.Generic;
using System.Linq;
using SingedTerra.LastStand;

static class SelectionChecks
{
    static void Require(bool value, string message)
    { if (!value) throw new InvalidOperationException(message); }
    static void Reject<T>(Action action, string message) where T : Exception
    {
        try { action(); } catch (T) { return; }
        throw new InvalidOperationException(message);
    }
    static LastStandSelectionOption Option(string id, bool unlocked = true) =>
        new LastStandSelectionOption(id, "Choice " + id, "Description for " + id, unlocked);
    static LastStandSelectionOption[] Catalog(int total, int unlocked) =>
        Enumerable.Range(1, total).Select(i => Option("tier-" + i, i <= unlocked)).ToArray();

    static void LargeCatalog()
    {
        var selector = new LastStandSelection(Catalog(24, 24), "tier-1", true);
        Require(selector.Count == 24, "all 24 real catalog choices are represented");
        Require(!selector.CanPrevious && selector.CanNext, "initial endpoints are truthful");
        Require(!selector.Move(-1) && selector.Current.Id == "tier-1", "previous does not wrap");
        for (int i = 2; i <= 24; i++)
            Require(selector.Move(1) && selector.Current.Id == "tier-" + i, "every choice is reachable in order");
        Require(!selector.CanNext && selector.CanPrevious, "last endpoints are truthful");
        Require(!selector.Move(1) && selector.Current.Id == "tier-24", "next does not wrap");
        for (int i = 23; i >= 1; i--)
            Require(selector.Move(-1) && selector.Current.Id == "tier-" + i, "reverse browsing retains identity");
    }
    static void LockedPreview()
    {
        var catalog = Catalog(24, 17);
        // A later unlocked entry must not reveal content beyond the first lock.
        catalog[20] = Option("tier-21", true);
        var selector = new LastStandSelection(catalog, "tier-17", true);
        Require(selector.Count == 18, "visibility stops after first locked preview");
        Require(selector.Move(1) && selector.Current.Id == "tier-18" && !selector.Current.Unlocked,
            "first locked choice is available only as a preview");
        Require(!selector.CanNext && !selector.Move(1), "hidden choices cannot be browsed");
        Require(catalog[17].Unlocked == false, "browsing does not unlock the source catalog");
        Reject<ArgumentException>(() => selector.Reset("tier-18"), "locked choice cannot become selected");
        Require(selector.Current.Id == "tier-18", "failed reset preserves current preview");
        selector.Reset("tier-17");
        Require(selector.Current.Id == "tier-17" && selector.Current.Unlocked, "closing preview restores committed identity");
        Reject<ArgumentException>(() => selector.Reset("tier-21"), "hidden unlocked choice cannot be selected");
    }
    static void StableIdentity()
    {
        var a = new LastStandSelection(new[] { Option("repair"), Option("launcher"), Option("third") }, "third", false);
        Require(a.Current.Id == "third" && a.Index == 2, "third fitting is selected by identity");
        var b = new LastStandSelection(new[] { Option("third"), Option("repair"), Option("launcher") }, "third", false);
        Require(b.Current.Id == "third" && b.Index == 0, "catalog reordering never reinterprets selected identity");
        b.Reset("launcher"); Require(b.Current.Id == "launcher", "reset resolves another explicit identity");
        var numeric = new LastStandSelection(new[] { Option("1"), Option("18") }, "18", false);
        Require(numeric.Current.Id == "18", "numeric tier identifiers remain supported");
    }
    static void ImmutableCapture()
    {
        var source = new List<LastStandSelectionOption> { Option("repair"), Option("launcher") };
        var selector = new LastStandSelection(source, "repair", false);
        source[0] = Option("replacement"); source.Clear();
        Require(selector.Count == 2 && selector.Current.Id == "repair", "source list mutation cannot alter captured catalog");
        var exposed = selector.Options as IList<LastStandSelectionOption>;
        Require(exposed != null && exposed.IsReadOnly, "exposed options are read-only");
        Reject<NotSupportedException>(() => exposed[0] = Option("replacement"), "exposed options cannot be overwritten");
    }
    static void InvalidCatalog()
    {
        Reject<ArgumentNullException>(() => new LastStandSelection(null, "repair", true), "null catalog refused");
        Reject<ArgumentException>(() => new LastStandSelection(new LastStandSelectionOption[0], "repair", true), "empty catalog refused");
        Reject<ArgumentException>(() => new LastStandSelection(new LastStandSelectionOption[] { null }, "repair", true), "missing option refused");
        Reject<ArgumentException>(() => new LastStandSelection(new[] { Option("repair"), Option("repair") }, "repair", true), "duplicate identity refused");
        Reject<ArgumentException>(() => new LastStandSelection(new[] { Option("repair"), Option("locked", false), Option("hidden"), Option("hidden") }, "repair", true), "hidden duplicate identity refused");
        Reject<ArgumentException>(() => new LastStandSelection(new[] { Option("locked", false) }, "locked", true), "all-locked catalog cannot select a playable choice");
    }
    static void InvalidInput()
    {
        foreach (string id in new[] { "", " ", "../repair", "Repair", "repair/key", "-repair", "repair?x", new string('a', 81) })
            Reject<ArgumentException>(() => Option(id), "unsafe identity refused: " + id);
        Reject<ArgumentException>(() => new LastStandSelectionOption("repair", " ", "description"), "empty display name refused");
        Reject<ArgumentException>(() => new LastStandSelectionOption("repair", "Repair", " "), "empty description refused");
        var selector = new LastStandSelection(new[] { Option("repair"), Option("launcher") }, "repair", false);
        foreach (int direction in new[] { 0, 2, -2, int.MinValue, int.MaxValue })
            Reject<ArgumentOutOfRangeException>(() => selector.Move(direction), "invalid navigation direction refused");
        Reject<ArgumentException>(() => selector.Reset("missing"), "unknown reset identity refused");
        Require(selector.Current.Id == "repair", "rejected input preserves the current choice");
    }
    static void SingleChoice()
    {
        var selector = new LastStandSelection(new[] { Option("only") }, "only", true);
        Require(selector.Count == 1 && !selector.CanPrevious && !selector.CanNext, "single-choice endpoints disabled");
        Require(!selector.Move(-1) && !selector.Move(1), "single choice never wraps");
    }
    static void FittingCatalog()
    {
        Require(LastStandFittingCatalog.Options.Select(o => o.Id).SequenceEqual(new[] { "repair", "launcher" }), "real catalog contains only the two implemented fittings");
        Require(LastStandFittingCatalog.Options.All(o => o.Unlocked && !string.IsNullOrWhiteSpace(o.Description)), "available fittings provide actual descriptions");
        var selector = new LastStandSelection(LastStandFittingCatalog.Options, "repair", false);
        Require(selector.Current.Name == "Field Repair", "current fitting name is explicit");
        Require(selector.Move(1) && selector.Current.Name == "Auxiliary Launcher", "next fitting has explicit identity and name");
        Require(!selector.Move(1), "real fitting catalog has a bounded endpoint");
    }
    public static int Main(string[] args)
    {
        var cases = new Dictionary<string, Action> {
            { "large_catalog", LargeCatalog }, { "locked_preview", LockedPreview },
            { "stable_identity", StableIdentity }, { "immutable_capture", ImmutableCapture },
            { "invalid_catalog", InvalidCatalog }, { "invalid_input", InvalidInput },
            { "single_choice", SingleChoice }, { "fitting_catalog", FittingCatalog }
        };
        try { cases[args[0]](); Console.WriteLine("PASS " + args[0]); return 0; }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
