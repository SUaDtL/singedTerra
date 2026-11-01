using System;
using SingedTerra.LastStand;
class AppearanceDraftChecks
{
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static int Main()
    {
        try
        {
            var saved=LastStandTankAppearance.Default;
            var editor=new LastStandAppearanceSession();
            editor.Begin(saved,3);
            editor.Preview(saved.WithPreset("ranger").WithPart(LastStandTankPartSlot.Barrel,"jackal").WithPaint("blue"));
            Check(editor.HasChanges && saved.Equals(LastStandTankAppearance.Default),"preview mutated saved appearance");
            Check(editor.Matches(saved,3),"unrelated revisions invalidated draft");
            Check(!editor.Matches(saved,4),"restored profile accepted old draft");
            Check(!editor.Matches(saved.WithPaint("green"),3),"changed saved cosmetics accepted old draft");
            var applied=editor.Draft;editor.Confirm(applied,3);
            Check(!editor.HasChanges && editor.Matches(applied,3),"confirmed apply did not update draft basis");
            editor.Preview(applied.WithPaint("purple"));editor.Close();
            Check(!editor.IsOpen && editor.Draft==null,"cancel retained an active preview");
            bool refused=false;try{editor.Preview(saved);}catch(InvalidOperationException){refused=true;}
            Check(refused,"closed editor accepted changes");
            editor.Begin(applied,3);Check(editor.Draft.Equals(applied),"reopen restored cancelled draft");
            Console.WriteLine("PASS appearance draft lifecycle and replacement protection");return 0;
        }
        catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
