using System;
using System.IO;
using SingedTerra.LastStand;

namespace UnityEngine
{
    // Only the host path is supplied by this harness. Storage owners and file
    // operations are the production sources compiled with native-player defines.
    public static class Application { public static string persistentDataPath; }
}

static class NativeProfileChecks
{
    static void Require(bool value,string message)
    {if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action)
    {
        try {action();}
        catch(IOException){return;}
        catch(InvalidOperationException){return;}
        throw new InvalidOperationException("Rejected profile reached a storage operation.");
    }
    public static int Main(string[] args)
    {
        try
        {
            UnityEngine.Application.persistentDataPath=args[1];
            using(var game=new LastStandStore())
            using(var preferences=new LastStandPreferencesStore())
            {
                if(args[0]=="reject")
                {
                    Require(!game.CanWrite,"Rejected profile acquired write ownership.");
                    UnityEngine.Application.persistentDataPath=Path.Combine(args[1],"changed-after-rejection");
                    Refused(()=>game.Read());Refused(()=>game.Write("must-not-write"));
                    Refused(()=>game.ReadRestoreBackup());Refused(()=>game.WriteRestoreBackup("must-not-write"));
                    Refused(()=>preferences.Read());Refused(()=>preferences.Write("must-not-write"));
                    var profile=LastStandProgression.Load(game);
                    Require(profile.SaveState!="ready" && !String.IsNullOrEmpty(profile.SaveError),"Rejected profile did not become a blocked save.");
                    var settings=LastStandPreferences.Load(preferences);
                    Require(settings.SaveState=="not-saved" && settings.CanRetry,"Rejected profile did not expose unavailable settings storage.");
                    Console.WriteLine("PASS refused without fallback");return 0;
                }
                if(args[0]=="read")
                {
                    Require(game.Read()=="test-progress","Progression did not reopen in its profile.");
                    Require(game.ReadRestoreBackup()=="test-predecessor","Predecessor did not reopen in its profile.");
                    Require(preferences.Read()=="test-preferences","Preferences did not reopen in their profile.");
                }
                else
                {
                    Require(game.CanWrite,"Profile did not acquire write ownership.");
                    if(args[0]=="cached")UnityEngine.Application.persistentDataPath=Path.Combine(args[1],"changed-after-selection");
                    game.Write("test-progress");game.WriteRestoreBackup("test-predecessor");preferences.Write("test-preferences");
                }
            }
            Console.WriteLine("PASS native profile "+args[0]);return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error.GetType().Name+": "+error.Message);return 1;}
    }
}
