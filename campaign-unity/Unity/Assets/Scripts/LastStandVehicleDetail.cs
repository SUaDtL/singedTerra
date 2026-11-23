using System.Collections.Generic;
using UnityEngine;

namespace SingedTerra.Art
{
    // Render-only applique, hardware and stowage, batched by surface per part.
    // Local origins and the existing yaw, recoil and muzzle rig are preserved.
    internal sealed class LastStandVehicleDetail : MonoBehaviour
    {
        readonly List<Mesh> owned=new List<Mesh>();
        public static void Attach(GameObject part,int slot,int family,Material armor,Material steel,Material marking)
        {
            var detail=part.AddComponent<LastStandVehicleDetail>();
            var plate=BeveledPlate();
            var bolt=Fastener();
            var stencil=StencilFace();
            var armorItems=new List<CombineInstance>();var steelItems=new List<CombineInstance>();var markings=new List<CombineInstance>();
            System.Action<Vector3,Vector3,bool,Quaternion> block=(p,s,metal,q)=>{
                (metal?steelItems:armorItems).Add(new CombineInstance{mesh=plate,transform=Matrix4x4.TRS(p,q,s)});
            };
            System.Action<Vector3,Quaternion> pin=(p,q)=>steelItems.Add(new CombineInstance{mesh=bolt,transform=Matrix4x4.TRS(p,q,new Vector3(.045f,.045f,.022f))});
            if(slot==0&&family==0)
            {
                for(int side=-1;side<=1;side+=2)for(int n=0;n<6;n++)
                {
                    float z=-1.8f+n*.72f;
                    block(new Vector3(side*2.10f,.98f,z),new Vector3(.055f,.76f,.65f),false,Quaternion.Euler(0,0,side*(n%2==0?2:-2)));
                    for(int k=-1;k<=1;k+=2)pin(new Vector3(side*2.14f,1.26f,z+k*.22f),Quaternion.Euler(0,90,0));
                }
            }
            if(slot==1)
            {
                for(int row=0;row<2;row++)for(int col=0;col<4;col++)
                {
                    var p=new Vector3((col-1.5f)*.48f,1.49f+row*.13f,-2.16f+row*.32f);
                    block(p,new Vector3(.43f,.12f,.28f),false,Quaternion.Euler(-19,0,0));
                    pin(p+new Vector3(0,.075f,-.04f),Quaternion.Euler(90,0,0));
                }
                for(int side=-1;side<=1;side+=2)
                {
                    for(int n=0;n<4;n++)
                    {
                        float z=-1.2f+n*.72f;
                        block(new Vector3(side*1.35f,1.43f,z),new Vector3(.19f,.28f,.63f),false,Quaternion.Euler(0,0,side*12));
                        for(int k=-1;k<=1;k+=2)pin(new Vector3(side*1.46f,1.51f,z+k*.2f),Quaternion.Euler(0,90,0));
                    }
                    for(int row=0;row<3;row++)for(int n=0;n<2;n++)
                        block(new Vector3(side*(.24f+n*.43f),1.63f+row*.07f,-1.90f+row*.34f),new Vector3(.39f,.10f,.30f),false,Quaternion.Euler(-12,0,0));
                    block(new Vector3(side*.95f,1.62f,1.82f),new Vector3(.42f,.28f,.65f),true,Quaternion.identity);
                    for(int n=0;n<4;n++)block(new Vector3(side*.95f,1.78f,1.57f+n*.15f),new Vector3(.46f,.035f,.045f),true,Quaternion.identity);
                }
            }
            if(slot==2)
            {
                if(family!=3)for(int side=-1;side<=1;side+=2)
                {
                    for(int row=0;row<2;row++)for(int n=0;n<3;n++)
                    {
                        float z=-.58f+n*.43f;
                        block(new Vector3(side*(1.02f-row*.07f),.28f+row*.27f,z),new Vector3(.14f,.24f,.36f),false,Quaternion.Euler(0,0,side*18));
                        pin(new Vector3(side*(1.12f-row*.07f),.30f+row*.27f,z),Quaternion.Euler(0,90,0));
                    }
                    for(int n=0;n<3;n++)block(new Vector3(side*(.42f+n*.15f),.56f,-.92f),new Vector3(.11f,.15f,.24f),true,Quaternion.Euler(-28,0,0));
                    block(new Vector3(side*.46f,.57f,1.17f),new Vector3(.58f,.32f,.23f),true,Quaternion.identity);
                    block(new Vector3(side*.46f,.58f,1.30f),new Vector3(.055f,.35f,.035f),false,Quaternion.identity);
                    // Welded rear stowage cage, with individual boxes and straps.
                    for(int n=0;n<2;n++)
                    {
                        float z=.63f+n*.42f;
                        block(new Vector3(side*1.04f,.41f,z),new Vector3(.31f,.36f,.36f),false,Quaternion.identity);
                        block(new Vector3(side*1.21f,.42f,z),new Vector3(.028f,.39f,.055f),true,Quaternion.identity);
                    }
                    block(new Vector3(side*1.2f,.62f,.85f),new Vector3(.035f,.035f,.86f),true,Quaternion.identity);
                    // Three angled smoke dischargers beside the mantlet.
                    for(int n=0;n<3;n++)steelItems.Add(new CombineInstance{mesh=bolt,
                        transform=Matrix4x4.TRS(new Vector3(side*(.61f+n*.14f),.38f,-.84f),Quaternion.Euler(-25,side*25,0),new Vector3(.115f,.115f,.32f))});
                }
                if(family==0||family==2)
                {
                    for(int n=0;n<5;n++)
                    {
                        float a=n*Mathf.PI*2/5;
                        block(new Vector3(-.3f+Mathf.Cos(a)*.37f,.86f,.31f+Mathf.Sin(a)*.37f),new Vector3(.13f,.12f,.12f),true,Quaternion.Euler(0,-a*Mathf.Rad2Deg,0));
                    }
                    block(new Vector3(.26f,.95f,.12f),new Vector3(.14f,.38f,.13f),true,Quaternion.identity);
                    steelItems.Add(new CombineInstance{mesh=bolt,transform=Matrix4x4.TRS(new Vector3(.26f,1.12f,-.34f),Quaternion.identity,new Vector3(.07f,.07f,1.05f))});
                    block(new Vector3(.26f,1.11f,.17f),new Vector3(.23f,.15f,.33f),false,Quaternion.identity);
                }
                if(family==0)
                {
                    foreach(var p in new[]{new Vector3(-.56f,.79f,-.52f),new Vector3(.56f,.79f,-.52f),new Vector3(.56f,.79f,.48f)})
                    {
                        block(p,new Vector3(.53f,.055f,.48f),false,Quaternion.identity);
                        for(int side=-1;side<=1;side+=2)pin(p+new Vector3(side*.18f,.038f,.15f),Quaternion.Euler(90,0,0));
                    }
                }
                // A stencil on both cheek faces survives every yaw and does not
                // use a camera-facing text object or alter the fitting socket.
                if(family!=3)for(int side=-1;side<=1;side+=2)
                    Stencil(markings,stencil,new Vector3(side*1.145f,.47f,.12f),Quaternion.Euler(0,side*90,0),.30f);
            }
            if(slot==3)for(int n=0;n<5;n++)block(new Vector3(0,0,-.55f-n*.37f),new Vector3(.35f,.34f,.055f),true,Quaternion.identity);
            detail.Combine(part.transform,armorItems,armor,"Armor fittings");detail.Combine(part.transform,steelItems,steel,"Exposed hardware");
            detail.Combine(part.transform,markings,marking,"Field service stencils");
            LastStandModuleGeometry.Release(plate);LastStandModuleGeometry.Release(bolt);LastStandModuleGeometry.Release(stencil);
        }
        internal static Mesh BeveledPlate()
        {
            // Twelve bevel strips and eight clipped corners catch actual light.
            // Forty-four triangles per plate keeps all modular builds in budget.
            var vertices=new List<Vector3>();var triangles=new List<int>();var uv=new List<Vector2>();var detail=new List<Vector2>();
            bool bevel=false;
            System.Action<Vector3,Vector3,Vector3> face=(a,b,c)=>{
                if(Vector3.Dot(Vector3.Cross(b-a,c-a),(a+b+c)/3)<0){var t=b;b=c;c=t;}
                int n=vertices.Count;vertices.Add(a);vertices.Add(b);vertices.Add(c);
                var normal=Vector3.Cross(b-a,c-a).normalized;var axis=new Vector3(Mathf.Abs(normal.x),Mathf.Abs(normal.y),Mathf.Abs(normal.z));
                foreach(var p in new[]{a,b,c})
                {
                    uv.Add((axis.x>axis.y&&axis.x>axis.z?new Vector2(p.z,p.y):axis.y>axis.z?new Vector2(p.x,p.z):new Vector2(p.x,p.y))+Vector2.one*.5f);
                    detail.Add(new Vector2(1,bevel?1:0));
                }
                triangles.Add(n);triangles.Add(n+1);triangles.Add(n+2);
            };
            System.Action<Vector3,Vector3,Vector3,Vector3> quad=(a,b,c,d)=>{face(a,b,c);face(a,c,d);};
            const float h=.5f,k=.465f;
            for(int axis=0;axis<3;axis++)for(int sign=-1;sign<=1;sign+=2)
            {
                int u=(axis+1)%3,v=(axis+2)%3;
                var a=Vector3.zero;var b=Vector3.zero;var c=Vector3.zero;var d=Vector3.zero;
                a[axis]=b[axis]=c[axis]=d[axis]=sign*h;
                a[u]=-k;a[v]=-k;b[u]=k;b[v]=-k;c[u]=k;c[v]=k;d[u]=-k;d[v]=k;
                quad(a,b,c,d);
            }
            bevel=true;
            for(int axis=0;axis<3;axis++)for(int s=-1;s<=1;s+=2)for(int t=-1;t<=1;t+=2)
            {
                int u=(axis+1)%3,v=(axis+2)%3;
                var a=Vector3.zero;var b=Vector3.zero;var c=Vector3.zero;var d=Vector3.zero;
                a[axis]=d[axis]=-k;b[axis]=c[axis]=k;
                a[u]=b[u]=s*h;a[v]=b[v]=t*k;c[u]=d[u]=s*k;c[v]=d[v]=t*h;
                quad(a,b,c,d);
            }
            for(int x=-1;x<=1;x+=2)for(int y=-1;y<=1;y+=2)for(int z=-1;z<=1;z+=2)
                face(new Vector3(x*h,y*k,z*k),new Vector3(x*k,y*h,z*k),new Vector3(x*k,y*k,z*h));
            var mesh=new Mesh{name="Beveled service armor"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.SetUVs(0,uv);mesh.SetUVs(2,detail);
            mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        internal static Mesh Fastener()
        {
            // Hex hardware needs no 16-sided cylinder at its on-screen size.
            var vertices=new List<Vector3>();var triangles=new List<int>();
            System.Action<Vector3,Vector3,Vector3> face=(a,b,c)=>{int start=vertices.Count;vertices.Add(a);vertices.Add(b);vertices.Add(c);triangles.Add(start);triangles.Add(start+1);triangles.Add(start+2);};
            for(int i=0;i<6;i++)
            {
                float a=i*Mathf.PI/3,b=(i+1)*Mathf.PI/3;
                var p=new Vector3(Mathf.Cos(a)*.5f,Mathf.Sin(a)*.5f,.5f);var q=new Vector3(Mathf.Cos(b)*.5f,Mathf.Sin(b)*.5f,.5f);
                var r=p-Vector3.forward;var s=q-Vector3.forward;
                face(Vector3.forward*.5f,p,q);face(-Vector3.forward*.5f,s,r);face(r,s,q);face(r,q,p);
            }
            var mesh=new Mesh{name="Hexagonal service hardware"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        static Mesh StencilFace()
        {
            var mesh=new Mesh{name="Painted stencil"};
            mesh.vertices=new[]{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(.5f,.5f,0),new Vector3(-.5f,.5f,0)};
            mesh.triangles=new[]{0,1,2,0,2,3};mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        void Combine(Transform parent,List<CombineInstance> items,Material mat,string label)
        {
            if(items.Count==0)return;var mesh=new Mesh{name=label};mesh.CombineMeshes(items.ToArray(),true,true);owned.Add(mesh);
            LastStandModuleGeometry.Part(label,parent,Vector3.zero,Vector3.one,mesh,mat);
        }
        static void Stencil(List<CombineInstance> items,Mesh plate,Vector3 origin,Quaternion rotation,float size)
        {
            // Broken stencil bars form 03, with gaps that read as sprayed paint.
            int[] masks={0x3f,0x4f};
            Vector2[] points={new Vector2(0,.42f),new Vector2(.23f,.21f),new Vector2(.23f,-.21f),
                new Vector2(0,-.42f),new Vector2(-.23f,-.21f),new Vector2(-.23f,.21f),Vector2.zero};
            for(int digit=0;digit<2;digit++)for(int bar=0;bar<7;bar++)
            {
                if((masks[digit]&(1<<bar))==0)continue;
                Vector3 p=new Vector3(points[bar].x+(digit-.5f)*.68f,points[bar].y,0)*size;
                bool horizontal=bar==0||bar==3||bar==6;
                var dimensions=new Vector3(horizontal?.34f:.075f,horizontal?.075f:.29f,.006f)*size;
                items.Add(new CombineInstance{mesh=plate,transform=Matrix4x4.TRS(origin+rotation*p,rotation,dimensions)});
            }
        }
        void OnDestroy(){foreach(var mesh in owned)LastStandModuleGeometry.Release(mesh);}
    }
}
