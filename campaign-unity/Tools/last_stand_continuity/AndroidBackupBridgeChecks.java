package com.singedterra.laststand.backup;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import java.io.Closeable;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Executes actual Bridge/Activity sources with inert Android OS entry points. */
final class AndroidBackupBridgeChecks {
    static void check(boolean value, String reason) { if (!value) throw new AssertionError(reason); }
    static Object field(String name) throws Exception {
        Field value = LastStandBackupBridge.class.getDeclaredField(name); value.setAccessible(true); return value.get(null);
    }
    static void idle(String name) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while ((Boolean)field(name) && System.nanoTime() < end) Thread.sleep(1);
        check(!(Boolean)field(name), name + " did not settle after fixture released IO");
    }
    static LastStandBackupActivity activity(int id) {
        LastStandBackupActivity value = new LastStandBackupActivity();
        value.setIntent(new Intent().putExtra("request", id)); value.onCreate(null); return value;
    }
    static void begin(int id, List<String> replies) {
        LastStandBackupBridge.begin(new Activity(), id, true, "", "", (request, status, payload) -> {
            synchronized (replies) { replies.add(request + "|" + status + "|" + payload); }
        });
    }
    public static void main(String[] args) throws Exception {
        List<String> replies = new ArrayList<>();
        Activity rejecting = new Activity(); rejecting.rejectDispatch = true;
        LastStandBackupBridge.begin(rejecting, 1, true, "", "", (id, status, payload) -> replies.add(id + "|" + status));
        check(replies.equals(java.util.Arrays.asList("1|error")), "dispatch rejection did not settle");

        replies.clear(); begin(2, replies);
        LastStandBackupBridge.Request blocked = LastStandBackupBridge.find(2);
        LastStandBackupActivity host = activity(2);
        CountDownLatch closeEntered = new CountDownLatch(1), releaseClose = new CountDownLatch(1);
        Closeable slowClose = () -> {
            closeEntered.countDown();
            try { releaseClose.await(3, TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        };
        check(LastStandBackupBridge.attachStream(blocked, slowClose), "cannot attach fixture");
        long before = System.nanoTime(); LastStandBackupBridge.cancel(2);
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - before);
        check(elapsed < 250, "cancel waited on provider close: " + elapsed + "ms");
        check(replies.equals(java.util.Arrays.asList("2|cancel|")) && host.finished, "cancel callback/Activity was delayed");
        check(closeEntered.await(1, TimeUnit.SECONDS), "cleanup was not attempted off-thread");
        begin(3, replies); check(replies.get(1).equals("3|error|"), "orphaned cleanup admitted another request");
        releaseClose.countDown(); idle("cleanupBusy");

        replies.clear(); begin(4, replies);
        LastStandBackupBridge.Request request = LastStandBackupBridge.find(4);
        LastStandBackupActivity original = activity(4);
        CountDownLatch readEntered = new CountDownLatch(1), releaseRead = new CountDownLatch(1);
        byte[] document = "confirmed document".getBytes(StandardCharsets.UTF_8);
        original.resolver.input = new InputStream() {
            int position;
            public int read() {
                readEntered.countDown();
                try { releaseRead.await(3, TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
                return position < document.length ? document[position++] : -1;
            }
            public void close() { /* Deliberately uncooperative: read remains blocked. */ }
        };
        original.onActivityResult(LastStandBackupActivity.PICK, Activity.RESULT_OK, new Intent().setData(Uri.parse("content://fixture/backup")));
        check(readEntered.await(1, TimeUnit.SECONDS), "provider worker did not start");
        Runnable deadline = request.deadline; int scheduled = Handler.scheduled;
        original.changingConfigurations = true; original.onDestroy();
        LastStandBackupActivity replacement = new LastStandBackupActivity();
        replacement.setIntent(new Intent().putExtra("request", 4)); replacement.onCreate(new Bundle());
        check(request.deadline == deadline && Handler.pending.contains(deadline) && Handler.scheduled == scheduled,
            "Activity replacement removed or restarted the request deadline");
        Handler.fire(deadline);
        check(replies.equals(java.util.Arrays.asList("4|error|")) && replacement.finished, "timeout did not settle replacement host");
        begin(5, replies); check(replies.get(1).equals("5|error|"), "orphaned provider admitted another worker");
        releaseRead.countDown(); idle("providerBusy"); idle("cleanupBusy");
        check(replies.size() == 2, "late provider bytes revived a timed-out request");

        LastStandBackupBridge.begin(new Activity(), 6, true, "", "", (id, status, payload) -> { throw new IllegalStateException("fixture callback failure"); });
        LastStandBackupActivity callbackHost = activity(6);
        try { LastStandBackupBridge.cancel(6); } catch (IllegalStateException expected) { }
        check(callbackHost.finished && LastStandBackupBridge.find(6) == null, "callback failure leaked the picker request");

        ThreadPoolExecutor provider = (ThreadPoolExecutor)field("provider"), cleanup = (ThreadPoolExecutor)field("cleanup");
        check(provider.getMaximumPoolSize() == 1 && cleanup.getMaximumPoolSize() == 1 &&
            provider.getQueue().remainingCapacity() == 1 && cleanup.getQueue().remainingCapacity() == 1, "worker concurrency is unbounded");
        provider.shutdown(); replies.clear(); begin(7, replies);
        LastStandBackupBridge.Request refused = LastStandBackupBridge.find(7);
        LastStandBackupBridge.transfer(refused, () -> { throw new AssertionError("rejected task ran"); });
        check(replies.equals(java.util.Arrays.asList("7|error|")) && !Handler.pending.contains(refused.deadline), "provider enqueue rejection did not settle once");
        cleanup.shutdown(); replies.clear(); begin(8, replies);
        LastStandBackupBridge.Request noCleanup = LastStandBackupBridge.find(8);
        final boolean[] closedOnCaller = { false };
        LastStandBackupBridge.attachStream(noCleanup, () -> closedOnCaller[0] = true);
        LastStandBackupBridge.cancel(8);
        check(replies.equals(java.util.Arrays.asList("8|cancel|")) && !closedOnCaller[0], "cleanup enqueue rejection blocked or suppressed completion");
        System.out.println("PASS Android Bridge: prompt blocking-close cancellation, retained deadline, bounded workers, stale IO, callback and enqueue failure cleanup");
    }
}
