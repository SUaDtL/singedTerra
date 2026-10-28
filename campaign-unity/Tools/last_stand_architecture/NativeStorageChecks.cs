using System;
using System.IO;
using System.Text;
using System.Threading;
using SingedTerra.LastStand;

static class NativeStorageChecks
{
    sealed class ReadBoundary : ILastStandStorage
    {
        public ILastStandStorage Inner;
        public Action AfterRead;
        public string Read() { var value=Inner.Read();var action=AfterRead;AfterRead=null;action?.Invoke();return value; }
        public void Write(string value) { Inner.Write(value); }
    }
    static void Need(bool condition,string message) { if(!condition)throw new Exception(message); }
    static void PreferencesRetry(LastStandFileStorage owner,string root,string key,bool stale,bool race)
    {
        var first=LastStandPreferences.Load(owner);
        Need(first.Apply(first.Current.With(masterVolume:80)),"initial preferences");
        using(var waiting=new LastStandFileStorage(root,key))
        {
            var boundary=new ReadBoundary{Inner=waiting};
            var prefs=LastStandPreferences.Load(boundary);
            string newer=null;
            Action close=()=>{
                if(stale){Need(first.Apply(first.Current.With(masterVolume:70)),"first owner update");newer=owner.Read();}
                owner.Dispose();
            };
            if(race)boundary.AfterRead=close;
            Need(!prefs.Apply(prefs.Current.With(musicVolume:30)),"read-only preferences must not write");
            if(!race)close();
            if(stale)
            {
                Need(!prefs.Retry() && prefs.RequiresReset,"stale preference basis must remain protected after reacquisition");
                Need(waiting.Read()==newer,"stale preference retry overwrote the newer owner");
            }
            else
                Need(prefs.Retry() && LastStandPreferences.Load(waiting).Current.MusicVolume==30,"surviving preference owner must retry successfully");
        }
        Console.WriteLine("preferences-safe");
    }
    static void ProfileRetry(LastStandFileStorage owner,string root,string key)
    {
        var first=LastStandProgression.Load(owner,()=>1790000000000L);
        using(var waiting=new LastStandFileStorage(root,key))
        {
            var profile=LastStandProgression.Load(waiting,()=>1790000000000L);
            Need(profile.SaveState=="blocked","second profile has no write ownership");
            Need(first.TryDeploy(),"first owner creates a newer checkpoint");
            string newer=owner.Read();owner.Dispose();
            Need(!profile.Retry() && profile.SaveState=="blocked","stale profile must not adopt new owner state silently");
            Need(waiting.Read()==newer && !profile.TryDeploy(),"stale profile retry overwrote newer checkpoint");
        }
        Console.WriteLine("profile-safe");
    }
    static int Main(string[] args)
    {
        try
        {
            if (args[0] == "hold-range-lock")
            {
                // Independent lease holder: use the OS range-lock contract
                // directly, without constructing the production adapter.
                string file = Path.Combine(args[1], "ls-" + BitConverter.ToString(Encoding.ASCII.GetBytes(args[2])).Replace("-", "").ToLowerInvariant() + ".lock");
                using (var stream = new FileStream(file, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.ReadWrite))
                {
                    stream.Lock(0, 1);
                    File.WriteAllText(args[3], "ready");
                    Thread.Sleep(20000);
                }
                return 0;
            }
            using (var store = new LastStandFileStorage(args[1], args[2]))
            {
                switch (args[0])
                {
                    case "read":
                        Console.WriteLine(store.Read() ?? "<missing>");
                        break;
                    case "write":
                        if (!store.CanWrite) throw new Exception("Writer lease unavailable");
                        for (int n = 3; n < args.Length; n++) store.Write(args[n]);
                        Console.WriteLine(store.Read());
                        break;
                    case "hold":
                    case "hold-with-observers":
                        if (!store.CanWrite) throw new Exception("Writer lease unavailable");
                        store.Write("held");
                        if (args[0] == "hold-with-observers")
                        {
                            // POSIX range locks belong to a process: opening
                            // and then closing another handle to this inode
                            // can release its original owner's range lock.
                            for (int n = 0; n < 3; n++)
                                using (var observer = new LastStandFileStorage(Path.Combine(args[1], "."), args[2]))
                                {
                                    Need(!observer.CanWrite, "A same-process observer acquired the record");
                                    Need(observer.Read() == "held", "Observer must read committed bytes");
                                    try { observer.Write("illegal"); throw new Exception("Observer writer succeeded"); }
                                    catch (InvalidOperationException) { }
                                }
                            using (var independent = new LastStandFileStorage(args[1], args[2] + ".other"))
                            {
                                Need(independent.CanWrite, "Separate record must retain independent ownership");
                                independent.Write("other");
                            }
                            Need(store.CanWrite && store.Read() == "held", "Observer disposal changed the owner");
                        }
                        File.WriteAllText(args[3], "ready");
                        Thread.Sleep(20000);
                        break;
                    case "contended":
                        if (store.CanWrite) throw new Exception("A second writer acquired the record");
                        if (store.Read() != "held") throw new Exception("Read-only observer lost the last record");
                        try { store.Write("illegal"); throw new Exception("Read-only writer succeeded"); }
                        catch (InvalidOperationException) { Console.WriteLine("read-only"); }
                        break;
                    case "waiter":
                        Need(!store.CanWrite && store.Read()=="held","waiter starts without ownership");
                        File.WriteAllText(args[3],"ready");
                        var deadline=DateTime.UtcNow.AddSeconds(10);
                        while(!File.Exists(args[4]) && DateTime.UtcNow<deadline)Thread.Sleep(10);
                        Need(File.Exists(args[4]),"waiter release signal timed out");
                        Need(store.CanWrite,"surviving waiter did not reacquire ownership");
                        Need(store.Read()=="held","waiter must reconcile committed bytes");
                        store.Write("survived");Console.WriteLine("survived");
                        break;
                    case "prefs-retry": PreferencesRetry(store,args[1],args[2],false,false);break;
                    case "prefs-stale": PreferencesRetry(store,args[1],args[2],true,false);break;
                    case "prefs-race": PreferencesRetry(store,args[1],args[2],true,true);break;
                    case "profile-stale": ProfileRetry(store,args[1],args[2]);break;
                    default: throw new Exception("Unknown storage test mode");
                }
            }
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
