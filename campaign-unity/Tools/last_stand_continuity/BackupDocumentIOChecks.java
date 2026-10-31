import com.singedterra.laststand.backup.BackupDocumentIO;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

final class BackupDocumentIOChecks {
    interface Check { void run() throws Exception; }
    static void require(boolean value) { if (!value) throw new AssertionError("Backup transport invariant failed"); }
    static void deny(Check action) throws Exception {
        try { action.run(); } catch (IOException expected) { return; }
        throw new AssertionError("Invalid backup transport accepted");
    }
    public static void main(String[] args) throws Exception {
        byte[] bytes = "SINGED_TERRA_LAST_STAND_BACKUP 1\n{\"label\":\"snowman \u2603\"}".getBytes(StandardCharsets.UTF_8);
        require(Arrays.equals(bytes, BackupDocumentIO.read(new ByteArrayInputStream(bytes))));
        deny(() -> BackupDocumentIO.read(new ByteArrayInputStream(new byte[0])));
        deny(() -> BackupDocumentIO.read(new ByteArrayInputStream(new byte[] { (byte)0xc3, 0x28 })));
        deny(() -> BackupDocumentIO.read(new ByteArrayInputStream(new byte[] { (byte)0xed, (byte)0xa0, (byte)0x80 })));
        byte[] limit = new byte[131072]; Arrays.fill(limit, (byte)'x');
        require(BackupDocumentIO.read(new ByteArrayInputStream(limit)).length == 131072);
        final int[] consumed = { 0 };
        InputStream endless = new InputStream() {
            public int read() { consumed[0]++; return 65; }
            public int read(byte[] target, int offset, int count) {
                Arrays.fill(target, offset, offset + count, (byte)65); consumed[0] += count; return count;
            }
        };
        deny(() -> BackupDocumentIO.read(endless)); require(consumed[0] == 131073);
        deny(() -> BackupDocumentIO.read(new InputStream() {
            public int read() { return 0; }
            public int read(byte[] target, int offset, int count) { return 0; }
        }));
        System.out.println("PASS Android backup IO: exact bytes, byte limit, malformed UTF-8, bounded stream, stalled stream");
    }
}
