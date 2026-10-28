using System;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

namespace SingedTerra.VisualReview
{
    // Scene-local art selection. Never advances or changes combat.
    public sealed class BattlefieldReview : MonoBehaviour
    {
        [Serializable] public sealed class EnvironmentBinding
        {
            public string environmentId;
            public GameObject root;
        }
        public GameObject ashEnvironment, ironEnvironment, closeVehicle, rangedVehicle;
        // New scenes can bind further catalog entries here. Existing scenes
        // retain their serialized roots without an asset migration.
        public EnvironmentBinding[] environmentBindings;
        public Light sun;
        public Material flashMaterial, dustMaterial, scorchMaterial;
        public Mesh effectQuad;
        public UnityEngine.Rendering.RenderPipelineAsset reviewPipeline;
        public string EnvironmentId { get; private set; } = "sunlit-ash";
        public string EnvironmentSelectionError { get; private set; } = "";
        public int Treatment => LastStandEnvironmentCatalog.Get(EnvironmentId).TreatmentIndex;
        public float CameraPitch => LastStandEnvironmentCatalog.Get(EnvironmentId).CameraPitch;
        public string TreatmentName => LastStandEnvironmentCatalog.Get(EnvironmentId).Name.ToUpperInvariant();
        public const float FramingRadius = 27.5f;
        public EncounterSession Session { get; set; }
        public event Action Changed;
        TankPresentation presentation;
        UnityEngine.Rendering.RenderPipelineAsset previousPipeline;
        bool ownsPipeline;
        bool ownsRenderSettings;
        RenderState previousRenderState, appliedRenderState;

        struct RenderState
        {
            public UnityEngine.Rendering.AmbientMode Mode;
            public Color Sky, Equator, Ground;
            public bool Fog;
            public static RenderState Capture() => new RenderState {
                Mode=RenderSettings.ambientMode, Sky=RenderSettings.ambientSkyColor,
                Equator=RenderSettings.ambientEquatorColor, Ground=RenderSettings.ambientGroundColor,
                Fog=RenderSettings.fog
            };
            public void RestoreOwned(RenderState prior)
            {
                // Restore each field only while it still contains our value.
                // A later owner can replace one field without losing it here.
                if(RenderSettings.ambientMode==Mode) RenderSettings.ambientMode=prior.Mode;
                if(RenderSettings.ambientSkyColor==Sky) RenderSettings.ambientSkyColor=prior.Sky;
                if(RenderSettings.ambientEquatorColor==Equator) RenderSettings.ambientEquatorColor=prior.Equator;
                if(RenderSettings.ambientGroundColor==Ground) RenderSettings.ambientGroundColor=prior.Ground;
                if(RenderSettings.fog==Fog) RenderSettings.fog=prior.Fog;
            }
        }
        void Awake()
        {
            presentation = GetComponent<TankPresentation>();
            if(reviewPipeline&&!ownsPipeline)
            {
                previousPipeline=QualitySettings.renderPipeline;
                QualitySettings.renderPipeline=reviewPipeline;ownsPipeline=true;
            }
            ApplyEnvironment();
        }
        void OnDestroy()
        {
            if(ownsRenderSettings) appliedRenderState.RestoreOwned(previousRenderState);
            if(ownsPipeline&&QualitySettings.renderPipeline==reviewPipeline)
                QualitySettings.renderPipeline=previousPipeline;
            ownsRenderSettings=ownsPipeline=false;
        }
        public void SelectAsh() { SelectReviewEnvironment("sunlit-ash"); }
        public void SelectIron() { SelectReviewEnvironment("iron-perimeter"); }
        void SelectReviewEnvironment(string id)
        {
            // The independent comparison scene deliberately permits matched
            // treatment changes during its non-awarding review encounter.
            if(GetComponent<LastStandLoopController>()) { TrySelectEnvironment(id); return; }
            SelectEnvironment(id);
        }
        public bool TrySelectEnvironment(string id)
        {
            EnvironmentSelectionError="";
            if(!CanPresentEnvironment(id,out var error))
            { EnvironmentSelectionError=error; return false; }
            if(id==EnvironmentId) return true;
            if(Session?.Model!=null || presentation && presentation.EncounterActive)
            { EnvironmentSelectionError="The battlefield cannot change during a run."; return false; }
            SelectEnvironment(id); return true;
        }
        // Shared non-mutating admission for runtime selection and build checks.
        public bool CanPresentEnvironment(string id,out string error)
        {
            if(!LastStandEnvironmentCatalog.TryGet(id,out _))
            { error="Unknown battlefield environment.";return false; }
            if(!BindingsAreValid(id,out error))return false;
            if(!sun){error="Battlefield environment has no scene light.";return false;}
            error="";return true;
        }
        void SelectEnvironment(string id)
        {
            string before = Session?.Model?.Snapshot();
            if(!BindingsAreValid(id,out var error)) throw new InvalidOperationException(error);
            EnvironmentId = id;
            ApplyEnvironment();
            if(presentation) presentation.RefreshReviewCamera();
            if (before != Session?.Model?.Snapshot())
                throw new InvalidOperationException("Visual selection changed combat");
            Report("treatment"); Changed?.Invoke();
        }
        EnvironmentBinding[] Bindings => environmentBindings!=null && environmentBindings.Length>0 ? environmentBindings : new[] {
            new EnvironmentBinding { environmentId="sunlit-ash", root=ashEnvironment },
            new EnvironmentBinding { environmentId="iron-perimeter", root=ironEnvironment }
        };
        bool BindingsAreValid(string selected, out string error)
        {
            bool found=false;
            var ids=new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
            foreach(var binding in Bindings)
            {
                if(binding==null || !LastStandEnvironmentCatalog.TryGet(binding.environmentId,out _) ||
                    !binding.root || !ids.Add(binding.environmentId))
                { error="Battlefield environment bindings are incomplete or duplicated."; return false; }
                found|=binding.environmentId==selected;
            }
            error=found ? "" : "The selected battlefield has no authored environment.";
            return found;
        }
        void ApplyEnvironment()
        {
            if(!BindingsAreValid(EnvironmentId,out var error)) throw new InvalidOperationException(error);
            if(!sun) throw new InvalidOperationException("Battlefield environment has no scene light.");
            if(!ownsRenderSettings) { previousRenderState=RenderState.Capture(); ownsRenderSettings=true; }
            var environment=LastStandEnvironmentCatalog.Get(EnvironmentId);
            foreach(var binding in Bindings) binding.root.SetActive(binding.environmentId==EnvironmentId);
            sun.color = environment.SunColor;
            sun.intensity = environment.SunIntensity;
            sun.transform.rotation = Quaternion.Euler(environment.SunPitch, -38, 0);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = environment.AmbientSky;
            RenderSettings.ambientEquatorColor = environment.AmbientEquator;
            RenderSettings.ambientGroundColor = environment.AmbientGround;
            RenderSettings.fog = false;
            appliedRenderState=RenderState.Capture();
        }
        public void Report(string action)
        {
            if (!presentation || !presentation.view) return;
            var ring = new Vector3[32];
            for (int i=0; i<ring.Length; i++)
                ring[i] = presentation.view.WorldToViewportPoint(presentation.tank.position +
                    new Vector3(Mathf.Sin(i*Mathf.PI/16),0,Mathf.Cos(i*Mathf.PI/16))*FramingRadius + Vector3.up);
            Debug.Log("ST_VIS_STATE " + JsonUtility.ToJson(new State {
                action=action, treatment=Treatment, name=TreatmentName, environmentId=EnvironmentId,
                tick=Session?.Model?.Tick ?? 0, profile=Session?.Model?.Profile.Id ?? "review-pacing-v1",
                snapshot=Session?.Model?.Snapshot() ?? "", paused=Session?.Paused ?? false,
                width=Screen.width, height=Screen.height, ring=ring,
                camera=presentation.view.transform.position, forward=presentation.view.transform.forward,
                scene=gameObject.scene.name, fullEffects=Session?.View?.FullEffects ?? true,
                sessions=FindObjectsByType<EncounterSession>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length,
                views=FindObjectsByType<EncounterView>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length,
                canvases=FindObjectsByType<Canvas>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length,
                eventSystems=FindObjectsByType<UnityEngine.EventSystems.EventSystem>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length
            }));
        }
        [Serializable] sealed class State
        {
            public string action,name,profile,snapshot,scene,environmentId;
            public int treatment,tick,width,height,sessions,views,canvases,eventSystems;
            public bool paused,fullEffects;
            public Vector3 camera,forward;
            public Vector3[] ring;
        }
    }
}
