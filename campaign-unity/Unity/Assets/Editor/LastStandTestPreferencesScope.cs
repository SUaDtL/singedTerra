using System;
using SingedTerra.LastStand;
using UnityEngine;
using UnityEngine.Rendering;

// Existing scene checks predate preferences. Keep their settings disposable,
// independent of each other and entirely separate from the user's PlayerPrefs.
// Edit-mode checks manually create display owners without player teardown, so
// restore the exact quality override before a build snapshots/saves settings.
public sealed class LastStandTestPreferencesScope : IDisposable
{
    sealed class Storage : ILastStandStorage
    {
        string value;
        public string Read() => value;
        public void Write(string next) { value=next; }
    }
    readonly Func<ILastStandStorage> previous;
    readonly RenderPipelineAsset previousPipeline;
    public LastStandTestPreferencesScope()
    {
        previous=LastStandLoopController.PreferencesStorageFactory;
        previousPipeline=QualitySettings.renderPipeline;
        LastStandLoopController.PreferencesStorageFactory=()=>new Storage();
    }
    public void Dispose()
    {
        LastStandLoopController.PreferencesStorageFactory=previous;
        QualitySettings.renderPipeline=previousPipeline;
    }
}
