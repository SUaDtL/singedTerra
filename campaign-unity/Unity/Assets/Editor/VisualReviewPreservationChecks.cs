using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

// Exercises the actual preservation predicate with independently pinned Git blob
// hashes. All alternate/mutated byte sequences stay in memory; no asset is edited.
public static class VisualReviewPreservationChecks
{
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    static void Require(bool condition, string message)
    { if (!condition) throw new InvalidOperationException("Visual review preservation check failed: " + message); }
    static string Hash(byte[] bytes)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }

    public static void Run()
    {
        var proof = File.ReadAllBytes("Assets/VisualReview/preservation-compatibility.json");
        VisualReviewBuild.VerifyCompatibilityProofBytes(proof);
        var alteredProof = proof.ToArray(); alteredProof[alteredProof.Length / 2] ^= 1;
        bool rejected = false;
        try { VisualReviewBuild.VerifyCompatibilityProofBytes(alteredProof); }
        catch (InvalidOperationException) { rejected = true; }
        Require(rejected, "altered compatibility proof rejected");
        Check("Assets/Art/PartsLibrary/catalog.json",
            "a68c63e92e14e43401398d5f64e96f3060376e9b2df5da58c97c97c5a6464b84",
            "a2d9998ff8afeb8d6a9f3e821fa232b71185135e5010a1d69fae4ddbc0c87643");
        Check("Assets/Art/art-manifest.json",
            "61313f8b4c095916587bcd8fdda344ed54b4a4cc7c850802f983908ebec7b4fd",
            "b64ec0459ca0eb74f8f522e89f1cb8a5b616b4ccb3235f95866980d9b26c2227");
        Require(!VisualReviewBuild.MatchesProtectedHash("Assets/Art/Other.json", "original", "changed"),
            "unlisted files retain exact-byte protection");
        var binary = File.ReadAllBytes("Assets/Art/StarterTank_A.fbx");
        string binaryBefore = Hash(binary); binary[binary.Length - 1] ^= 1;
        Require(!VisualReviewBuild.MatchesProtectedHash("Assets/Art/StarterTank_A.fbx", binaryBefore, Hash(binary)),
            "retained binary asset mutation rejected");
        Debug.Log("ST_VIS_PRESERVATION_PASS two original raw and committed LF representations; content, whitespace, encoding, path, proof and historical-hash mutations rejected");
    }

    static void Check(string path, string rawSha256, string lfSha256)
    {
        string text = Utf8.GetString(File.ReadAllBytes(path)).Replace("\r\n", "\n");
        Require(!text.Contains('\r'), "known JSON has no lone CR: " + path);
        byte[] lf = Utf8.GetBytes(text), raw = Utf8.GetBytes(text.Replace("\n", "\r\n"));
        Require(Hash(lf) == lfSha256 && Hash(raw) == rawSha256, "independent committed and historical bytes: " + path);
        Require(VisualReviewBuild.MatchesProtectedHash(path, rawSha256, Hash(raw)), "original raw bytes: " + path);
        var changedField = lf.ToArray();
        int letter = Array.FindIndex(changedField, value => value >= (byte)'a' && value <= (byte)'z');
        Require(letter >= 0, "JSON key available for meaningful mutation");
        changedField[letter] = changedField[letter] == (byte)'z' ? (byte)'y' : (byte)(changedField[letter] + 1);
        foreach (var changed in new[] { changedField, lf.Concat(new byte[] { 32 }).ToArray(),
            new byte[] { 239, 187, 191 }.Concat(lf).ToArray(), lf.Concat(new byte[] { 13 }).ToArray() })
            Require(!VisualReviewBuild.MatchesProtectedHash(path, rawSha256, Hash(changed)), "mutation rejected: " + path);
        Require(!VisualReviewBuild.MatchesProtectedHash(path + ".other", rawSha256, lfSha256), "compatibility cannot escape exact path");
        Require(VisualReviewBuild.MatchesProtectedHash(path, rawSha256, Hash(lf)), "committed LF bytes: " + path);
        Require(!VisualReviewBuild.MatchesProtectedHash(path, "wrong-history", lfSha256), "changed historical proof rejected");
        Require(!VisualReviewBuild.MatchesProtectedHash(path, lfSha256, lfSha256), "LF hash cannot replace historical raw proof");
    }
}
