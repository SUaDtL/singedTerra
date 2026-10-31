using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Threading;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace SingedTerra.LastStand
{
    public sealed class LastStandUnityBackupTransport : MonoBehaviour, ILastStandBackupTransport
    {
        static int nextReceiver;
        readonly LastStandBackupRequests requests = new LastStandBackupRequests();
        readonly ConcurrentQueue<string> replies = new ConcurrentQueue<string>();
        bool disposed;
        public bool Busy => requests.Busy;
        public bool Available
        {
            get
            {
                if (disposed) return false;
#if UNITY_WEBGL && !UNITY_EDITOR
                return LastStandBackup_Available() == 1;
#elif UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN || UNITY_ANDROID
                return true;
#else
                return false;
#endif
            }
        }

        public static ILastStandBackupTransport Create(Transform owner)
        {
            var host = new GameObject("LastStandBackupTransport-" + Interlocked.Increment(ref nextReceiver).ToString(CultureInfo.InvariantCulture));
            host.transform.SetParent(owner, false);
            return host.AddComponent<LastStandUnityBackupTransport>();
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern int LastStandBackup_Available();
        [DllImport("__Internal")] static extern void LastStandBackup_Import(string receiver, int id);
        [DllImport("__Internal")] static extern void LastStandBackup_Export(string receiver, int id, string encoded, string name);
        [DllImport("__Internal")] static extern void LastStandBackup_Cancel(string receiver, int id);
#endif
#if UNITY_ANDROID && !UNITY_EDITOR
        AndroidReply androidReply;
        [UnityEngine.Scripting.Preserve]
        sealed class AndroidReply : AndroidJavaProxy
        {
            readonly LastStandUnityBackupTransport owner;
            public AndroidReply(LastStandUnityBackupTransport owner) : base("com.singedterra.laststand.backup.LastStandBackupBridge$Callback")
            { this.owner = owner; }
            [UnityEngine.Scripting.Preserve]
            public void onResult(int id, string status, string payload)
            {
                // Java callbacks arrive on Android's UI thread, not Unity's thread.
                if (payload != null && payload.Length > LastStandBackupFiles.MaximumBase64Characters) payload = "!";
                owner.replies.Enqueue(id.ToString(CultureInfo.InvariantCulture) + "|" + status + "|" + (payload ?? ""));
            }
        }
#endif

        public void Export(byte[] document, Action<LastStandBackupTransferResult> completed)
        {
            if (!LastStandBackupFiles.ValidDocument(document))
            { completed?.Invoke(new LastStandBackupTransferResult(LastStandBackupTransferStatus.Failed)); return; }
            Begin(false, (byte[])document.Clone(), completed);
        }
        public void Import(Action<LastStandBackupTransferResult> completed) => Begin(true, null, completed);

        void Begin(bool importing, byte[] document, Action<LastStandBackupTransferResult> completed)
        {
            if (completed == null) throw new ArgumentNullException(nameof(completed));
            if (!Available) { completed(new LastStandBackupTransferResult(LastStandBackupTransferStatus.Unavailable)); return; }
            int id = requests.Begin(importing, completed);
            if (id == 0) return;
            try
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                if (importing) LastStandBackup_Import(gameObject.name, id);
                else LastStandBackup_Export(gameObject.name, id, Convert.ToBase64String(document), LastStandBackupFiles.SuggestedName(DateTime.UtcNow));
#elif UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
                requests.Complete(id, LastStandWindowsBackupPicker.Run(importing, document));
#elif UNITY_ANDROID && !UNITY_EDITOR
                androidReply = new AndroidReply(this);
                using (var bridge = new AndroidJavaClass("com.singedterra.laststand.backup.LastStandBackupBridge"))
                    bridge.CallStatic("begin", UnityEngine.Android.AndroidApplication.currentActivity, id, importing,
                        importing ? "" : Convert.ToBase64String(document), LastStandBackupFiles.SuggestedName(DateTime.UtcNow), androidReply);
#else
                requests.Complete(id, new LastStandBackupTransferResult(LastStandBackupTransferStatus.Unavailable));
#endif
            }
            catch (Exception) { requests.Complete(id, new LastStandBackupTransferResult(LastStandBackupTransferStatus.Failed)); }
        }

        // Fixed WebGL receiver. Files are data; this callback never chooses a method or path.
        [UnityEngine.Scripting.Preserve]
        public void BackupTransferCompleted(string packet) => requests.Receive(packet);
        void Update()
        {
            while (replies.TryDequeue(out string packet)) requests.Receive(packet);
        }

        void CancelPlatform(int id)
        {
            if (id == 0) return;
            try
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                LastStandBackup_Cancel(gameObject.name, id);
#elif UNITY_ANDROID && !UNITY_EDITOR
                using (var bridge = new AndroidJavaClass("com.singedterra.laststand.backup.LastStandBackupBridge")) bridge.CallStatic("cancel", id);
#endif
            }
            catch (Exception) { /* Correlation still rejects callbacks after cancellation. */ }
        }
        public void Cancel() { int id = requests.ActiveId; requests.Cancel(); CancelPlatform(id); }
        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            int id = requests.ActiveId; requests.Dispose(); CancelPlatform(id);
            while (replies.TryDequeue(out _)) { }
#if UNITY_ANDROID && !UNITY_EDITOR
            androidReply = null;
#endif
        }
        void OnDestroy() => Dispose();
    }
}
