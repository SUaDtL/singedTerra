package com.singedterra.laststand.backup;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Byte transport only; the shared C# owner validates gameplay and schema. */
public final class BackupDocumentIO {
    public static final int MAXIMUM_BYTES = 131072;
    public static final int MAXIMUM_BASE64 = ((MAXIMUM_BYTES + 2) / 3) * 4;
    private BackupDocumentIO() { }

    public static void validate(byte[] bytes) throws IOException {
        if (bytes == null || bytes.length == 0 || bytes.length > MAXIMUM_BYTES)
            throw new IOException("Invalid backup size");
        try {
            StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes));
        } catch (CharacterCodingException error) { throw new IOException("Invalid backup text"); }
    }

    public static byte[] read(InputStream input) throws IOException {
        if (input == null) throw new IOException("Backup unavailable");
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer, 0, Math.min(buffer.length, MAXIMUM_BYTES + 1 - output.size()))) != -1) {
                if (count == 0) throw new IOException("Backup read made no progress");
                if (output.size() + count > MAXIMUM_BYTES) throw new IOException("Backup exceeds limit");
                output.write(buffer, 0, count);
            }
            byte[] bytes = output.toByteArray();
            validate(bytes);
            return bytes;
        }
    }
}
