package com.singedterra.laststand.backup;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import java.io.Closeable;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** No Unity dependency: the C# proxy queues callbacks onto Unity's main thread. */
public final class LastStandBackupBridge {
    public interface Callback { void onResult(int request, String status, String payload); }
    static final class Request {
        final int id;
        final boolean importing;
        final byte[] bytes;
        final String name;
        final Callback callback;
        WeakReference<LastStandBackupActivity> activity;
        Closeable stream;
        Runnable deadline;
        boolean transferring;
        Request(int id, boolean importing, byte[] bytes, String name, Callback callback) {
            this.id = id; this.importing = importing; this.bytes = bytes; this.name = name; this.callback = callback;
        }
    }
    private static Request current;
    private static boolean providerBusy, cleanupBusy;
    private static final Handler timer = new Handler(Looper.getMainLooper());
    private static ThreadPoolExecutor worker(String name) {
        return new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<Runnable>(1), task -> {
            Thread thread = new Thread(task, name); thread.setDaemon(true); return thread;
        }, new ThreadPoolExecutor.AbortPolicy());
    }
    private static final ThreadPoolExecutor provider = worker("LastStandBackupFile");
    private static final ThreadPoolExecutor cleanup = worker("LastStandBackupClose");
    private LastStandBackupBridge() { }

    public static void begin(Activity owner, int id, boolean importing, String encoded, String name, Callback callback) {
        if (callback == null) return;
        if (owner == null || id <= 0) { callback.onResult(id, "unavailable", ""); return; }
        byte[] bytes = null;
        try {
            if (!importing) {
                if (encoded == null || encoded.length() > BackupDocumentIO.MAXIMUM_BASE64 || encoded.length() % 4 != 0 ||
                    !encoded.matches("[A-Za-z0-9+/]*={0,2}") || name == null ||
                    !name.matches("last-stand-backup-[0-9]{8}-[0-9]{6}\\.laststand")) throw new IOException("Invalid transfer");
                bytes = Base64.decode(encoded, Base64.NO_WRAP);
                BackupDocumentIO.validate(bytes);
                if (!Base64.encodeToString(bytes, Base64.NO_WRAP).equals(encoded)) throw new IOException("Invalid transfer");
            }
        } catch (Exception error) { callback.onResult(id, "error", ""); return; }
        final Request request = new Request(id, importing, bytes, name, callback);
        synchronized (LastStandBackupBridge.class) {
            // A cancelled provider call can still be stuck in platform IO. Do
            // not accumulate another worker or queue through repeated retries.
            if (current != null || providerBusy || cleanupBusy) { callback.onResult(id, "error", ""); return; }
            current = request;
        }
        try {
            owner.runOnUiThread(() -> {
                if (!active(request)) return;
                try {
                    Intent intent = new Intent(owner, LastStandBackupActivity.class);
                    intent.putExtra("request", id);
                    owner.startActivity(intent);
                } catch (Exception error) { finish(request, "error", ""); }
            });
        } catch (Exception error) { finish(request, "error", ""); }
    }

    static synchronized Request find(int id) { return current != null && current.id == id ? current : null; }
    static synchronized boolean active(Request request) { return request != null && current == request; }
    static synchronized boolean attachStream(Request request, Closeable stream) {
        if (current != request) return false;
        request.stream = stream; return true;
    }
    static synchronized void detachStream(Request request, Closeable stream) {
        if (request != null && request.stream == stream) request.stream = null;
    }
    static void transfer(Request request, Runnable operation) {
        synchronized (LastStandBackupBridge.class) {
            if (!active(request) || request.transferring) return;
            request.transferring = true; providerBusy = true;
            // The request, not its Activity, owns this deadline. Recreating the
            // picker host for a configuration change cannot remove it.
            request.deadline = () -> finish(request, "error", "");
            timer.postDelayed(request.deadline, 30000);
        }
        try {
            provider.execute(() -> {
                try { operation.run(); }
                finally { synchronized (LastStandBackupBridge.class) { providerBusy = false; } }
            });
        } catch (Exception error) {
            synchronized (LastStandBackupBridge.class) { providerBusy = false; }
            finish(request, "error", "");
        }
    }
    static void finish(Request request, String status, String payload) {
        final Closeable stream;
        synchronized (LastStandBackupBridge.class) {
            if (request == null || current != request) return;
            current = null;
            if (request.deadline != null) timer.removeCallbacks(request.deadline);
            stream = request.stream; request.stream = null;
            if (stream != null) cleanupBusy = true;
        }
        if (stream != null) {
            try {
                cleanup.execute(() -> {
                    try { close(stream); }
                    finally { synchronized (LastStandBackupBridge.class) { cleanupBusy = false; } }
                });
            } catch (Exception error) {
                // Refuse subsequent IO if cleanup could not even be scheduled.
                // No provider close is allowed on this completion/UI thread.
            }
        }
        LastStandBackupActivity activity = request.activity == null ? null : request.activity.get();
        try { request.callback.onResult(request.id, status, payload); }
        finally { if (activity != null) timer.post(activity::finish); }
    }
    public static void cancel(int id) {
        Request request = find(id);
        if (request == null) return;
        LastStandBackupActivity activity = request.activity == null ? null : request.activity.get();
        try { finish(request, "cancel", ""); }
        finally { if (activity != null) timer.post(() -> activity.finishActivity(LastStandBackupActivity.PICK)); }
    }
    static void close(Closeable value) { if (value != null) try { value.close(); } catch (IOException ignored) { } }
}
