using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Unity serializes the editor's debug resource container unless a build stripper
// explicitly removes it. Its HDR debug shader requires UAV scatter writes that
// WebGL 2 cannot support, and Last Stand's release player has no DebugHandler.
public sealed class LastStandWebDebugResourcesStripper : IRenderPipelineGraphicsSettingsStripper<UniversalRenderPipelineDebugShaders>
{
    public bool active => LastStandLoopBuild.StripWebDebugSettings;

    public bool CanRemoveSettings(UniversalRenderPipelineDebugShaders settings)
    {
        if (LastStandLoopBuild.StripWebDebugSettings)
            LastStandLoopBuild.WebDebugSettingsStripped = true;
        return LastStandLoopBuild.StripWebDebugSettings;
    }
}
