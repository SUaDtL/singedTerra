using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

// Isolated production-sprite render: catches import, alpha and tile errors.
public static class LastStandParticleRenderChecks
{
    public static void Run()
    {
        EditorSceneManager.OpenScene(LastStandLoopBuild.ScenePath);
        var art=Object.FindFirstObjectByType<SingedTerra.Art.TankPresentation>();
        var camera=art.view;camera.transform.position=new Vector3(0,100,-10);camera.transform.rotation=Quaternion.identity;
        camera.orthographic=true;camera.orthographicSize=2.4f;camera.cullingMask=1<<30;
        camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.22f,.20f,.18f);
        camera.GetUniversalAdditionalCameraData().renderPostProcessing=true;
        var target=new RenderTexture(1600,600,24);camera.targetTexture=target;
        var atlas=Resources.Load<Texture2D>("ArtDirection/CombatParticles");
        for(int i=0;i<4;i++)
        {
            var quad=GameObject.CreatePrimitive(PrimitiveType.Quad);quad.layer=30;
            quad.transform.position=new Vector3((i-1.5f)*3,100,0);quad.transform.localScale=Vector3.one*2.7f;
            var mat=new Material(Shader.Find("SingedTerra/Combat Particle"));
            mat.SetTexture("_BaseMap",atlas);mat.SetVector("_Tile",new Vector4((i%2)*.5f,i<2?.5f:0,.5f,.5f));
            quad.GetComponent<Renderer>().sharedMaterial=mat;
            var block=new MaterialPropertyBlock();block.SetColor("_BaseColor",i<2?new Color(.52f,.51f,.49f,.52f):new Color(2.8f,1.8f,1f,.8f));block.SetFloat("_Spin",i<2?1.5f:0);
            quad.GetComponent<Renderer>().SetPropertyBlock(block);
            Debug.Log("PARTICLE_IMPORT tile="+mat.GetVector("_Tile")+" texture="+atlas.name+" shader="+mat.shader.name);
        }
        camera.Render();RenderTexture.active=target;
        var image=new Texture2D(1600,600,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1600,600),0,0);image.Apply();
        File.WriteAllBytes(Path.GetFullPath(Path.Combine(Application.dataPath,"../../Evidence/equipment-bay/particle-preview.png")),image.EncodeToPNG());
        Debug.Log("ST_PARTICLE_RENDER_PASS");
    }
}
