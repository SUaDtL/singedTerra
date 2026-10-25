using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.LastStand;

// The same passive production capture feeds runtime logs and this imported
// scene check. The contract is tooling metadata, never a gameplay rules owner.
public static class LastStandObservationContractChecks
{
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    [Serializable] sealed class Inventory { public string field;public string[] names; }
    [Serializable] sealed class Contract
    {
        public string schema,tag;
        public string[] header,tail,numeric,controlStrings,controlNumbers,controlBooleans;
        public Inventory[] inventories;
    }
    [Serializable] sealed class Packets { public string[] packets; }
    sealed class Storage:ILastStandStorage
    { string value;public string Read()=>value;public void Write(string next){value=next;} }
    static void Require(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static object Field(object value,string name)=>value.GetType().GetField(name).GetValue(value);
    static void Same(IEnumerable<string> actual,IEnumerable<string> expected,string message)
    { Require(actual.OrderBy(x=>x).SequenceEqual(expected.OrderBy(x=>x)),message); }
    static void Check(object snapshot,Contract contract)
    {
        Same(snapshot.GetType().GetFields().Select(f=>f.Name),contract.header.Concat(contract.tail).Concat(new[]{"graphics"}),"Emitter fields differ from v1 contract");
        var all=new HashSet<string>();
        foreach(var inventory in contract.inventories)
        {
            var values=((IEnumerable)Field(snapshot,inventory.field)).Cast<object>().ToArray();
            Same(values.Select(row=>(string)Field(row,"name")),inventory.names,"Emitter inventory differs: "+inventory.field);
            foreach(var row in values)
            {
                Require(all.Add((string)Field(row,"name")),"Duplicate control owner");
                Same(row.GetType().GetFields().Select(f=>f.Name),contract.controlStrings.Concat(contract.controlNumbers).Concat(contract.controlBooleans),"Emitter control shape differs");
                foreach(string key in contract.controlStrings)Require(Field(row,key) is string,"Missing control string "+key);
                foreach(string key in contract.controlNumbers)
                { double n=Convert.ToDouble(Field(row,key));Require(!double.IsNaN(n)&&!double.IsInfinity(n),"Nonfinite control metric "+key); }
                foreach(string key in contract.controlBooleans)Require(Field(row,key) is bool,"Invalid control boolean "+key);
            }
        }
    }
    public static void Run()
    {
        var factory=LastStandLoopController.StorageFactory;bool background=Application.runInBackground;
        try
        {
            using(var scope=new LastStandTestPreferencesScope())
            {
                string path=Path.GetFullPath(Path.Combine(Application.dataPath,"../../Tools/contracts/last-stand-observation-v1.json"));
                var contract=JsonUtility.FromJson<Contract>(File.ReadAllText(path));
                Require(contract.schema=="singedterra-last-stand-observation/v1"&&contract.tag=="ST_LS_HUD_LAYOUT ","Unsupported contract version");
                var storage=new Storage();LastStandLoopController.StorageFactory=()=>storage;
                EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
                var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
                typeof(TankPresentation).GetMethod("Start",Private).Invoke(art,null);
                typeof(ArtHud).GetMethod("Start",Private).Invoke(art.GetComponent<ArtHud>(),null);
                var loop=art.GetComponent<LastStandLoopController>();
                var hud=typeof(LastStandLoopController).GetField("hud",Private).GetValue(loop);
                var observations=hud.GetType().GetField("observations",Private).GetValue(hud);
                var capture=observations.GetType().GetMethod("CaptureLayoutSnapshot",Private);
                var packets=new List<string>();
                foreach(string page in new[]{"","settings","research","history"})
                {
                    if(page!="")loop.OpenMenu(page);else loop.CloseMenu();loop.RefreshControls();
                    var snapshot=capture.Invoke(observations,new object[]{null});Check(snapshot,contract);
                    packets.Add(contract.tag+JsonUtility.ToJson(snapshot));
                    // A deliberately duplicated actual row must fail admission.
                    var rows=(Array)Field(snapshot,"controls");var original=rows.GetValue(0);rows.SetValue(rows.GetValue(1),0);
                    bool rejected=false;try{Check(snapshot,contract);}catch(InvalidOperationException){rejected=true;}
                    Require(rejected,"Duplicate emitter negative control escaped");rows.SetValue(original,0);
                }
                string output=Environment.GetEnvironmentVariable("ST_LS_OBSERVATION_OUTPUT");
                Require(!string.IsNullOrEmpty(output),"Contract test needs its owned evidence output");
                File.WriteAllText(output,JsonUtility.ToJson(new Packets{packets=packets.ToArray()}));
                Debug.Log("ST_LS_OBSERVATION_CONTRACT_PASS actual_emitter_and_duplicate_negative_control");
            }
        }
        catch(Exception error){Debug.LogError("ST_LS_OBSERVATION_CONTRACT_FAIL "+error);EditorApplication.Exit(1);}
        finally
        { LastStandLoopController.StorageFactory=factory;EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);Application.runInBackground=background; }
    }
}
