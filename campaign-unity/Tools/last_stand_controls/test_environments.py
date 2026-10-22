"""Actual-source catalog and environment adapter checks with small Unity doubles.

Default unittest invocation starts no Unity Editor. Run this file with --imported
for the separate pinned-Editor scene suite; the caller must serialize that launch.
Doubles prove routing/ownership only. Imported scenes and browser pixels are
separate evidence, and none records owner acceptance of the environments.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity/Unity"
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Assets/Scripts"
IMPORTED_CASES = (
    "authored_environment_roots_and_lighting", "invalid_and_missing_environment_refuse",
    "active_combat_environment_is_immutable", "same_identity_reuse_is_idempotent",
    "comparison_scene_retains_treatment_switching", "render_setting_cleanup_preserves_later_owner",
)

# These doubles expose only the Unity calls made by the actual adapter. They
# neither reimplement its selection logic nor claim real renderer behavior.
DOUBLES = r"""
using System;
using System.Collections.Generic;
namespace UnityEngine {
 public class Object {
  public static implicit operator bool(Object value)=>value!=null;
  public static T[] FindObjectsByType<T>(FindObjectsInactive inactive,FindObjectsSortMode sort)=>new T[0];
 }
 public enum FindObjectsInactive { Include }
 public enum FindObjectsSortMode { None }
 public struct Scene { public string name; }
 public class GameObject:Object {
  public bool activeSelf; public Scene scene=new Scene{name="source-check"}; public Transform transform=new Transform();
  public readonly Dictionary<Type,object> Components=new Dictionary<Type,object>();
  public void SetActive(bool active) { activeSelf=active; }
 }
 public class Component:Object {
  public GameObject gameObject=new GameObject(); public Transform transform=>gameObject.transform;
  public T GetComponent<T>() where T:class=>gameObject.Components.TryGetValue(typeof(T),out var value)?value as T:null;
 }
 public class MonoBehaviour:Component {}
 public class Transform:Object { public Vector3 position,forward;public Quaternion rotation; }
 public struct Vector3 {
  public float x,y,z; public Vector3(float a,float b,float c){x=a;y=b;z=c;} public static Vector3 up=>new Vector3(0,1,0);
  public static Vector3 operator +(Vector3 a,Vector3 b)=>new Vector3(a.x+b.x,a.y+b.y,a.z+b.z);
  public static Vector3 operator *(Vector3 a,float f)=>new Vector3(a.x*f,a.y*f,a.z*f);
 }
 public struct Quaternion { public float x,y,z;public static Quaternion Euler(float x,float y,float z)=>new Quaternion{x=x,y=y,z=z}; }
 public struct Color {
  public float r,g,b,a;public Color(float r,float g,float b,float a=1){this.r=r;this.g=g;this.b=b;this.a=a;}
  public static bool operator ==(Color x,Color y)=>x.r==y.r&&x.g==y.g&&x.b==y.b&&x.a==y.a;
  public static bool operator !=(Color x,Color y)=>!(x==y);
  public override bool Equals(object value)=>value is Color&&this==(Color)value;
  public override int GetHashCode()=>r.GetHashCode()^g.GetHashCode()^b.GetHashCode()^a.GetHashCode();
 }
 public class Light:Component { public Color color; public float intensity; }
 public class Camera:Component { public Vector3 WorldToViewportPoint(Vector3 point)=>point; }
 public class Canvas:Component {} public class Material:Object {} public class Mesh:Object {}
 public static class QualitySettings { public static Rendering.RenderPipelineAsset renderPipeline; }
 public static class RenderSettings {
  public static Rendering.AmbientMode ambientMode;public static Color ambientSkyColor,ambientEquatorColor,ambientGroundColor;public static bool fog;
 }
 public static class Mathf { public const float PI=(float)Math.PI;public static float Sin(float value)=>(float)Math.Sin(value);public static float Cos(float value)=>(float)Math.Cos(value); }
 public static class Screen { public static int width=1366,height=768; }
 public static class Debug { public static void Log(object value) {} }
 public static class JsonUtility { public static string ToJson(object value)=>"{}"; }
}
namespace UnityEngine.Rendering { public class RenderPipelineAsset:UnityEngine.Object {} public enum AmbientMode{Skybox,Trilight,Flat} }
namespace UnityEngine.EventSystems { public class EventSystem:UnityEngine.Component {} }
namespace SingedTerra.Art {
 public class TankPresentation:UnityEngine.Component {
  public bool EncounterActive;public UnityEngine.Camera view; public UnityEngine.Transform tank=new UnityEngine.Transform();
  public int CameraRefreshes;public void RefreshReviewCamera(){CameraRefreshes++;}
 }
}
namespace SingedTerra.Encounter {
 public class Profile { public string Id="test"; }
 public class Model { public int Tick=37;public Profile Profile=new Profile(); public string Snapshot()=>"model:"+Tick; }
 public class EncounterView:UnityEngine.Component { public bool FullEffects=true; }
 public class EncounterSession:UnityEngine.Component { public Model Model;public bool Paused;public EncounterView View; }
}
namespace SingedTerra.LastStand { public class LastStandLoopController:UnityEngine.Component {} }
"""

CHECKS = r"""
using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;
static class EnvironmentSourceChecks {
 const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
 static void Need(bool value,string message){if(!value)throw new Exception(message);}
 static void Invoke(BattlefieldReview review,string method)=>typeof(BattlefieldReview).GetMethod(method,Private).Invoke(review,null);
 sealed class Fixture:IDisposable {
  public readonly BattlefieldReview Review=new BattlefieldReview();public readonly TankPresentation Art=new TankPresentation();
  public Fixture(bool playable=true){
   Art.gameObject=Review.gameObject;Review.gameObject.Components[typeof(TankPresentation)]=Art;
   if(playable)Review.gameObject.Components[typeof(LastStandLoopController)]=new LastStandLoopController();
   Review.ashEnvironment=new GameObject();Review.ironEnvironment=new GameObject();Review.sun=new Light();Invoke(Review,"Awake");
  }
  public void Dispose()=>Invoke(Review,"OnDestroy");
 }
 static void Catalog(){
  Need(LastStandEnvironmentCatalog.All.Count==2,"two authored definitions");
  Need(LastStandEnvironmentCatalog.Get("sunlit-ash").Id=="sunlit-ash","stable identity");
  Need(LastStandEnvironmentCatalog.Get("iron-perimeter").Name=="Iron Perimeter","authored name");
  Need(LastStandEnvironmentCatalog.Get("sunlit-ash").SunIntensity==1.65f,"preserve first treatment light");
  Need(LastStandEnvironmentCatalog.Get("iron-perimeter").CameraPitch==70f,"preserve second framing");
  LastStandEnvironmentDefinition found;
  foreach(var invalid in new[]{null,"","SUNLIT-ASH","tier-18"})Need(!LastStandEnvironmentCatalog.TryGet(invalid,out found)&&found==null,"exact known identities only");
  bool rejected=false;try{LastStandEnvironmentCatalog.Get("unknown");}catch(ArgumentOutOfRangeException){rejected=true;}
  Need(rejected,"unknown Get is explicit failure");
  rejected=false;try{((IList<LastStandEnvironmentDefinition>)LastStandEnvironmentCatalog.All)[0]=LastStandEnvironmentCatalog.All[1];}catch(NotSupportedException){rejected=true;}
  Need(rejected,"read-only definition membership");
 }
 static void Selection(){using(var f=new Fixture()){
  Need(f.Review.TrySelectEnvironment("iron-perimeter"),"select second identity");
  Need(f.Review.EnvironmentId=="iron-perimeter"&&!f.Review.ashEnvironment.activeSelf&&f.Review.ironEnvironment.activeSelf,"actual root routing");
  Need(f.Review.sun.color==LastStandEnvironmentCatalog.Get("iron-perimeter").SunColor&&f.Review.sun.intensity==1.35f,"definition drives light");
  Need(RenderSettings.ambientSkyColor==LastStandEnvironmentCatalog.Get("iron-perimeter").AmbientSky,"definition drives ambient");
  Need(f.Review.TrySelectEnvironment("sunlit-ash")&&f.Review.Treatment==0,"restore first identity");
 }}
 static void Invalid(){using(var f=new Fixture()){
  var color=f.Review.sun.color;Need(!f.Review.TrySelectEnvironment("unknown"),"invalid must refuse");
  Need(f.Review.EnvironmentId=="sunlit-ash"&&f.Review.sun.color==color,"invalid does not mutate");
  f.Review.environmentBindings=new[]{new BattlefieldReview.EnvironmentBinding{environmentId="sunlit-ash",root=f.Review.ashEnvironment}};
  Need(!f.Review.TrySelectEnvironment("iron-perimeter"),"missing binding must refuse");
  f.Review.environmentBindings=new[]{new BattlefieldReview.EnvironmentBinding{environmentId="sunlit-ash",root=null}};
  Need(!f.Review.TrySelectEnvironment("sunlit-ash"),"same identity validates content");
 }}
 static void Combat(){using(var f=new Fixture()){
  f.Review.Session=new EncounterSession{Model=new Model()};var before=f.Review.Session.Model.Snapshot();
  Need(!f.Review.TrySelectEnvironment("iron-perimeter"),"active model must block environment mutation");
  f.Review.SelectIron();Need(f.Review.EnvironmentId=="sunlit-ash"&&before==f.Review.Session.Model.Snapshot(),"legacy playable method cannot bypass combat guard");
  f.Review.Session.Model=null;f.Art.EncounterActive=true;
  Need(!f.Review.TrySelectEnvironment("iron-perimeter"),"active presentation must block environment mutation");
  Need(f.Review.TrySelectEnvironment("sunlit-ash"),"same current active identity is a no-op");
 }}
 static void Reuse(){using(var f=new Fixture()){
  Need(f.Review.TrySelectEnvironment("iron-perimeter"),"select reuse target");int changes=0;f.Review.Changed+=()=>changes++;
  for(int n=0;n<18;n++)Need(f.Review.TrySelectEnvironment("iron-perimeter"),"repeat environment reference");
  Need(changes==0&&f.Art.CameraRefreshes==1,"same identity reuse has no repeated work");
 }}
 static void Comparison(){using(var f=new Fixture(false)){
  f.Review.Session=new EncounterSession{Model=new Model()};var before=f.Review.Session.Model.Snapshot();
  f.Review.SelectIron();Need(f.Review.EnvironmentId=="iron-perimeter"&&before==f.Review.Session.Model.Snapshot(),"comparison legacy changes presentation only");
 }}
 static void Bindings(){using(var f=new Fixture()){
  f.Review.environmentBindings=new[]{new BattlefieldReview.EnvironmentBinding{environmentId="sunlit-ash",root=f.Review.ashEnvironment},new BattlefieldReview.EnvironmentBinding{environmentId="sunlit-ash",root=f.Review.ironEnvironment}};
  Need(!f.Review.TrySelectEnvironment("sunlit-ash"),"duplicate binding must refuse");
  f.Review.environmentBindings=null;f.Review.sun=null;Need(!f.Review.TrySelectEnvironment("iron-perimeter"),"missing scene light must refuse");
 }}
 static void Cleanup(){
  var prior=new Color(.11f,.22f,.33f);var later=new Color(.7f,.2f,.5f);var pipeline=new UnityEngine.Rendering.RenderPipelineAsset();
  RenderSettings.ambientEquatorColor=prior;QualitySettings.renderPipeline=pipeline;
  using(var f=new Fixture()){
   f.Review.reviewPipeline=new UnityEngine.Rendering.RenderPipelineAsset();Invoke(f.Review,"Awake");
   Need(f.Review.TrySelectEnvironment("iron-perimeter"),"cleanup selected treatment");RenderSettings.ambientSkyColor=later;
   Invoke(f.Review,"OnDestroy");Need(RenderSettings.ambientSkyColor==later,"cleanup must preserve later sky owner");
   Need(RenderSettings.ambientEquatorColor==prior,"cleanup must restore still-owned equator");
   Need(ReferenceEquals(QualitySettings.renderPipeline,pipeline),"owned pipeline restored");
  }
 }
 static void PipelineLaterOwner(){
  using(var f=new Fixture()){
   f.Review.reviewPipeline=new UnityEngine.Rendering.RenderPipelineAsset();Invoke(f.Review,"Awake");
   var later=new UnityEngine.Rendering.RenderPipelineAsset();QualitySettings.renderPipeline=later;
   Invoke(f.Review,"OnDestroy");Need(ReferenceEquals(QualitySettings.renderPipeline,later),"later pipeline owner must survive cleanup");
  }
 }
 static int Main(string[] args){try{
  switch(args[0]){case "catalog":Catalog();break;case "selection":Selection();break;case "invalid":Invalid();break;case "combat":Combat();break;case "reuse":Reuse();break;case "comparison":Comparison();break;case "bindings":Bindings();break;case "cleanup":Cleanup();break;case "pipeline":PipelineLaterOwner();break;default:throw new Exception("Unknown case");}
  Console.WriteLine("PASS "+args[0]);return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
"""


def compile_checks(folder, review_source=None):
    folder = Path(folder)
    (folder / "UnityDoubles.cs").write_text(DOUBLES, encoding="utf-8")
    (folder / "EnvironmentSourceChecks.cs").write_text(CHECKS, encoding="utf-8")
    executable = folder / "EnvironmentSourceChecks.exe"
    argv = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{executable}",
            str(SCRIPTS / "LastStandEnvironmentCatalog.cs"),
            str(review_source or SCRIPTS / "BattlefieldReview.cs"),
            str(folder / "UnityDoubles.cs"), str(folder / "EnvironmentSourceChecks.cs")]
    result = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
    if result.returncode:
        raise AssertionError("Actual-source compile failed (not behavioral RED):\n" + result.stdout + result.stderr)
    return executable


class EnvironmentSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-environment-")
        cls.executable = compile_checks(cls.folder.name)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name, executable=None):
        result = subprocess.run([str(MONO), str(executable or self.executable), name],
                                capture_output=True, text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_authored_catalog_is_readonly_and_exact(self): self.case("catalog")
    def test_definition_routes_roots_and_lighting(self): self.case("selection")
    def test_unknown_or_missing_content_does_not_mutate(self): self.case("invalid")
    def test_active_model_and_presentation_refuse_changes(self): self.case("combat")
    def test_reused_identity_does_not_recreate_environment(self): self.case("reuse")
    def test_non_awarding_comparison_retains_treatment_switch(self): self.case("comparison")
    def test_duplicate_bindings_and_missing_light_refuse(self): self.case("bindings")
    def test_render_cleanup_restores_only_owned_fields(self): self.case("cleanup")
    def test_render_cleanup_preserves_later_pipeline_owner(self): self.case("pipeline")

    def assert_fault_detected(self, before, after, case, message):
        source = (SCRIPTS / "BattlefieldReview.cs").read_text(encoding="utf-8-sig")
        self.assertEqual(source.count(before), 1, "Fault anchor changed; inspect before retrying")
        with tempfile.TemporaryDirectory(prefix="st-environment-fault-") as folder:
            candidate = Path(folder) / "BattlefieldReview.cs"
            candidate.write_text(source.replace(before, after), encoding="utf-8")
            executable = compile_checks(folder, candidate)
            result = subprocess.run([str(MONO), str(executable), case], capture_output=True,
                                    text=True, encoding="utf-8-sig", timeout=30)
            self.assertNotEqual(result.returncode, 0, "Compiled fault was not detected")
            self.assertIn(message, result.stderr)

    def test_combat_guard_fault_is_detected(self):
        self.assert_fault_detected("if(Session?.Model!=null || presentation && presentation.EncounterActive)",
                                   "if(Session?.Model==null && presentation && presentation.EncounterActive)",
                                   "combat", "active model must block environment mutation")

    def test_cleanup_ownership_fault_is_detected(self):
        self.assert_fault_detected("if(RenderSettings.ambientSkyColor==Sky) RenderSettings.ambientSkyColor=prior.Sky;",
                                   "RenderSettings.ambientSkyColor=prior.Sky;", "cleanup", "cleanup must preserve later sky owner")


def imported_suite():
    """A separate explicitly selected real-Editor path; never run by the child author."""
    folder = ROOT / "campaign-unity/Evidence/last-stand-environments" / (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True, exist_ok=False)
    env = os.environ.copy()
    common = Path(env.get("ProgramData", "C:/ProgramData"))
    if not common.is_dir(): raise RuntimeError("ProgramData unavailable")
    env.setdefault("ProgramData", str(common)); env.setdefault("ALLUSERSPROFILE", str(common))
    env["ST_LS_PROJECT_CHECK"] = str(PROJECT)
    owned = subprocess.run(["powershell.exe", "-NoProfile", "-Command",
        "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"],
        env=env, capture_output=True, text=True, timeout=30)
    if owned.returncode: raise RuntimeError("An existing Unity Editor owns this project; refusing concurrent launch")
    log = folder / "unity-environments.log"
    argv = [str(EDITOR / "Editor/Unity.exe"), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
            "-executeMethod", "LastStandEnvironmentChecks.Run", "-logFile", str(log)]
    (folder / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT), "cases": IMPORTED_CASES}, indent=2))
    process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8", errors="replace")
    try: stdout, stderr = process.communicate(timeout=600)
    except subprocess.TimeoutExpired:
        process.kill(); stdout, stderr = process.communicate()
        (folder / "timeout.txt").write_text(stdout + "\n" + stderr, encoding="utf-8")
        raise
    content = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    passed = [name for name in IMPORTED_CASES if "ST_LS_ENVIRONMENT_PASS " + name in content]
    result = {"exit": process.returncode, "passed": passed, "stdout": stdout, "stderr": stderr}
    (folder / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("Environment imported-scene evidence:", folder, flush=True)
    if process.returncode or len(passed) != len(IMPORTED_CASES) or "ST_LS_ENVIRONMENT_FAIL " in content:
        raise AssertionError(content[-12000:] + stdout + stderr)


if __name__ == "__main__":
    if sys.argv[1:] == ["--imported"]: imported_suite()
    else: unittest.main()
