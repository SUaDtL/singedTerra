These two shaders are adapted from Unity Render Pipelines 17.3.0, distributed
under the Unity Companion License for Unity-dependent projects.

`LastStandWebGLGlobalSettings.asset` is a copy of the project's URP settings
used only during the Last Stand WebGL export. It selects these shaders. A
build-scoped Unity graphics-settings stripper removes the inactive debug shader
container from the release player, and the export clears the renderer asset's
deprecated HDR debug reference in memory. The HDR shader's scatter write
requires an API unavailable in WebGL 2. The original settings and renderer
reference are restored afterward.

- `CoreCopyWebGL.shader`: `com.unity.render-pipelines.core/Shaders/CoreCopy.shader`.
  The WebGL 2 variant keeps the texture-backed copy pass and omits the
  unsupported per-sample MSAA pass. URP's `Blitter.CanCopyMSAA` uses the pass
  count to select its existing fallback. Native builds retain the original
  two-pass shader in the normal global settings asset.
- `StencilDitherMaskSeedWebGL.shader`: `com.unity.render-pipelines.universal/
  Shaders/Utils/StencilDitherMaskSeed.shader`. The fragment and stencil
  behavior is unchanged; the shader target is WebGL 2 compatible.
Copyright © 2020 Unity Technologies ApS. See the upstream package `LICENSE.md`
files and the Unity Companion License:
https://www.unity3d.com/legal/licenses/Unity_Companion_License
