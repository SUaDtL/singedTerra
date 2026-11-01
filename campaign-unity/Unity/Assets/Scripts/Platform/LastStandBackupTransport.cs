using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

namespace SingedTerra.LastStand
{
    public enum LastStandBackupTransferStatus { Success, Cancelled, Failed, Unavailable }

    public sealed class LastStandBackupTransferResult
    {
        public LastStandBackupTransferStatus Status { get; }
        // Exact document bytes, never a path, URI, account value or raw exception.
        public byte[] Document { get; }
        public LastStandBackupTransferResult(LastStandBackupTransferStatus status, byte[] document = null)
        { Status = status; Document = document == null ? null : (byte[])document.Clone(); }
    }

    public interface ILastStandBackupTransport : IDisposable
    {
        bool Available { get; }
        bool Busy { get; }
        void Export(byte[] document, Action<LastStandBackupTransferResult> completed);
        void Import(Action<LastStandBackupTransferResult> completed);
        void Cancel();
    }

    /// <summary>Transport bounds only. The progression owner validates the backup schema.</summary>
    public static class LastStandBackupFiles
    {
        public const int MaximumBytes = 128 * 1024;
        public const int MaximumBase64Characters = ((MaximumBytes + 2) / 3) * 4;
        public const string Extension = ".laststand";
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);

        public static bool ValidDocument(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0 || bytes.Length > MaximumBytes) return false;
            try { Utf8.GetCharCount(bytes); return true; }
            catch (DecoderFallbackException) { return false; }
        }

        public static byte[] DecodeTransport(string encoded)
        {
            if (String.IsNullOrEmpty(encoded) || encoded.Length > MaximumBase64Characters || encoded.Length % 4 != 0)
                throw new InvalidDataException("Invalid backup transfer.");
            // Convert.FromBase64String accepts whitespace; this transport never emits it.
            foreach (char value in encoded)
                if (!((value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z') ||
                    (value >= '0' && value <= '9') || value == '+' || value == '/' || value == '='))
                    throw new InvalidDataException("Invalid backup transfer.");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(encoded); }
            catch (FormatException) { throw new InvalidDataException("Invalid backup transfer."); }
            if (!ValidDocument(bytes) || Convert.ToBase64String(bytes) != encoded)
                throw new InvalidDataException("Invalid backup transfer.");
            return bytes;
        }

        public static byte[] Read(Stream stream)
        {
            if (stream == null || !stream.CanRead) throw new InvalidDataException("Backup is unreadable.");
            if (stream.CanSeek && (stream.Length == 0 || stream.Length > MaximumBytes))
                throw new InvalidDataException("Backup exceeds the document limit.");
            using (var output = new MemoryStream())
            {
                var buffer = new byte[4096];
                int count;
                while ((count = stream.Read(buffer, 0, Math.Min(buffer.Length, MaximumBytes + 1 - (int)output.Length))) > 0)
                {
                    if (output.Length + count > MaximumBytes) throw new InvalidDataException("Backup exceeds the document limit.");
                    output.Write(buffer, 0, count);
                }
                byte[] bytes = output.ToArray();
                if (!ValidDocument(bytes)) throw new InvalidDataException("Backup is not bounded UTF-8.");
                return bytes;
            }
        }

        public static byte[] ReadSelectedFile(string path)
        {
            RequirePlainPath(path);
            using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) return Read(input);
        }

        public static void WriteSelectedFile(string path, byte[] document)
        {
            if (!ValidDocument(document)) throw new InvalidDataException("Backup is not bounded UTF-8.");
            if (!String.Equals(Path.GetExtension(path), Extension, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Use the Last Stand backup extension.");
            RequirePlainPath(path);
            string temporary = path + ".pending-" + Guid.NewGuid().ToString("N");
            try
            {
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { output.Write(document, 0, document.Length); output.Flush(true); }
                RequirePlainPath(path);
                // The OS picker obtained overwrite consent. Publish atomically; never
                // delete an existing destination before a replacement is durable.
                if (File.Exists(path)) File.Replace(temporary, path, null);
                else File.Move(temporary, path);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }

        static void RequirePlainPath(string path)
        {
            if (String.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path)) throw new InvalidDataException("Invalid selected file.");
            string current = Path.GetFullPath(path);
            while (!String.IsNullOrEmpty(current))
            {
                if ((File.Exists(current) || Directory.Exists(current)) &&
                    (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Linked backup paths are not supported.");
                current = Path.GetDirectoryName(current);
            }
        }

        public static string SuggestedName(DateTime utc) => "last-stand-backup-" +
            utc.ToUniversalTime().ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + Extension;
    }

    /// <summary>One request, one completion. Late platform callbacks cannot revive a closed UI.</summary>
    public sealed class LastStandBackupRequests : IDisposable
    {
        static int nextId;
        int active;
        bool disposed, importing;
        Action<LastStandBackupTransferResult> completion;
        public bool Busy => active != 0;
        public int ActiveId => active;

        public int Begin(bool import, Action<LastStandBackupTransferResult> callback)
        {
            if (callback == null) throw new ArgumentNullException(nameof(callback));
            if (disposed || Busy)
            { callback(new LastStandBackupTransferResult(LastStandBackupTransferStatus.Failed)); return 0; }
            int id = Interlocked.Increment(ref nextId);
            if (id <= 0) { disposed = true; callback(new LastStandBackupTransferResult(LastStandBackupTransferStatus.Failed)); return 0; }
            importing = import; completion = callback; active = id; return id;
        }

        public void Receive(string packet)
        {
            if (disposed || !Busy || packet == null || packet.Length > LastStandBackupFiles.MaximumBase64Characters + 32) return;
            int first = packet.IndexOf('|'), second = first < 0 ? -1 : packet.IndexOf('|', first + 1);
            if (first < 1 || first > 10 || second < 0 || second - first > 16) return;
            if (!Int32.TryParse(packet.Substring(0, first), NumberStyles.None, CultureInfo.InvariantCulture, out int id) || id != active) return;
            string status = packet.Substring(first + 1, second - first - 1), encoded = packet.Substring(second + 1);
            byte[] bytes = null;
            LastStandBackupTransferStatus result;
            if (status == "ok")
            {
                try
                {
                    if (importing) bytes = LastStandBackupFiles.DecodeTransport(encoded);
                    else if (encoded.Length != 0) throw new InvalidDataException("Unexpected export result.");
                    result = LastStandBackupTransferStatus.Success;
                }
                catch (InvalidDataException) { result = LastStandBackupTransferStatus.Failed; }
            }
            else if (status == "cancel" && encoded.Length == 0) result = LastStandBackupTransferStatus.Cancelled;
            else if (status == "unavailable" && encoded.Length == 0) result = LastStandBackupTransferStatus.Unavailable;
            else result = LastStandBackupTransferStatus.Failed;
            Complete(id, new LastStandBackupTransferResult(result, bytes));
        }

        public void Complete(int id, LastStandBackupTransferResult result)
        {
            if (disposed || id != active || active == 0) return;
            var callback = completion; active = 0; completion = null;
            callback(result);
        }
        public void Cancel()
        { if (Busy) Complete(active, new LastStandBackupTransferResult(LastStandBackupTransferStatus.Cancelled)); }
        public void Dispose() { disposed = true; active = 0; completion = null; }
    }
}
