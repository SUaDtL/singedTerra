using System;
using SingedTerra.LastStand;

// Fixture driver for test_shop.py. Prices and caps here are test values only.
internal static class Program
{
    private static readonly Func<int, int> Price = index => 3 + 4 * index;

    private static void Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("Expected one fixture case.");
        switch (args[0])
        {
            case "level":
                Console.WriteLine(
                    Level(new MechanicsShopTrack(5, 3, 2, Price)) + ";" +
                    Level(new MechanicsShopTrack(5, 3, 1, Price)) + ";" +
                    Level(new MechanicsShopTrack(5, 3, 0, Price)) + ";" +
                    RejectOverCap());
                break;
            case "price":
                Console.WriteLine(
                    Prices(0) + "|" + Prices(10));
                break;
            case "cap":
                Console.WriteLine(CapRefusal());
                break;
            case "lifecycle":
                Console.WriteLine(Lifecycle());
                break;
            case "invalid":
                Console.WriteLine(InvalidConfig());
                break;
            default:
                throw new ArgumentException("Unknown fixture case.");
        }
    }

    private static string Level(MechanicsShopTrack track) =>
        track.CurrentLevel + "," + track.RemainingPurchases;

    private static string Prices(int persistentLevel) =>
        LevelAndPrice(new MechanicsShopTrack(20, persistentLevel, 0, Price)) + ";" +
        LevelAndPrice(new MechanicsShopTrack(20, persistentLevel, 1, Price));

    private static string LevelAndPrice(MechanicsShopTrack track) =>
        track.CurrentLevel + "," + track.NextRunPrice;

    private static string RejectOverCap()
    {
        try { new MechanicsShopTrack(5, 4, 3, Price); }
        catch (ArgumentOutOfRangeException) { return "rejected"; }
        return "accepted";
    }

    private static string CapRefusal()
    {
        var track = new MechanicsShopTrack(5, 3, 1, Price);
        var before = track.CurrentLevel + "," + track.RemainingPurchases + "," + track.NextRunPrice;
        track.TryPurchase();
        var capped = track.CurrentLevel + "," + track.RemainingPurchases + "," + track.NextRunPrice;
        var refused = track.TryPurchase();
        var after = track.CurrentLevel + "," + track.RemainingPurchases + "," + track.NextRunPrice;
        track.StartNewRun();
        var fresh = track.RunPurchases + "," + track.CurrentLevel + "," +
            track.RemainingPurchases + "," + track.NextRunPrice;
        return before + ";" + capped + ";" + refused.ToString().ToLowerInvariant() +
            "," + after + ";" + fresh;
    }

    private static string Lifecycle()
    {
        var track = new MechanicsShopTrack(5, 2, 0, Price);
        track.TryPurchase();
        var resumed = track;
        var same = Object.ReferenceEquals(track, resumed);
        var before = resumed.RunPurchases + "," + resumed.CurrentLevel + "," + resumed.NextRunPrice;
        var afterResume = resumed.RunPurchases + "," + resumed.CurrentLevel + "," + resumed.NextRunPrice;
        track.StartNewRun();
        return same.ToString().ToLowerInvariant() + "," + before + ";" +
            same.ToString().ToLowerInvariant() + "," + afterResume + ";" +
            track.RunPurchases + "," + track.CurrentLevel + "," + track.NextRunPrice;
    }

    private static string InvalidConfig()
    {
        var zero = new MechanicsShopTrack(0, 0, 0, Price);
        var max = new MechanicsShopTrack(5, 5, 0, Price);
        var priceCalls = 0;
        var terminal = new MechanicsShopTrack(int.MaxValue, 0, int.MaxValue,
            index => { priceCalls++; return index; });
        var bounds = RejectInvalid(() => new MechanicsShopTrack(5, 4, 2, Price)) == "rejected" &&
            RejectInvalid(() => new MechanicsShopTrack(-1, 0, 0, Price)) == "rejected" &&
            RejectInvalid(() => new MechanicsShopTrack(5, -1, 0, Price)) == "rejected" &&
            RejectInvalid(() => new MechanicsShopTrack(5, 0, -1, Price)) == "rejected";
        return "zero:" + zero.TryPurchase().ToString().ToLowerInvariant() +
            ";max:" + max.TryPurchase().ToString().ToLowerInvariant() +
            ";bounds:" + (bounds ? "rejected" : "accepted") +
            ";price:" + RejectInvalid(() => new MechanicsShopTrack(5, 0, 0, null)) +
            ";terminal:" + RejectOverflow(() => { var ignored = terminal.NextRunPrice; }) +
            "," + (priceCalls == 0 ? "uncalled" : "called");
    }

    private static string RejectInvalid(Action construct)
    {
        try { construct(); }
        catch (ArgumentException) { return "rejected"; }
        return "accepted";
    }

    private static string RejectOverflow(Action project)
    {
        try { project(); }
        catch (OverflowException) { return "overflow"; }
        return "accepted";
    }
}
