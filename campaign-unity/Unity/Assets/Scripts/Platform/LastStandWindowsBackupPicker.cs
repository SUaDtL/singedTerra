#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
using System;
using System.Runtime.InteropServices;

namespace SingedTerra.LastStand
{
    // Windows owns file selection and overwrite consent. No managed UI dependency.
    public static class LastStandWindowsBackupPicker
    {
        const int Capacity = 32768;
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct OpenFileName
        {
            public int Size;
            public IntPtr Owner, Instance;
            public string Filter;
            public IntPtr CustomFilter;
            public int CustomFilterSize, FilterIndex;
            public IntPtr File;
            public int FileSize;
            public IntPtr FileTitle;
            public int FileTitleSize;
            public string InitialDirectory, Title;
            public int Flags;
            public short FileOffset, ExtensionOffset;
            public string DefaultExtension;
            public IntPtr CustomData, Hook;
            public string Template;
            public IntPtr Reserved;
            public int ReservedValue, ExtendedFlags;
        }
        [DllImport("comdlg32.dll", EntryPoint = "GetOpenFileNameW", CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)] static extern bool Open(ref OpenFileName value);
        [DllImport("comdlg32.dll", EntryPoint = "GetSaveFileNameW", CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)] static extern bool Save(ref OpenFileName value);
        [DllImport("comdlg32.dll")] static extern int CommDlgExtendedError();
        [DllImport("user32.dll")] static extern IntPtr GetActiveWindow();

        public static LastStandBackupTransferResult Run(bool importing, byte[] document)
        {
            IntPtr buffer = Marshal.AllocHGlobal(Capacity * 2);
            try
            {
                var characters = new char[Capacity];
                if (!importing)
                {
                    string suggested = LastStandBackupFiles.SuggestedName(DateTime.UtcNow);
                    suggested.CopyTo(0, characters, 0, suggested.Length);
                }
                Marshal.Copy(characters, 0, buffer, characters.Length);
                var value = new OpenFileName
                {
                    Size = Marshal.SizeOf(typeof(OpenFileName)), Owner = GetActiveWindow(), File = buffer, FileSize = Capacity,
                    Filter = "Last Stand backup (*.laststand)\0*.laststand\0All files (*.*)\0*.*\0\0", FilterIndex = 1,
                    Title = importing ? "Choose a Last Stand backup" : "Save a Last Stand backup", DefaultExtension = "laststand",
                    // Explorer UI, preserve working directory, require parent, and
                    // require an existing import or obtain explicit overwrite consent.
                    Flags = 0x80000 | 0x8 | 0x800 | (importing ? 0x1000 : 0x2)
                };
                if (!(importing ? Open(ref value) : Save(ref value)))
                    return new LastStandBackupTransferResult(CommDlgExtendedError() == 0 ?
                        LastStandBackupTransferStatus.Cancelled : LastStandBackupTransferStatus.Failed);
                string path = Marshal.PtrToStringUni(buffer);
                if (importing) return new LastStandBackupTransferResult(LastStandBackupTransferStatus.Success,
                    LastStandBackupFiles.ReadSelectedFile(path));
                LastStandBackupFiles.WriteSelectedFile(path, document);
                return new LastStandBackupTransferResult(LastStandBackupTransferStatus.Success);
            }
            catch (Exception)
            { return new LastStandBackupTransferResult(LastStandBackupTransferStatus.Failed); }
            finally { Marshal.FreeHGlobal(buffer); }
        }
    }
}
#endif
