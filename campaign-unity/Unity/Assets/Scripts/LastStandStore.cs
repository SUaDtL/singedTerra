using System;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace SingedTerra.LastStand
{
    public interface ILastStandStorage
    {
        string Read();
        void Write(string value);
    }
    public interface ILastStandStorageOwnership { bool CanWrite { get; } }
    public interface ILastStandStorageDiagnostics { string OwnershipError { get; } }
    public interface ILastStandRestoreBackupStorage
    {
        string ReadRestoreBackup();
        void WriteRestoreBackup(string confirmedProfile);
    }
    public interface ILastStandStorageRecoveryDiagnostics { bool RecoveredPreviousRecord { get; } }

    public sealed class LastStandStore : ILastStandStorage,ILastStandStorageOwnership,ILastStandStorageDiagnostics,
        ILastStandRestoreBackupStorage,ILastStandStorageRecoveryDiagnostics,IDisposable
    {
        public const string RestoreBackupKey = "singedTerra.lastStand.restore.v1";
        const int MaximumRestoreBackupBytes = 128 * 1024;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern string LastStandStorage_Get(string key);
        [DllImport("__Internal")]
        private static extern int LastStandStorage_Set(string key, string value);
        [DllImport("__Internal")]
        private static extern int LastStandStorage_CanWrite();
#endif
        public bool CanWrite
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                return LastStandStorage_CanWrite()==1;
#elif (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
                try { return Native.CanWrite; } catch (System.IO.IOException) { return false; } catch (UnauthorizedAccessException) { return false; }
#else
                return true;
#endif
            }
        }

        public string OwnershipError
        {
            get
            {
#if UNITY_WEBGL || UNITY_EDITOR
                return "This tab cannot save. Another Last Stand tab may own this profile, or this browser does not support save ownership. Close the other tab and reload here.";
#else
                return "This device cannot save the profile. Another game instance may own it, or local storage is unavailable. Close the other instance and restart the game.";
#endif
            }
        }
#if (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
        LastStandFileStorage native, restoreBackup;
        bool recoveredPrevious;
        LastStandFileStorage Native => native ?? (native = new LastStandFileStorage(LastStandNativeStorageRoot.Current, LastStandProgression.StorageKey));
        LastStandFileStorage RestoreBackup => restoreBackup ?? (restoreBackup = new LastStandFileStorage(LastStandNativeStorageRoot.Current, RestoreBackupKey));
#endif
        public bool RecoveredPreviousRecord
        {
            get
            {
#if (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
                return recoveredPrevious;
#else
                return false;
#endif
            }
        }
        public void Dispose()
        {
#if (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
            native?.Dispose();
            restoreBackup?.Dispose();
#endif
        }
        public string Read()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            var response = LastStandStorage_Get(LastStandProgression.StorageKey);
            if (response == "0") return null;
            if (response != null && response.Length > 1 && response[0] == '1')
                return response.Substring(1);
            throw new InvalidOperationException("Web localStorage read failed.");
#elif UNITY_EDITOR
            return UnityEngine.PlayerPrefs.HasKey(LastStandProgression.StorageKey)
                ? UnityEngine.PlayerPrefs.GetString(LastStandProgression.StorageKey)
                : null;
#elif UNITY_ANDROID || UNITY_STANDALONE
            string value = Native.Read();
            // Keep the recovery event visible for this session even if research
            // or a checkpoint subsequently commits a new healthy record.
            recoveredPrevious |= Native.RecoveredPreviousRecord;
            return value;
#else
            throw new PlatformNotSupportedException("Last Stand local save requires WebGL or Unity Editor.");
#endif
        }

        public void Write(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
#if UNITY_WEBGL && !UNITY_EDITOR
            if (LastStandStorage_Set(LastStandProgression.StorageKey, value) != 1)
                throw new InvalidOperationException("Web localStorage write failed.");
#elif UNITY_EDITOR
            UnityEngine.PlayerPrefs.SetString(LastStandProgression.StorageKey, value);
            UnityEngine.PlayerPrefs.Save();
#elif UNITY_ANDROID || UNITY_STANDALONE
            Native.Write(value);
#else
            throw new PlatformNotSupportedException("Last Stand local save requires WebGL or Unity Editor.");
#endif
        }

        public string ReadRestoreBackup()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            var response = LastStandStorage_Get(RestoreBackupKey);
            if (response == "0") return null;
            if (response != null && response.Length > 1 && response[0] == '1') return response.Substring(1);
            throw new InvalidOperationException("Backup storage read failed.");
#elif UNITY_EDITOR
            return UnityEngine.PlayerPrefs.HasKey(RestoreBackupKey) ? UnityEngine.PlayerPrefs.GetString(RestoreBackupKey) : null;
#elif UNITY_ANDROID || UNITY_STANDALONE
            return RestoreBackup.Read();
#else
            throw new PlatformNotSupportedException("Backup storage is unavailable.");
#endif
        }

        public void WriteRestoreBackup(string confirmedProfile)
        {
            if (confirmedProfile == null || confirmedProfile.Length > MaximumRestoreBackupBytes ||
                new System.Text.UTF8Encoding(false, true).GetByteCount(confirmedProfile) > MaximumRestoreBackupBytes)
                throw new ArgumentException("Invalid predecessor record.", nameof(confirmedProfile));
            // The independent predecessor slot never grants ownership of the live profile.
            if (!CanWrite) throw new InvalidOperationException("Profile is owned by another instance.");
#if UNITY_WEBGL && !UNITY_EDITOR
            if (LastStandStorage_Set(RestoreBackupKey, confirmedProfile) != 1)
                throw new InvalidOperationException("Backup storage write failed.");
#elif UNITY_EDITOR
            UnityEngine.PlayerPrefs.SetString(RestoreBackupKey, confirmedProfile);
            UnityEngine.PlayerPrefs.Save();
#elif UNITY_ANDROID || UNITY_STANDALONE
            RestoreBackup.Write(confirmedProfile);
#else
            throw new PlatformNotSupportedException("Backup storage is unavailable.");
#endif
        }
    }
}
