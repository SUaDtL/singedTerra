using System;
using System.IO;
using System.Text;
using SingedTerra.LastStand;

namespace UnityEngine { public static class Application { public static string persistentDataPath; } }
namespace SingedTerra.LastStand { public static class LastStandProgression { public const string StorageKey = "singedTerra.lastStand.prototype.v1"; } }

static class BackupTransportChecks
{
    static void Check(bool value, string reason) { if (!value) throw new Exception(reason); }
    static void Deny(Action action) { try { action(); } catch (InvalidDataException) { return; } catch (IOException) { return; } catch (ArgumentException) { return; } throw new Exception("Invalid input accepted"); }
    sealed class Endless : Stream
    {
        public int Delivered;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count)
        { for (int i = 0; i < count; i++) buffer[offset + i] = 65; Delivered += count; return count; }
        public override void Flush() { }
        public override long Seek(long value, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    static string Packet(int id, string status, byte[] bytes = null) => id + "|" + status + "|" + (bytes == null ? "" : Convert.ToBase64String(bytes));
    static void Main(string[] args)
    {
        string mode = args[0], root = args[1];
        UnityEngine.Application.persistentDataPath = root;
        byte[] document = Encoding.UTF8.GetBytes("SINGED_TERRA_LAST_STAND_BACKUP 1\n{\"label\":\"snowman \u2603\"}");
        switch (mode)
        {
            case "bounded":
                Check(LastStandBackupFiles.ValidDocument(document), "valid UTF-8 rejected");
                foreach (var invalid in new[] { new byte[0], new byte[] { 0xc3, 0x28 }, new byte[] { 0xed, 0xa0, 0x80 }, new byte[131073] })
                    Check(!LastStandBackupFiles.ValidDocument(invalid), "invalid UTF-8/size accepted");
                byte[] limit = Encoding.ASCII.GetBytes(new string('x', 131072));
                Check(LastStandBackupFiles.Read(new MemoryStream(limit)).Length == 131072, "exact limit refused");
                Deny(() => LastStandBackupFiles.Read(new MemoryStream(new byte[131073])));
                var endless = new Endless(); Deny(() => LastStandBackupFiles.Read(endless));
                Check(endless.Delivered == 131073, "unbounded stream was consumed");
                break;
            case "base64":
                Check(Encoding.UTF8.GetString(LastStandBackupFiles.DecodeTransport(Convert.ToBase64String(document))) == Encoding.UTF8.GetString(document), "bytes changed");
                foreach (string invalid in new[] { "", "AB==", "Y Q==", "YQ=", "YQ===", "////", new string('A', 174768) })
                    Deny(() => LastStandBackupFiles.DecodeTransport(invalid));
                break;
            case "correlation":
                var requests = new LastStandBackupRequests(); int callbacks = 0;
                int first = requests.Begin(true, result => { callbacks++; Check(result.Status == LastStandBackupTransferStatus.Cancelled, "cancel outcome"); });
                requests.Cancel(); Check(callbacks == 1 && !requests.Busy, "cancel not settled");
                int second = requests.Begin(true, result => { callbacks++; Check(result.Status == LastStandBackupTransferStatus.Success && result.Document.Length == document.Length, "import outcome"); });
                requests.Receive(Packet(first, "ok", document)); Check(callbacks == 1 && requests.Busy, "stale callback accepted");
                requests.Receive(Packet(second, "ok", document)); requests.Receive(Packet(second, "ok", document));
                Check(callbacks == 2 && !requests.Busy, "duplicate callback accepted");
                break;
            case "cancel_dispose_busy":
                var gate = new LastStandBackupRequests(); int completed = 0, denied = 0;
                int active = gate.Begin(false, result => completed++);
                Check(gate.Begin(false, result => { denied++; Check(result.Status == LastStandBackupTransferStatus.Failed, "busy outcome"); }) == 0, "second operation admitted");
                Check(gate.ActiveId == active && denied == 1, "busy stole request");
                gate.Dispose(); gate.Receive(Packet(active, "ok")); gate.Cancel();
                Check(completed == 0 && !gate.Busy, "disposed callback escaped");
                break;
            case "bad_reply":
                var invalidGate = new LastStandBackupRequests(); int failures = 0;
                int invalidId = invalidGate.Begin(true, result => { Check(result.Status == LastStandBackupTransferStatus.Failed && result.Document == null, "bad reply became success"); failures++; });
                invalidGate.Receive(invalidId + "|ok|AB=="); Check(failures == 1 && !invalidGate.Busy, "invalid reply unresolved");
                int exportId = invalidGate.Begin(false, result => { Check(result.Status == LastStandBackupTransferStatus.Failed, "export accepted extra payload"); failures++; });
                invalidGate.Receive(Packet(exportId, "ok", document)); Check(failures == 2, "export callback missing");
                break;
            case "file_roundtrip":
                string path = Path.Combine(root, "progress.laststand");
                LastStandBackupFiles.WriteSelectedFile(path, document);
                Check(Convert.ToBase64String(LastStandBackupFiles.ReadSelectedFile(path)) == Convert.ToBase64String(document), "file bytes changed");
                byte[] replacement = Encoding.UTF8.GetBytes("replacement");
                LastStandBackupFiles.WriteSelectedFile(path, replacement);
                Check(File.ReadAllText(path) == "replacement", "replacement failed");
                Deny(() => LastStandBackupFiles.WriteSelectedFile(path, new byte[] { 255 }));
                Deny(() => LastStandBackupFiles.WriteSelectedFile(Path.Combine(root, "profile.slot0"), document));
                Deny(() => LastStandBackupFiles.WriteSelectedFile("relative.laststand", document));
                Check(File.ReadAllText(path) == "replacement" && Directory.GetFiles(root, "*.pending-*").Length == 0, "failed export changed destination");
                break;
            case "predecessor_isolation":
                using (var store = new LastStandStore())
                {
                    store.Read(); store.Write("current profile"); store.WriteRestoreBackup("previous profile");
                    Check(store.Read() == "current profile" && store.ReadRestoreBackup() == "previous profile", "predecessor replaced live profile");
                    using (var observer = new LastStandStore())
                    {
                        observer.Read(); Check(!observer.CanWrite, "second writer acquired live lease");
                        try { observer.WriteRestoreBackup("intruder"); throw new Exception("non-owner wrote predecessor"); }
                        catch (InvalidOperationException) { }
                    }
                    Check(store.ReadRestoreBackup() == "previous profile", "non-owner changed predecessor");
                }
                using (var reopened = new LastStandStore())
                    Check(reopened.Read() == "current profile" && reopened.ReadRestoreBackup() == "previous profile", "predecessor lost after restart");
                break;
            case "native_fallback":
                using (var store = new LastStandStore()) { store.Read(); store.Write("first"); store.Write("second"); }
                string keyHex = BitConverter.ToString(Encoding.UTF8.GetBytes(LastStandProgression.StorageKey)).Replace("-", "").ToLowerInvariant();
                File.WriteAllBytes(Path.Combine(root, "ls-" + keyHex + ".slot1"), new byte[] { 1 });
                using (var recovered = new LastStandStore())
                {
                    Check(recovered.Read() == "first" && recovered.RecoveredPreviousRecord, "fallback was not disclosed");
                    recovered.Write("next confirmed profile"); recovered.Read();
                    Check(recovered.RecoveredPreviousRecord, "a later save hid the recovery event before the player could inspect it");
                }
                break;
            default: throw new Exception("Unknown check");
        }
        Console.WriteLine("PASS " + mode);
    }
}
