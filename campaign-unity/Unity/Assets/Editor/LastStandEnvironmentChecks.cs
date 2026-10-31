using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Actual imported scene and authored environment bindings. This proves scene
// state and admission, not rendered pixels or owner acceptance of the artwork.
public static class LastStandEnvironmentChecks
{
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    sealed class Storage : ILastStandStorage
    {
        public string Value;
        public string Read()=>Value;
        public void Write(string value) { Value=value; }
    }
    sealed class Fixture
    {
        public readonly TankPresentation Art;
        public readonly BattlefieldReview Review;
        public readonly LastStandLoopController Loop;
        public readonly EncounterSession Session;
        public Fixture(bool comparison=false)
        {
            LastStandLoopController.StorageFactory=()=>new Storage();
            LastStandLoopController.PreferencesStorageFactory=()=>new Storage();
            EditorSceneManager.OpenScene(comparison ? "Assets/Scenes/BattlefieldReview.unity" :
                "Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
            Art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Require(Art,"actual scene tank");Review=Art.GetComponent<BattlefieldReview>();
            Require(Review,"actual scene environment owner");Invoke(Review,"Awake");
            Invoke(Art,"Start");Invoke(Art.GetComponent<ArtHud>(),"Start");
            Loop=Art.GetComponent<LastStandLoopController>();Session=Art.GetComponent<EncounterSession>();
            Require(Session,"actual session");Field(Session,"focused",true);Field(Session,"applicationPaused",false);
        }
    }
    static void Require(bool value,string label)
    { if(!value)throw new InvalidOperationException("Environment integration: "+label); }
    static void Invoke(object target,string name)
    { target.GetType().GetMethod(name,Private).Invoke(target,null); }
    static void Field(object target,string name,object value)
    { target.GetType().GetField(name,Private).SetValue(target,value); }
    static void Check(string name,Action body)
    {
        try { body();Debug.Log("ST_LS_ENVIRONMENT_PASS "+name); }
        catch(Exception error) { Debug.LogError("ST_LS_ENVIRONMENT_FAIL "+name+" "+error);throw; }
    }
    public static void Run()
    {
        var game=LastStandLoopController.StorageFactory;
        var preferences=LastStandLoopController.PreferencesStorageFactory;
        var pipeline=QualitySettings.renderPipeline;
        bool background=Application.runInBackground;
        try
        {
            Check("authored_environment_roots_and_lighting",AuthoredEnvironmentRootsAndLighting);
            Check("invalid_and_missing_environment_refuse",InvalidAndMissingEnvironmentRefuse);
            Check("active_combat_environment_is_immutable",ActiveCombatEnvironmentIsImmutable);
            Check("same_identity_reuse_is_idempotent",SameIdentityReuseIsIdempotent);
            Check("comparison_scene_retains_treatment_switching",ComparisonSceneRetainsTreatmentSwitching);
            Check("render_setting_cleanup_preserves_later_owner",RenderSettingCleanupPreservesLaterOwner);
            Check("campaign_geometry_palette_and_light",CampaignGeometryPaletteAndLight);
            Check("campaign_authoring_is_idempotent_and_scoped",CampaignAuthoringIsIdempotentAndScoped);
        }
        finally
        {
            LastStandLoopController.StorageFactory=game;LastStandLoopController.PreferencesStorageFactory=preferences;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }
    static void AuthoredEnvironmentRootsAndLighting()
    {
        var f=new Fixture();string record=f.Loop.Progression.SaveState;
        Require(f.Review.TrySelectEnvironment("iron-perimeter"),"select authored Iron Perimeter");
        Require(!f.Review.ashEnvironment.activeSelf&&f.Review.ironEnvironment.activeSelf,"distinct authored root active");
        Require(f.Review.sun.color==LastStandEnvironmentCatalog.Get("iron-perimeter").SunColor&&
            f.Review.sun.intensity==1.35f&&f.Review.CameraPitch==70,"Iron light and framing");
        Require(f.Review.TrySelectEnvironment("sunlit-ash"),"restore authored Sunlit Ash");
        Require(f.Review.ashEnvironment.activeSelf&&!f.Review.ironEnvironment.activeSelf,"Ash root restored");
        Require(f.Review.sun.color==LastStandEnvironmentCatalog.Get("sunlit-ash").SunColor&&
            f.Review.sun.intensity==1.65f&&f.Review.CameraPitch==58,"Ash light and framing");
        Require(f.Loop.Progression.SaveState==record&&f.Loop.Progression.SelectedTier==1&&
            f.Loop.Progression.ActiveRunId==0&&f.Session.Model==null,"environment preview changes no gameplay state");
    }
    static void InvalidAndMissingEnvironmentRefuse()
    {
        var f=new Fixture();var color=f.Review.sun.color;
        Require(!f.Review.TrySelectEnvironment("tier-18")&&f.Review.EnvironmentSelectionError!="","unknown identity refused");
        Require(f.Review.EnvironmentId=="sunlit-ash"&&f.Review.ashEnvironment.activeSelf&&f.Review.sun.color==color,"invalid identity is no mutation");
        f.Review.environmentBindings=new[]{new BattlefieldReview.EnvironmentBinding {
            environmentId="sunlit-ash",root=f.Review.ashEnvironment }};
        Require(!f.Review.TrySelectEnvironment("iron-perimeter"),"missing authored binding refused");
        f.Review.environmentBindings=new[]{new BattlefieldReview.EnvironmentBinding {
            environmentId="sunlit-ash",root=null }};
        Require(!f.Review.TrySelectEnvironment("sunlit-ash"),"same identity still validates missing content");
        Require(f.Review.EnvironmentId=="sunlit-ash"&&f.Review.sun.color==color,"bad bindings cannot commit an identity");
    }
    static void ActiveCombatEnvironmentIsImmutable()
    {
        var f=new Fixture();f.Loop.Deploy();Require(f.Session.Model!=null,"real reserved run deployed");
        string before=f.Session.Model.Snapshot(),environment=f.Review.EnvironmentId;
        Require(!f.Review.TrySelectEnvironment("iron-perimeter"),"active model rejects environment change");
        foreach(string id in new[]{"cinder-basin","storm-foundry"})
            Require(!f.Review.TrySelectEnvironment(id)&&f.Session.Model.Snapshot()==before,"campaign cannot replace active combat");
        f.Review.SelectIron();
        Require(f.Review.EnvironmentId==environment&&f.Session.Model.Snapshot()==before,"legacy entry cannot bypass playable guard");
        Require(f.Review.TrySelectEnvironment(environment)&&f.Session.Model.Snapshot()==before,"same active identity is a no-op");
    }
    static void SameIdentityReuseIsIdempotent()
    {
        var f=new Fixture();Require(f.Review.TrySelectEnvironment("iron-perimeter"),"first environment selection");
        int changes=0;f.Review.Changed+=()=>changes++;
        for(int i=0;i<18;i++)Require(f.Review.TrySelectEnvironment("iron-perimeter"),"reuse existing environment identity");
        Require(changes==0&&f.Review.ironEnvironment.activeSelf,"reusing a definition creates no new environment or change event");
        var catalog=LastStandEnvironmentCatalog.All;
        Require(catalog.Count==4&&ReferenceEquals(catalog[1],LastStandEnvironmentCatalog.Get("iron-perimeter")),"one immutable definition per authored environment");
        bool refused=false;
        try { ((IList<LastStandEnvironmentDefinition>)catalog)[0]=catalog[1]; }
        catch(NotSupportedException) { refused=true; }
        Require(refused,"catalog cannot be rewritten by a consumer");
    }
    static void ComparisonSceneRetainsTreatmentSwitching()
    {
        var f=new Fixture(true);Require(!f.Loop,"comparison has no awarding controller");
        f.Session.Deploy();Require(f.Session.Model!=null,"comparison run deployed");
        string before=f.Session.Model.Snapshot();f.Review.SelectIron();
        Require(f.Review.EnvironmentId=="iron-perimeter"&&f.Session.Model.Snapshot()==before,"non-awarding comparison still changes treatment only");
        f.Review.SelectAsh();Require(f.Review.Treatment==0&&f.Session.Model.Snapshot()==before,"comparison returns to first treatment");
    }
    static void RenderSettingCleanupPreservesLaterOwner()
    {
        var f=new Fixture();
        // Release the imported owner, then start a fresh ownership interval from
        // known scene values. Later owners retain fields they actually replaced.
        Invoke(f.Review,"OnDestroy");
        Color priorSky=new Color(.11f,.22f,.33f),priorEquator=new Color(.21f,.32f,.43f),laterSky=new Color(.7f,.2f,.5f);
        RenderSettings.ambientSkyColor=priorSky;RenderSettings.ambientEquatorColor=priorEquator;
        Invoke(f.Review,"Awake");Require(f.Review.TrySelectEnvironment("iron-perimeter"),"new ownership interval");
        RenderSettings.ambientSkyColor=laterSky;
        Invoke(f.Review,"OnDestroy");
        Require(RenderSettings.ambientSkyColor==laterSky,"later sky owner preserved");
        Require(RenderSettings.ambientEquatorColor==priorEquator,"still-owned equator restored exactly");
    }
    static GameObject Root(BattlefieldReview review,string id)
    {
        var matches=(review.environmentBindings??Array.Empty<BattlefieldReview.EnvironmentBinding>())
            .Where(b=>b!=null&&b.environmentId==id).ToArray();
        Require(matches.Length==1&&matches[0].root,"one saved campaign binding: "+id);
        return matches[0].root;
    }
    static void CampaignGeometryPaletteAndLight()
    {
        var f=new Fixture();string save=f.Loop.Progression.SaveState;
        Require(f.Review.environmentBindings!=null&&f.Review.environmentBindings.Length==4,"four saved roots including retained environments");
        Require(Root(f.Review,"sunlit-ash")==f.Review.ashEnvironment&&Root(f.Review,"iron-perimeter")==f.Review.ironEnvironment,"retained roots keep their serialized identity");
        var cinder=Root(f.Review,"cinder-basin");var foundry=Root(f.Review,"storm-foundry");
        Require(cinder!=foundry&&cinder.transform.Find("SceneryPolish01/Broken caldera rim")&&
            foundry.transform.Find("SceneryPolish01/Northern foundry yard"),"different authored landmark compositions");
        var cinderMeshes=cinder.GetComponentsInChildren<MeshFilter>(true).Select(m=>AssetDatabase.GetAssetPath(m.sharedMesh)).Distinct().OrderBy(p=>p).ToArray();
        var foundryMeshes=foundry.GetComponentsInChildren<MeshFilter>(true).Select(m=>AssetDatabase.GetAssetPath(m.sharedMesh)).Distinct().OrderBy(p=>p).ToArray();
        Require(!cinderMeshes.SequenceEqual(foundryMeshes),"campaign environments use different real geometry, not recolored clones");
        var cinderGround=cinder.transform.Find("ContinuousGround").GetComponent<Renderer>().sharedMaterial;
        var foundryGround=foundry.transform.Find("ContinuousGround").GetComponent<Renderer>().sharedMaterial;
        Require(AssetDatabase.GetAssetPath(cinderGround)==LastStandCampaignEnvironmentBuild.CinderMaterialPath&&
            AssetDatabase.GetAssetPath(foundryGround)==LastStandCampaignEnvironmentBuild.FoundryMaterialPath&&
            cinderGround.GetColor("_BaseColor")!=foundryGround.GetColor("_BaseColor"),"independent saved ground palettes");
        f.Art.SetView(true,true);
        foreach(string id in new[]{"cinder-basin","storm-foundry"})
        {
            Require(f.Review.TrySelectEnvironment(id),"actual authored campaign selection");
            var definition=LastStandEnvironmentCatalog.Get(id);var root=Root(f.Review,id);
            Require(f.Review.sun.color==definition.SunColor&&f.Review.sun.intensity==definition.SunIntensity&&
                RenderSettings.ambientSkyColor==definition.AmbientSky&&RenderSettings.ambientEquatorColor==definition.AmbientEquator,
                "campaign sun and ambient settings are applied");
            Require(f.Review.environmentBindings.Count(b=>b.root.activeSelf)==1&&root.activeSelf,"only selected scenery is active");
            Require(root.GetComponentsInChildren<Collider>(true).Length==0&&root.GetComponentsInChildren<MonoBehaviour>(true).Length==0,"scenery remains presentation-only");
            foreach(float aspect in new[]{16f/9f,4f/3f,9f/16f})
            { f.Art.view.aspect=aspect;f.Art.RefreshReviewCamera();VisualReviewPolish.ValidateScenery(f.Review,f.Art.view,root); }
            int changes=0;f.Review.Changed+=()=>changes++;
            for(int n=0;n<5;n++)Require(f.Review.TrySelectEnvironment(id),"repeat campaign identity");
            Require(changes==0,"campaign identity reuse emits no duplicate selection");
        }
        Require(f.Loop.Progression.SaveState==save&&f.Session.Model==null,"campaign preview changes neither progression nor combat");
    }
    static void CampaignAuthoringIsIdempotentAndScoped()
    {
        var f=new Fixture();var scene=f.Review.gameObject.scene;
        var before=File.ReadAllBytes(scene.path);
        var cinderBytes=File.ReadAllBytes(LastStandCampaignEnvironmentBuild.CinderMaterialPath);
        var foundryBytes=File.ReadAllBytes(LastStandCampaignEnvironmentBuild.FoundryMaterialPath);
        var ash=f.Review.ashEnvironment;var iron=f.Review.ironEnvironment;
        var sentinel=new GameObject("Unrelated environment authoring sentinel");
        var child=new GameObject("Unrelated retained child");child.transform.SetParent(Root(f.Review,"cinder-basin").transform,false);
        Require(!LastStandCampaignEnvironmentBuild.EnsureAuthored(scene),"second authoring call is a read-only no-op");
        Require(sentinel&&child&&f.Review.ashEnvironment==ash&&f.Review.ironEnvironment==iron,"repeat preserves unrelated roots, children and retained identities");
        var bindings=f.Review.environmentBindings;
        f.Review.environmentBindings=bindings.Take(2).ToArray();bool refused=false;
        try { LastStandCampaignEnvironmentBuild.EnsureAuthored(scene); } catch(InvalidOperationException) { refused=true; }
        Require(refused&&sentinel&&child,"partial or unknown root ownership refuses without deletion");
        string cinderName=bindings[2].root.name,foundryName=bindings[3].root.name;
        bindings[2].root.name="Unrelated cinder root";bindings[3].root.name="Unrelated foundry root";
        int rootCount=scene.rootCount;refused=false;
        try { LastStandCampaignEnvironmentBuild.EnsureAuthored(scene); }
        catch(InvalidOperationException error) { refused=error.Message.Contains("refuse to overwrite existing or unknown asset"); }
        Require(refused&&scene.rootCount==rootCount&&sentinel&&child,"unowned preexisting material blocks creation before any root mutation");
        bindings[2].root.name=cinderName;bindings[3].root.name=foundryName;
        f.Review.environmentBindings=bindings;
        var ground=Root(f.Review,"cinder-basin").transform.Find("ContinuousGround").GetComponent<Renderer>();
        ground.sharedMaterial=Root(f.Review,"storm-foundry").transform.Find("ContinuousGround").GetComponent<Renderer>().sharedMaterial;
        refused=false;try { LastStandCampaignEnvironmentBuild.EnsureAuthored(scene); } catch(InvalidOperationException) { refused=true; }
        Require(refused,"conflicting material ownership refuses instead of replacing an asset");
        Require(before.SequenceEqual(File.ReadAllBytes(scene.path))&&cinderBytes.SequenceEqual(File.ReadAllBytes(LastStandCampaignEnvironmentBuild.CinderMaterialPath))&&
            foundryBytes.SequenceEqual(File.ReadAllBytes(LastStandCampaignEnvironmentBuild.FoundryMaterialPath)),"repeated and rejected authoring writes no saved bytes");
        var other=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        refused=false;try { LastStandCampaignEnvironmentBuild.EnsureAuthored(other); } catch(InvalidOperationException) { refused=true; }
        Require(refused&&other.rootCount==0,"authoring refuses every other scene before creating content");
    }
}
