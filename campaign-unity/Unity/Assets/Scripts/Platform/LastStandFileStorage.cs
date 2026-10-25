using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace SingedTerra.LastStand
{
    /// <summary>
    /// Local durable record adapter. Two checksummed slots retain the preceding
    /// committed record while a new record is published. A checksum detects
    /// accidental corruption; it is not authentication or encryption.
    /// </summary>
    public sealed class LastStandFileStorage : ILastStandStorage, ILastStandStorageOwnership, IDisposable
    {
        const int ContainerVersion = 1;
        const int MaximumPayloadBytes = 4 * 1024 * 1024;
        const int MaximumKeyCharacters = 64;
        static readonly byte[] Magic = Encoding.ASCII.GetBytes("STLSSAVE");
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
        static readonly object ProcessLeaseGate = new object();
        static readonly HashSet<string> ProcessLeases = new HashSet<string>(
            Path.DirectorySeparatorChar == '\\' ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);
        readonly object gate = new object();
        readonly string root, key, prefix;
        readonly string[] slots;
        FileStream lease;
        bool disposed;

        sealed class Slot
        {
            public int Index;
            public bool Present, Valid;
            public long Sequence;
            public string Value;
        }

        public bool CanWrite
        {
            get
            {
                lock (gate)
                {
                    if (disposed) return false;
                    TryAcquireLease();
                    return lease != null;
                }
            }
        }
        public bool RecoveredPreviousRecord { get; private set; }

        public LastStandFileStorage(string rootDirectory, string recordKey)
        {
            if (String.IsNullOrWhiteSpace(rootDirectory) || !Path.IsPathRooted(rootDirectory))
                throw new ArgumentException("A native save requires an absolute root directory.", nameof(rootDirectory));
            if (String.IsNullOrEmpty(recordKey) || recordKey.Length > MaximumKeyCharacters || recordKey == "." || recordKey == "..")
                throw new ArgumentException("Invalid native save key.", nameof(recordKey));
            foreach (char ch in recordKey)
                if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
                    (ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '_'))
                    throw new ArgumentException("Native save keys cannot contain path components.", nameof(recordKey));
            root = Path.GetFullPath(rootDirectory);
            key = recordKey;
            ValidateDirectoryChain();
            Directory.CreateDirectory(root);
            ValidateDirectoryChain();
            // A bounded hexadecimal encoding is collision-free, even on a
            // case-insensitive filesystem. It cannot introduce path syntax.
            prefix = Path.Combine(root, "ls-" + Hex(Utf8.GetBytes(key)));
            slots = new[] { prefix + ".slot0", prefix + ".slot1" };
            TryAcquireLease();
        }

        void TryAcquireLease()
        {
            if (lease != null) return;
            ValidateDirectoryChain();
            string lockPath = prefix + ".lock";
            EnsurePlainFile(lockPath);
            lock (ProcessLeaseGate)
            {
                // Mono's Unix FileShare bookkeeping is process-local. Use an
                // OS range lock for other processes, and avoid even opening a
                // second local handle: POSIX locks belong to the process and
                // closing that other handle could release the owner's lock.
                if (ProcessLeases.Contains(prefix)) return;
                FileStream candidate = null;
                try
                {
                    candidate = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.ReadWrite);
                    candidate.Lock(0, 1);
                    ProcessLeases.Add(prefix);
                    lease = candidate;
                    candidate = null;
                }
                catch (IOException) { } // Contention or unavailable storage: no write ownership.
                finally { if (candidate != null) candidate.Dispose(); }
            }
        }

        public string Read()
        {
            lock (gate)
            {
                RequireOpen();
                // Acquire before returning bytes used by the owner's compare-
                // and-write check. Write itself never acquires a new lease: a
                // writer exiting between a read-only Read and Write must not
                // let this instance publish a stale preference/profile value.
                TryAcquireLease();
                var best = Current();
                return best == null ? null : best.Value;
            }
        }

        public void Write(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            lock (gate)
            {
                RequireOpen();
                if (lease == null) throw new InvalidOperationException("Native save is owned by another writer.");
                byte[] payload = Utf8.GetBytes(value);
                if (payload.Length > MaximumPayloadBytes) throw new InvalidDataException("Native save exceeds the record size limit.");
                Slot previous = Current();
                long sequence = previous == null ? 1 : checked(previous.Sequence + 1);
                int next = previous == null ? 0 : 1 - previous.Index;
                byte[] bytes = Encode(sequence, payload);
                string temporary = prefix + ".pending-" + Guid.NewGuid().ToString("N");
                try
                {
                    using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        file.Write(bytes, 0, bytes.Length);
                        file.Flush(true);
                    }
                    // Removing only the inactive slot is safe if interrupted:
                    // the current committed slot remains intact throughout.
                    EnsurePlainFile(slots[next]);
                    if (File.Exists(slots[next])) File.Delete(slots[next]);
                    File.Move(temporary, slots[next]);
                    Slot confirmed = ReadSlot(next);
                    if (!confirmed.Valid || confirmed.Sequence != sequence || confirmed.Value != value)
                        throw new IOException("Native save readback did not confirm the write.");
                }
                finally
                {
                    if (File.Exists(temporary)) File.Delete(temporary);
                }
            }
        }

        Slot Current()
        {
            ValidateDirectoryChain();
            Slot first = ReadSlot(0), second = ReadSlot(1);
            RecoveredPreviousRecord = (first.Present && !first.Valid) || (second.Present && !second.Valid);
            if (!first.Valid && !second.Valid)
            {
                if (first.Present || second.Present)
                    throw new InvalidDataException("No valid committed native save record remains; refusing to create fresh progress.");
                return null;
            }
            if (first.Valid && second.Valid && first.Sequence == second.Sequence)
                throw new InvalidDataException("Ambiguous native save sequences; refusing to choose a record.");
            if (!first.Valid) return second;
            if (!second.Valid) return first;
            return first.Sequence > second.Sequence ? first : second;
        }

        Slot ReadSlot(int index)
        {
            string path = slots[index];
            EnsurePlainFile(path);
            var result = new Slot { Index = index, Present = File.Exists(path) };
            if (!result.Present) return result;
            byte[] bytes;
            try
            {
                using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (file.Length > MaximumPayloadBytes + 256 || file.Length < 12) return result;
                    bytes = new byte[checked((int)file.Length)];
                    int read = 0;
                    while (read < bytes.Length)
                    {
                        int count = file.Read(bytes, read, bytes.Length - read);
                        if (count == 0) return result;
                        read += count;
                    }
                }
            }
            catch (FileNotFoundException) { result.Present = false; return result; }
            try
            {
                using (var stream = new MemoryStream(bytes, false))
                using (var reader = new BinaryReader(stream, Utf8))
                {
                    if (!Equal(reader.ReadBytes(Magic.Length), Magic)) return result;
                    // Future formats must not silently fall back to an older
                    // record and then overwrite a newer application's save.
                    if (reader.ReadInt32() != ContainerVersion)
                        throw new NotSupportedException("Unsupported native save container version.");
                    long sequence = reader.ReadInt64();
                    int keyLength = reader.ReadInt32();
                    if (sequence < 1 || keyLength < 1 || keyLength > MaximumKeyCharacters) return result;
                    if (Utf8.GetString(reader.ReadBytes(keyLength)) != key) return result;
                    int payloadLength = reader.ReadInt32();
                    if (payloadLength < 0 || payloadLength > MaximumPayloadBytes ||
                        stream.Length - stream.Position != payloadLength + 4L) return result;
                    byte[] payload = reader.ReadBytes(payloadLength);
                    if (reader.ReadUInt32() != Checksum(bytes, bytes.Length - 4)) return result;
                    result.Value = Utf8.GetString(payload);
                    result.Sequence = sequence;
                    result.Valid = true;
                }
            }
            catch (EndOfStreamException) { }
            catch (DecoderFallbackException) { }
            return result;
        }

        byte[] Encode(long sequence, byte[] payload)
        {
            using (var stream = new MemoryStream())
            {
                using (var writer = new BinaryWriter(stream, Utf8, true))
                {
                    byte[] keyBytes = Utf8.GetBytes(key);
                    writer.Write(Magic);
                    writer.Write(ContainerVersion);
                    writer.Write(sequence);
                    writer.Write(keyBytes.Length);
                    writer.Write(keyBytes);
                    writer.Write(payload.Length);
                    writer.Write(payload);
                    writer.Flush();
                    byte[] body = stream.ToArray();
                    writer.Write(Checksum(body, body.Length));
                }
                return stream.ToArray();
            }
        }

        void ValidateDirectoryChain()
        {
            for (var directory = new DirectoryInfo(root); directory != null; directory = directory.Parent)
                if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0)
                    throw new IOException("Native save root cannot traverse a linked directory.");
        }

        static void EnsurePlainFile(string path)
        {
            if (Directory.Exists(path) || (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0))
                throw new IOException("Native save path is not a regular file.");
        }

        // Standard CRC-32/ISO-HDLC over all header, identity and payload bytes.
        // This detects accidental damage; it provides no authenticity guarantee.
        static uint Checksum(byte[] bytes, int count)
        {
            uint crc = 0xffffffffu;
            for (int i = 0; i < count; i++)
            {
                crc ^= bytes[i];
                for (int bit = 0; bit < 8; bit++)
                    crc = (crc >> 1) ^ ((crc & 1) == 0 ? 0u : 0xedb88320u);
            }
            return crc ^ 0xffffffffu;
        }

        static string Hex(byte[] bytes)
        { return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }

        static bool Equal(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return false;
            int difference = 0;
            for (int n = 0; n < a.Length; n++) difference |= a[n] ^ b[n];
            return difference == 0;
        }

        void RequireOpen()
        { if (disposed) throw new ObjectDisposedException(nameof(LastStandFileStorage)); }

        public void Dispose()
        {
            lock (gate)
            {
                if (disposed) return;
                disposed = true;
                if (lease != null)
                    lock (ProcessLeaseGate)
                    {
                        try { lease.Dispose(); }
                        finally
                        {
                            lease = null;
                            ProcessLeases.Remove(prefix);
                        }
                    }
            }
        }
    }
}
