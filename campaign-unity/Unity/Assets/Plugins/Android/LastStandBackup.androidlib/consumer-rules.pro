# C# calls this narrow first-party interface through JNI by its fixed name.
-keep class com.singedterra.laststand.backup.LastStandBackupBridge { public static *; }
-keep interface com.singedterra.laststand.backup.LastStandBackupBridge$Callback { *; }
-keep class com.singedterra.laststand.backup.LastStandBackupActivity { *; }
