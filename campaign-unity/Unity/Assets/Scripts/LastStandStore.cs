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

    public sealed class LastStandStore : ILastStandStorage,ILastStandStorageOwnership,ILastStandStorageDiagnostics,IDisposable
    {
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
        LastStandFileStorage native;
        LastStandFileStorage Native => native ?? (native = new LastStandFileStorage(UnityEngine.Application.persistentDataPath, LastStandProgression.StorageKey));
#endif
        public void Dispose()
        {
#if (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
            native?.Dispose();
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
            return Native.Read();
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
    }
}
