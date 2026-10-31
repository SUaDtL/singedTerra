package com.singedterra.laststand.backup;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;

/** Non-exported, first-party system-document picker. No storage permission or path access. */
public final class LastStandBackupActivity extends Activity {
    static final int PICK = 1;
    private LastStandBackupBridge.Request request;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        request = LastStandBackupBridge.find(getIntent().getIntExtra("request", 0));
        // No payload is written to activity saved state. Process death invalidates
        // this request; it must never restore an old asynchronous operation.
        if (request == null) { finish(); return; }
        request.activity = new WeakReference<>(this);
        if (savedState != null) return;
        try {
            Intent picker = new Intent(request.importing ? Intent.ACTION_OPEN_DOCUMENT : Intent.ACTION_CREATE_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("application/octet-stream");
            if (!request.importing) picker.putExtra(Intent.EXTRA_TITLE, request.name);
            startActivityForResult(picker, PICK);
        } catch (Exception error) { LastStandBackupBridge.finish(request, "unavailable", ""); }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != PICK || !LastStandBackupBridge.active(request) || request.transferring) return;
        if (result != RESULT_OK || data == null || data.getData() == null) {
            LastStandBackupBridge.finish(request, "cancel", ""); return;
        }
        Uri uri = data.getData();
        if (!"content".equals(uri.getScheme())) { LastStandBackupBridge.finish(request, "error", ""); return; }
        LastStandBackupBridge.transfer(request, () -> transfer(uri));
    }

    private void transfer(Uri uri) {
        try {
            if (!LastStandBackupBridge.active(request)) return;
            if (request.importing) {
                InputStream selected = getContentResolver().openInputStream(uri);
                byte[] bytes;
                try (InputStream input = selected) {
                    if (input == null) throw new java.io.IOException("Backup unavailable");
                    if (!LastStandBackupBridge.attachStream(request, input)) return;
                    bytes = BackupDocumentIO.read(input);
                }
                LastStandBackupBridge.detachStream(request, selected);
                LastStandBackupBridge.finish(request, "ok", Base64.encodeToString(bytes, Base64.NO_WRAP));
            } else {
                // ACTION_CREATE_DOCUMENT always creates a new document, so a
                // failed export cannot truncate an existing player backup.
                OutputStream selectedOutput = getContentResolver().openOutputStream(uri, "w");
                try (OutputStream output = selectedOutput) {
                    if (output == null) throw new java.io.IOException("Backup unavailable");
                    if (!LastStandBackupBridge.attachStream(request, output)) return;
                    output.write(request.bytes); output.flush();
                }
                LastStandBackupBridge.detachStream(request, selectedOutput);
                // Require provider readback before reporting Android export complete.
                InputStream selectedInput = getContentResolver().openInputStream(uri);
                try (InputStream input = selectedInput) {
                    if (input == null) throw new java.io.IOException("Backup unavailable");
                    if (!LastStandBackupBridge.attachStream(request, input)) return;
                    byte[] confirmed = BackupDocumentIO.read(input);
                    if (!java.util.Arrays.equals(confirmed, request.bytes)) throw new java.io.IOException("Readback mismatch");
                }
                LastStandBackupBridge.detachStream(request, selectedInput);
                LastStandBackupBridge.finish(request, "ok", "");
            }
        } catch (Exception error) { LastStandBackupBridge.finish(request, "error", ""); }
    }

    @Override protected void onDestroy() {
        if (!isChangingConfigurations() && request != null && LastStandBackupBridge.active(request))
            LastStandBackupBridge.finish(request, "cancel", "");
        super.onDestroy();
    }
}
