using System;
using SingedTerra.LastStand;

class ArmorySessionChecks
{
    static void Check(bool value,string message) { if(!value)throw new Exception(message); }
    static int Main()
    {
        try
        {
            var saved=new LastStandLoadout("launcher");
            var sustain=new LastStandLoadout("repair","launcher");
            var presets=new LastStandLoadoutPreset[] {
                new LastStandLoadoutPreset("Push",saved),
                new LastStandLoadoutPreset("Farm",sustain),null };
            var editor=new LastStandArmorySession();
            editor.Begin(saved,presets,7);
            Check(editor.Slot==0 && editor.Name=="Push" && !editor.HasChanges,"initial saved build");
            editor.SelectPreset(1);
            Check(editor.Draft.Equals(sustain) && editor.Name=="Farm" && editor.HasChanges,"preset preview");
            Check(saved.Count==1 && presets[0].Name=="Push","preview changed saved profile");
            Check(editor.Matches(saved,presets,7),"unrelated revision invalidated draft");
            Check(!editor.Matches(saved,presets,8),"restored profile accepted stale draft");
            var changed=(LastStandLoadoutPreset[])presets.Clone();
            changed[1]=new LastStandLoadoutPreset("Renamed elsewhere",sustain);
            Check(!editor.Matches(saved,changed,7),"changed preset accepted stale draft");
            Check(!editor.TryRename("<b>bad</b>") && editor.Name=="Farm","rich text name admitted");
            Check(editor.TryRename("  Deep farm  ") && editor.Name=="Deep farm","plain name normalization");
            Check(!editor.TryRename(new string('x',33)),"long name admitted");
            editor.Close();
            Check(!editor.IsOpen && editor.Draft==null,"cancel retained draft");
            bool refused=false;try{editor.SelectPreset(0);}catch(InvalidOperationException){refused=true;}
            Check(refused,"closed editor changed preset");
            editor.Begin(saved,presets,7);editor.SelectPreset(2);
            Check(editor.Name=="Build 3" && editor.Draft.Equals(saved) && editor.HasChanges,"empty preset must be explicitly saveable");
            editor.Preview(sustain);editor.TryRename("Sustain");
            var applied=(LastStandLoadoutPreset[])presets.Clone();
            applied[2]=new LastStandLoadoutPreset(editor.Name,editor.Draft);
            editor.Confirm(sustain,applied,7,2);
            Check(!editor.HasChanges && editor.Slot==2 && editor.Matches(sustain,applied,7),"confirmed apply did not update basis");
            bool bounded=false;try{editor.SelectPreset(3);}catch(ArgumentOutOfRangeException){bounded=true;}
            Check(bounded,"fourth preset admitted");
            Console.WriteLine("PASS Armory preview, presets, cancel, names and replacement protection");
            return 0;
        }
        catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
