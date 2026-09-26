using System;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;

namespace SingedTerra.VisualReview
{
    // Scene-local art selection. Never advances or changes combat.
    public sealed class BattlefieldReview : MonoBehaviour
    {
        public GameObject ashEnvironment, ironEnvironment, closeVehicle, rangedVehicle;
        public Light sun;
        public Material flashMaterial, dustMaterial, scorchMaterial;
        public Mesh effectQuad;
        public UnityEngine.Rendering.RenderPipelineAsset reviewPipeline;
        public int Treatment { get; private set; }
        public float CameraPitch => Treatment == 0 ? 58f : 70f;
        public string TreatmentName => Treatment == 0 ? "SUNLIT ASH" : "IRON PERIMETER";
        public const float FramingRadius = 27.5f;
        public EncounterSession Session { get; set; }
        public event Action Changed;
        TankPresentation presentation;
        UnityEngine.Rendering.RenderPipelineAsset previousPipeline;
        bool ownsPipeline;
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
            if(ownsPipeline&&QualitySettings.renderPipeline==reviewPipeline)
                QualitySettings.renderPipeline=previousPipeline;
        }
        public void SelectAsh() { Select(0); }
        public void SelectIron() { Select(1); }
        void Select(int value)
        {
            string before = Session?.Model?.Snapshot();
            Treatment = value;
            ApplyEnvironment();
            presentation.RefreshReviewCamera();
            if (before != Session?.Model?.Snapshot())
                throw new InvalidOperationException("Visual selection changed combat");
            Report("treatment"); Changed?.Invoke();
        }
        void ApplyEnvironment()
        {
            ashEnvironment.SetActive(Treatment == 0); ironEnvironment.SetActive(Treatment == 1);
            sun.color = Treatment == 0 ? new Color(1f,.86f,.66f) : new Color(.78f,.87f,1f);
            sun.intensity = Treatment == 0 ? 1.65f : 1.35f;
            sun.transform.rotation = Quaternion.Euler(Treatment == 0 ? 42 : 53, -38, 0);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Treatment == 0 ? new Color(.55f,.59f,.64f) : new Color(.49f,.59f,.68f);
            RenderSettings.ambientEquatorColor = Treatment == 0 ? new Color(.39f,.34f,.28f) : new Color(.32f,.38f,.40f);
            RenderSettings.ambientGroundColor = new Color(.16f,.16f,.14f);
            RenderSettings.fog = false;
        }
        public void Report(string action)
        {
            if (!presentation || !presentation.view) return;
            var ring = new Vector3[32];
            for (int i=0; i<ring.Length; i++)
                ring[i] = presentation.view.WorldToViewportPoint(presentation.tank.position +
                    new Vector3(Mathf.Sin(i*Mathf.PI/16),0,Mathf.Cos(i*Mathf.PI/16))*FramingRadius + Vector3.up);
            Debug.Log("ST_VIS_STATE " + JsonUtility.ToJson(new State {
                action=action, treatment=Treatment, name=TreatmentName,
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
            public string action,name,profile,snapshot,scene;
            public int treatment,tick,width,height,sessions,views,canvases,eventSystems;
            public bool paused,fullEffects;
            public Vector3 camera,forward;
            public Vector3[] ring;
        }
    }
}
