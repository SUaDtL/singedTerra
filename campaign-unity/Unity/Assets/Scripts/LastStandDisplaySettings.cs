using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace SingedTerra.LastStand
{
    // Own only a runtime clone. Authored/shared pipeline assets are never changed.
    public sealed class LastStandDisplaySettings : MonoBehaviour
    {
        RenderPipelineAsset previous;
        UniversalRenderPipelineAsset owned;
        float originalScale;
        public bool Available => GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset;
        public float RenderScale => owned ? owned.renderScale : 1;
        public bool Apply(LastStandQuality quality)
        {
            if (!owned)
            {
                var source = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
                if (!source) return false;
                previous = QualitySettings.renderPipeline;
                originalScale = source.renderScale;
                owned = Instantiate(source); owned.name = "LastStandRuntimeDisplay";
                QualitySettings.renderPipeline = owned;
            }
            owned.renderScale = quality == LastStandQuality.Performance ? .75f : originalScale;
            return true;
        }
        void OnDestroy()
        {
            if (!owned) return;
            if (QualitySettings.renderPipeline == owned) QualitySettings.renderPipeline = previous;
            Destroy(owned);
        }
    }
}
