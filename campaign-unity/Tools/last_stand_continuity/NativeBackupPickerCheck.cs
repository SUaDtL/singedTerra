using System;
using System.Globalization;
using System.IO;
using System.Text;
using SingedTerra.LastStand;

// Manual Windows adapter check. This never loads Unity or a player's profile.
// The human/computer-use operator selects or cancels the actual OS dialog.
static class NativeBackupPickerCheck
{
    static bool Equal(byte[] left,byte[] right)
    {
        if(left==null || right==null || left.Length!=right.Length)return false;
        for(int n=0;n<left.Length;n++)if(left[n]!=right[n])return false;
        return true;
    }
    static string Flag(bool value)=>value?"true":"false";

    [STAThread]
    public static int Main(string[] args)
    {
        if(args.Length!=3 || (args[0]!="export" && args[0]!="import" && args[0]!="cancel"))
        { Console.Error.WriteLine("Expected mode export/import/cancel, existing fixture path and new result path.");return 2; }
        string mode=args[0],fixturePath=Path.GetFullPath(args[1]),resultPath=Path.GetFullPath(args[2]);
        try
        {
            byte[] expected=LastStandBackupFiles.ReadSelectedFile(fixturePath);
            // CreateNew prevents any result or selected fixture from being overwritten.
            using(var output=new FileStream(resultPath,FileMode.CreateNew,FileAccess.Write,FileShare.Read))
            {
                LastStandBackupTransferResult result=LastStandWindowsBackupPicker.Run(mode!="export",mode=="export"?expected:null);
                bool unchanged=Equal(expected,LastStandBackupFiles.ReadSelectedFile(fixturePath));
                bool matches=mode=="import" && Equal(expected,result.Document);
                bool passed=unchanged && (mode=="cancel"
                    ?result.Status==LastStandBackupTransferStatus.Cancelled && result.Document==null
                    :result.Status==LastStandBackupTransferStatus.Success &&
                     (mode=="import"?matches:result.Document==null));
                string json="{\n  \"schema\": \"singedterra-native-backup-picker-check/v1\",\n"+
                    "  \"mode\": \""+mode+"\",\n  \"actualStatus\": \""+result.Status+"\",\n"+
                    "  \"expectedBytes\": "+expected.Length.ToString(CultureInfo.InvariantCulture)+",\n"+
                    "  \"returnedBytes\": "+(result.Document?.Length??0).ToString(CultureInfo.InvariantCulture)+",\n"+
                    "  \"importBytesMatch\": "+Flag(matches)+",\n  \"fixtureUnchanged\": "+Flag(unchanged)+",\n"+
                    "  \"adapterCheckPassed\": "+Flag(passed)+"\n}\n";
                byte[] bytes=new UTF8Encoding(false,true).GetBytes(json);output.Write(bytes,0,bytes.Length);output.Flush(true);
                Console.WriteLine((passed?"PASS ":"FAIL ")+"native picker "+mode);
                return passed?0:1;
            }
        }
        catch(Exception error)
        {
            // Do not print file contents, selected paths or raw OS exception text.
            Console.Error.WriteLine("Native picker check failed: "+error.GetType().Name);
            return 1;
        }
    }
}
