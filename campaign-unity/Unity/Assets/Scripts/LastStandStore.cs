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

    public sealed class LastStandStore : ILastStandStorage
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern string LastStandStorage_Get(string key);
        [DllImport("__Internal")]
        private static extern int LastStandStorage_Set(string key, string value);
#endif

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
#else
            throw new PlatformNotSupportedException("Last Stand local save requires WebGL or Unity Editor.");
#endif
        }
    }
}
