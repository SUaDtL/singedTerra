using System;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace SingedTerra.LastStand
{
    // Uses the existing storage bridge with a separate key. No path in this
    // adapter can write, migrate or reset the gameplay progression record.
    public sealed class LastStandPreferencesStore : ILastStandStorage,IDisposable
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern string LastStandStorage_Get(string key);
        [DllImport("__Internal")]
        private static extern int LastStandStorage_Set(string key, string value);
#endif
#if (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
        LastStandFileStorage native;
        LastStandFileStorage Native => native ?? (native = new LastStandFileStorage(UnityEngine.Application.persistentDataPath, LastStandPreferences.StorageKey));
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
            var response = LastStandStorage_Get(LastStandPreferences.StorageKey);
            if (response == "0") return null;
            if (response != null && response.Length > 1 && response[0] == '1') return response.Substring(1);
            throw new InvalidOperationException("Web localStorage read failed.");
#elif UNITY_EDITOR
            return UnityEngine.PlayerPrefs.HasKey(LastStandPreferences.StorageKey)
                ? UnityEngine.PlayerPrefs.GetString(LastStandPreferences.StorageKey) : null;
#elif UNITY_ANDROID || UNITY_STANDALONE
            return Native.Read();
#else
            throw new PlatformNotSupportedException("Last Stand settings require WebGL or Unity Editor.");
#endif
        }

        public void Write(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
#if UNITY_WEBGL && !UNITY_EDITOR
            if (LastStandStorage_Set(LastStandPreferences.StorageKey, value) != 1)
                throw new InvalidOperationException("Web localStorage write failed.");
#elif UNITY_EDITOR
            UnityEngine.PlayerPrefs.SetString(LastStandPreferences.StorageKey, value);
            UnityEngine.PlayerPrefs.Save();
#elif UNITY_ANDROID || UNITY_STANDALONE
            Native.Write(value);
#else
            throw new PlatformNotSupportedException("Last Stand settings require WebGL or Unity Editor.");
#endif
        }
    }
}
