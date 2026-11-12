using System.Collections.Generic;
using UnityEngine;
using SingedTerra.Art;

namespace SingedTerra.VisualReview
{
    // Low silhouette, render-only cover and debris. No colliders or encounter state.
    internal sealed class LastStandBattlefieldDressing : System.IDisposable
    {
        readonly Transform transform;
        LastStandBattlefieldDressing(Transform root){transform=root;}
        Mesh bags,rubble,steelwork,sceneryQuad;
        readonly List<Material> sceneryMaterials=new List<Material>();
        Material bagMaterial,rubbleMaterial,steelMaterial;
        public static LastStandBattlefieldDressing Add(Transform environment,float cameraPitch=44)
        {
            if(!environment||environment.Find("Industrial field detail"))return null;
            var root=new GameObject("Industrial field detail");root.transform.SetParent(environment,false);
            var dressing=new LastStandBattlefieldDressing(root.transform);dressing.Build(cameraPitch);return dressing;
        }
        void Build(float cameraPitch)
        {
            var shader=Shader.Find("Universal Render Pipeline/Lit");
            bagMaterial=new Material(shader){name="Dust covered canvas"};
            bagMaterial.SetTexture("_BaseMap",Resources.Load<Texture2D>("ArtDirection/AshTerrain"));bagMaterial.SetColor("_BaseColor",new Color(.90f,.84f,.65f));
            bagMaterial.SetFloat("_Smoothness",.03f);
            rubbleMaterial=new Material(Shader.Find("SingedTerra/Weathered Steel")){name="Broken field concrete"};
            rubbleMaterial.SetTexture("_BaseMap",Resources.Load<Texture2D>("ArtDirection/AshTerrain"));rubbleMaterial.SetColor("_BaseColor",new Color(.48f,.49f,.47f));
            rubbleMaterial.SetFloat("_Smoothness",.03f);rubbleMaterial.SetFloat("_Metallic",0);rubbleMaterial.SetFloat("_SurfaceScale",.55f);
            steelMaterial=new Material(shader){name="Ruined gantry steel"};steelMaterial.SetTexture("_BaseMap",Resources.Load<Texture2D>("ArtDirection/WeatheredArmor"));
            steelMaterial.SetColor("_BaseColor",new Color(.27f,.27f,.25f));steelMaterial.SetFloat("_Metallic",.65f);steelMaterial.SetFloat("_Smoothness",.25f);
            var shape=LastStandModuleGeometry.Prism(true,"Field cover");var bag=RoundedShape(false);var stone=BrokenConcrete();
            var cylinder=LastStandModuleGeometry.Prism(false,"Abandoned pipe");
            var cover=new List<CombineInstance>();var debris=new List<CombineInstance>();var steel=new List<CombineInstance>();
            System.Action<Vector3,Vector3,float> beam=(a,b,r)=>steel.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS((a+b)*.5f,Quaternion.LookRotation(b-a),new Vector3(r,r,(b-a).magnitude))});
            // Damaged service gantries stay outside the encounter's approach ring.
            for(int group=0;group<12;group++)
            {
                float angle=(group*30+17)*Mathf.Deg2Rad;float perimeter=36.5f+group%3*3.2f;
                var centre=new Vector3(Mathf.Sin(angle)*perimeter,0,Mathf.Cos(angle)*perimeter);
                var side=new Vector3(Mathf.Cos(angle),0,-Mathf.Sin(angle));float height=group%2==0?5.2f:3.6f;
                for(int end=-1;end<=1;end+=2)
                {
                    var p=centre+side*end*2;
                    beam(p,p+Vector3.up*height,.20f);beam(p+side*.4f,p+side*.4f+Vector3.up*height,.12f);
                    for(int step=0;step<5;step++)beam(p+Vector3.up*(step*.8f),p+side*.4f+Vector3.up*(step*.8f),.08f);
                }
                beam(centre-side*2+Vector3.up*height,centre+side*2+Vector3.up*height,.23f);
                beam(centre-side*2+Vector3.up*.5f,centre+side*2+Vector3.up*(height-.3f),.10f);
                for(int n=0;n<6;n++)
                {
                    var p=centre+side*(n*.65f-1.6f)+Vector3.up*(height-.25f);
                    steel.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS(p,Quaternion.Euler(0,angle*Mathf.Rad2Deg,8+n*3),new Vector3(.61f,.07f,1.4f))});
                }
                // Buckled factory facade, broken corrugated panels and pipes
                // create a continuous ruined perimeter behind the attack lanes.
                for(int n=0;n<9;n++)
                {
                    var p=centre+side*(n*.48f-1.9f)+Vector3.up*(1.5f+(n%3)*.22f);
                    steel.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS(p,Quaternion.Euler(0,angle*Mathf.Rad2Deg,n%2==0?8:-5),new Vector3(.45f,2.7f+(n%3)*.4f,.10f))});
                }
                for(int pipe=0;pipe<4;pipe++)
                {
                    var p=centre+side*(pipe*.47f-.8f)+Vector3.up*.24f;
                    steel.Add(new CombineInstance{mesh=cylinder,transform=Matrix4x4.TRS(p,Quaternion.Euler(0,angle*Mathf.Rad2Deg+21,0),new Vector3(.38f,.38f,3.8f))});
                }
                beam(centre-side*2+Vector3.up*.2f,centre+side*3+Vector3.up*1.1f,.22f);
            }
            var random=new System.Random(83117);
            for(int arc=0;arc<8;arc++)for(int tier=0;tier<3;tier++)for(int n=0;n<5-tier%2;n++)
            {
                float angle=(arc*45+11+n*5+tier*2)*Mathf.Deg2Rad;
                float radius=5.6f+(float)random.NextDouble()*.15f;
                var p=new Vector3(Mathf.Sin(angle)*radius,.16f+tier*.25f,Mathf.Cos(angle)*radius);
                cover.Add(new CombineInstance{mesh=bag,transform=Matrix4x4.TRS(p,Quaternion.Euler(0,angle*Mathf.Rad2Deg,(float)random.NextDouble()*8-4),new Vector3(.83f,.32f,.59f))});
            }
            // The central position has a built history: fractured concrete
            // footings, ammunition cases and stacked canvas, with open gaps.
            for(int group=0;group<8;group++)
            {
                float angle=(group*45+23)*Mathf.Deg2Rad;var rotation=Quaternion.Euler(0,angle*Mathf.Rad2Deg,0);
                var p=new Vector3(Mathf.Sin(angle)*6.1f,.22f,Mathf.Cos(angle)*6.1f);
                debris.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS(p,rotation,new Vector3(2.0f,.43f,.65f))});
                if(group%3==0)
                {
                    p*=.77f;p.y=.27f;
                    cover.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS(p,rotation,new Vector3(.9f,.52f,.65f))});
                    for(int strap=-1;strap<=1;strap+=2)
                        cover.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS(p+rotation*new Vector3(strap*.28f,.27f,0),rotation,new Vector3(.065f,.025f,.69f))});
                }
            }
            // Large grouped fragments give scale and paths; small debris fills
            // their edges. The low layer cannot cover enemy silhouettes.
            for(int cluster=0;cluster<23;cluster++)
            {
                float angle=(float)random.NextDouble()*Mathf.PI*2,r=12+(float)random.NextDouble()*26;
                var centre=new Vector3(Mathf.Sin(angle)*r,0,Mathf.Cos(angle)*r);
                if(cluster%3==0)
                {
                    for(int section=0;section<2;section++)
                        debris.Add(new CombineInstance{mesh=stone,transform=Matrix4x4.TRS(centre+new Vector3(section*1.7f,.06f,section*.65f),
                            Quaternion.Euler(0,angle*Mathf.Rad2Deg+section*28,0),new Vector3(2.3f+(float)random.NextDouble()*1.3f,1.2f,.8f+(float)random.NextDouble()*.6f))});
                }
                for(int i=0;i<14;i++)
                {
                    float a=(float)random.NextDouble()*Mathf.PI*2,d=(float)random.NextDouble()*3.2f;
                    float size=i<3?.65f+(float)random.NextDouble()*.65f:.10f+Mathf.Pow((float)random.NextDouble(),2)*.6f;
                    var p=centre+new Vector3(Mathf.Sin(a)*d,size*.04f,Mathf.Cos(a)*d);
                    debris.Add(new CombineInstance{mesh=stone,transform=Matrix4x4.TRS(p,
                        Quaternion.Euler((float)random.NextDouble()*16,(float)random.NextDouble()*360,0),new Vector3(size,size*(i<5?.43f:.7f),size*(.6f+(float)random.NextDouble())))});
                    if(i<3)
                    {
                        var end=p+new Vector3(Mathf.Cos(a)*2.4f,.12f,Mathf.Sin(a)*2.4f);
                        // Horizontal scrap belongs to the low debris batch.
                        debris.Add(new CombineInstance{mesh=shape,transform=Matrix4x4.TRS((p+end)*.5f,Quaternion.LookRotation(end-p),new Vector3(.07f,.09f,(end-p).magnitude))});
                    }
                }
            }
            for(int i=0;i<180;i++)
            {
                float angle=(float)random.NextDouble()*Mathf.PI*2,r=8+(float)random.NextDouble()*28,size=.1f+(float)random.NextDouble()*.25f;
                debris.Add(new CombineInstance{mesh=stone,transform=Matrix4x4.TRS(new Vector3(Mathf.Sin(angle)*r,.03f,Mathf.Cos(angle)*r),Quaternion.Euler(0,i*137.5f,0),new Vector3(size,size*.45f,size))});
            }
            bags=Combine(cover,"Field barricades",bagMaterial);rubble=Combine(debris,"Scattered fragments",rubbleMaterial);
            steelwork=Combine(steel,"Derelict service gantries",steelMaterial);
            AddDistantScenery(cameraPitch);
            AddGroundRuins(cameraPitch);
            LastStandModuleGeometry.Release(shape);LastStandModuleGeometry.Release(bag);LastStandModuleGeometry.Release(stone);LastStandModuleGeometry.Release(cylinder);
        }
        void AddDistantScenery(float pitch)
        {
            var texture=Resources.Load<Texture2D>("ArtDirection/IndustrialRuins");if(!texture)return;
            sceneryQuad=new Mesh{name="Distant scenery plane"};
            sceneryQuad.vertices=new[]{new Vector3(-.5f,-.5f,0),new Vector3(-.5f,.5f,0),new Vector3(.5f,.5f,0),new Vector3(.5f,-.5f,0)};
            sceneryQuad.uv=new[]{Vector2.zero,Vector2.up,Vector2.one,Vector2.right};sceneryQuad.triangles=new[]{0,1,2,0,2,3};sceneryQuad.RecalculateBounds();sceneryQuad.RecalculateNormals();
            for(int cell=0;cell<4;cell++)
            {
                var material=new Material(Shader.Find("SingedTerra/Combat Particle")){name="Distant industrial ruin "+cell};
                material.SetTexture("_BaseMap",texture);material.SetVector("_Tile",new Vector4((cell%2)*.5f,cell<2?.5f:0,.5f,.5f));
                material.SetColor("_BaseColor",new Color(.82f,.78f,.69f));sceneryMaterials.Add(material);
            }
            // Static high-detail impostors are reserved for the unreachable
            // perimeter. Combatants, cover and nearby fragments remain meshes.
            var rotation=Quaternion.Euler(0,-30,0);var right=Quaternion.Euler(0,-30,0)*Vector3.right;
            var forward=Quaternion.Euler(0,-30,0)*Vector3.forward;
            Vector2[] anchors={new Vector2(-36,8),new Vector2(36,10),new Vector2(-32,16),new Vector2(32,18),
                new Vector2(-33,-23),new Vector2(34,-21),new Vector2(-28,25),new Vector2(28,26)};
            int[] cells={2,0,1,3,3,0,2,1};
            for(int i=0;i<anchors.Length;i++)
            {
                float size=i%3==0?10.5f:9f;float height=size/Mathf.Cos(pitch*Mathf.Deg2Rad);var anchor=right*anchors[i].x+forward*anchors[i].y;
                var part=LastStandModuleGeometry.Part("Perimeter industrial ruin "+i,transform,
                    anchor+Vector3.up*(height*.5f+.025f),new Vector3(size,height,1),sceneryQuad,sceneryMaterials[cells[i]]);
                part.localRotation=rotation;var renderer=part.GetComponent<MeshRenderer>();
                renderer.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;renderer.receiveShadows=false;
            }
        }
        void AddGroundRuins(float pitch)
        {
            var texture=Resources.Load<Texture2D>("ArtDirection/IndustrialRubble");if(!texture)return;
            var rotation=Quaternion.Euler(90,-30,0);
            var right=Quaternion.Euler(0,-30,0)*Vector3.right;var forward=Quaternion.Euler(0,-30,0)*Vector3.forward;
            // Low debris is projected onto the ground, rather than placed on
            // tall cards that could conceal approaching enemies. The nearby
            // broken slabs still supply real depth, shadows and parallax.
            Vector2[] anchors={new Vector2(-20,9),new Vector2(17,12),new Vector2(-24,-8),new Vector2(23,-10),
                new Vector2(-12,24),new Vector2(10,25),new Vector2(-18,-24),new Vector2(18,-23),
                new Vector2(-8,12),new Vector2(11,-13),new Vector2(29,2),new Vector2(-29,0)};
            var materials=new Material[4];
            for(int cell=0;cell<4;cell++)
            {
                var material=new Material(Shader.Find("SingedTerra/Combat Particle")){name="Collapsed industrial rubble "+cell};
                material.SetTexture("_BaseMap",texture);material.SetVector("_Tile",new Vector4((cell%2)*.5f,cell<2?.5f:0,.5f,.5f));
                material.SetColor("_BaseColor",new Color(.72f,.66f,.55f));materials[cell]=material;sceneryMaterials.Add(material);
            }
            for(int i=0;i<anchors.Length;i++)
            {
                float size=5.8f+i%3*.9f;var anchor=right*anchors[i].x+forward*anchors[i].y;
                var part=LastStandModuleGeometry.Part("Ground rubble cluster "+i,transform,anchor+Vector3.up*.045f,
                    new Vector3(size,size/Mathf.Sin(pitch*Mathf.Deg2Rad),1),sceneryQuad,materials[i%4]);
                part.localRotation=rotation;var renderer=part.GetComponent<MeshRenderer>();
                renderer.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;renderer.receiveShadows=false;
            }
        }
        static Mesh BrokenConcrete()
        {
            // Fractured slab with unequal corners and a tilted broken top.
            // Flat face normals and varied instance proportions avoid round coins.
            var p=new[]{new Vector3(-.5f,0,-.38f),new Vector3(.37f,-.08f,-.5f),new Vector3(.5f,.02f,.24f),new Vector3(-.33f,0,.5f),
                new Vector3(-.38f,.43f,-.30f),new Vector3(.23f,.34f,-.35f),new Vector3(.35f,.53f,.18f),new Vector3(-.26f,.29f,.33f)};
            int[] indices={0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7};
            var vertices=new List<Vector3>();var triangles=new List<int>();
            for(int i=0;i<indices.Length;i+=3)
            {
                var a=p[indices[i]];var b=p[indices[i+1]];var c=p[indices[i+2]];
                if(Vector3.Dot(Vector3.Cross(b-a,c-a),(a+b+c)/3-new Vector3(0,.2f,0))<0){var swap=b;b=c;c=swap;}
                foreach(var point in new[]{a,b,c}){vertices.Add(point);triangles.Add(triangles.Count);}
            }
            var mesh=new Mesh{name="Fractured concrete"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        static Mesh RoundedShape(bool irregular)
        {
            const int columns=10,rows=6;var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
            for(int row=0;row<=rows;row++)for(int column=0;column<=columns;column++)
            {
                float latitude=row*Mathf.PI/rows,longitude=column*Mathf.PI*2/columns;
                float radius=irregular?.39f+((row*17+(column%columns)*31)%13)*.014f:.5f;
                var p=new Vector3(Mathf.Sin(latitude)*Mathf.Cos(longitude),Mathf.Cos(latitude),Mathf.Sin(latitude)*Mathf.Sin(longitude));
                if(!irregular)
                {
                    p=new Vector3(Mathf.Sign(p.x)*Mathf.Pow(Mathf.Abs(p.x),.58f),Mathf.Sign(p.y)*Mathf.Pow(Mathf.Abs(p.y),.75f),Mathf.Sign(p.z)*Mathf.Pow(Mathf.Abs(p.z),.58f));
                    p.y=Mathf.Max(-.75f,p.y); // Flattened underside of a filled canvas sack.
                }
                vertices.Add(p*radius);
                uv.Add(new Vector2(column/(float)columns,row/(float)rows));
            }
            for(int row=0;row<rows;row++)for(int column=0;column<columns;column++)
            {
                int a=row*(columns+1)+column,b=a+columns+1;
                if(row>0){triangles.Add(a);triangles.Add(a+1);triangles.Add(b);}
                if(row<rows-1){triangles.Add(a+1);triangles.Add(b+1);triangles.Add(b);}
            }
            var mesh=new Mesh{name=irregular?"Broken stone":"Canvas sandbag"};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);
            mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        Mesh Combine(List<CombineInstance> instances,string label,Material material)
        {
            var mesh=new Mesh{name=label};mesh.indexFormat=UnityEngine.Rendering.IndexFormat.UInt32;mesh.CombineMeshes(instances.ToArray());
            LastStandModuleGeometry.Part(label,transform,Vector3.zero,Vector3.one,mesh,material);return mesh;
        }
        public void Dispose()
        {
            LastStandModuleGeometry.Release(bags);LastStandModuleGeometry.Release(rubble);LastStandModuleGeometry.Release(steelwork);
            LastStandModuleGeometry.Release(sceneryQuad);foreach(var material in sceneryMaterials)Release(material);
            Release(bagMaterial);Release(rubbleMaterial);Release(steelMaterial);if(transform)Release(transform.gameObject);
        }
        static void Release(Object value){if(Application.isPlaying)Object.Destroy(value);else Object.DestroyImmediate(value);}
    }
}
