using System;
using System.Collections.Generic;
using UnityEngine;
using SingedTerra.Art;

namespace SingedTerra.VisualReview
{
    // Shared render meshes, built once for the entire bounded enemy pool.
    // Local geometry faces -Z, matching the existing imported vehicle rig.
    internal sealed class LastStandEnemyDetail : IDisposable
    {
        readonly Mesh[] meshes=new Mesh[4];
        readonly Material armor,steel;
        public LastStandEnemyDetail(Material armor,Material steel)
        {
            this.armor=armor;this.steel=steel;
            var plate=LastStandVehicleDetail.BeveledPlate();
            var round=LastStandModuleGeometry.Prism(false,"Enemy machined cylinder");
            for(int kind=0;kind<2;kind++)
            {
                var paint=new List<CombineInstance>();var hardware=new List<CombineInstance>();
                Action<Vector3,Vector3,bool,Quaternion> box=(p,s,metal,q)=>
                    (metal?hardware:paint).Add(new CombineInstance{mesh=plate,transform=Matrix4x4.TRS(p,q,s)});
                Action<Vector3,Vector3,Quaternion> cylinder=(p,s,q)=>hardware.Add(new CombineInstance{mesh=round,transform=Matrix4x4.TRS(p,q,s)});
                box(new Vector3(0,1.10f,.05f),new Vector3(1.24f,.42f,1.14f),false,Quaternion.identity);
                box(new Vector3(0,1.34f,.07f),new Vector3(1.13f,.09f,1.02f),true,Quaternion.identity);
                cylinder(new Vector3(-.25f,1.43f,.20f),new Vector3(.43f,.43f,.10f),Quaternion.Euler(90,0,0));
                box(new Vector3(-.25f,1.52f,.20f),new Vector3(.23f,.045f,.045f),true,Quaternion.identity);
                cylinder(new Vector3(0,1.22f,-.62f),new Vector3(.43f,.43f,.30f),Quaternion.identity);
                cylinder(new Vector3(0,1.22f,-1.18f),new Vector3(kind==1?.16f:.24f,kind==1?.16f:.24f,kind==1?1.55f:.65f),Quaternion.identity);
                if(kind==1)
                {
                    box(new Vector3(0,1.22f,-1.90f),new Vector3(.30f,.28f,.32f),true,Quaternion.identity);
                    for(int s=-1;s<=1;s+=2)
                        box(new Vector3(s*.47f,1.47f,.38f),new Vector3(.20f,.28f,.48f),false,Quaternion.identity);
                }
                for(int side=-1;side<=1;side+=2)
                {
                    for(int panel=0;panel<4;panel++)
                    {
                        float z=-.90f+panel*.59f;
                        box(new Vector3(side*1.02f,.73f,z),new Vector3(.09f,.40f,.52f),false,Quaternion.Euler(0,0,side*9));
                        for(int end=-1;end<=1;end+=2)
                            cylinder(new Vector3(side*1.09f,.84f,z+end*.17f),new Vector3(.065f,.065f,.035f),Quaternion.Euler(0,90,0));
                    }
                    for(int panel=0;panel<3;panel++)
                        box(new Vector3(side*.61f,1.16f,-.30f+panel*.36f),new Vector3(.13f,.28f,.29f),false,Quaternion.Euler(0,0,side*14));
                    for(int pipe=0;pipe<2;pipe++)
                        cylinder(new Vector3(side*(.44f+pipe*.15f),1.20f,-.53f),new Vector3(.10f,.10f,.28f),Quaternion.Euler(-28,side*22,0));
                    box(new Vector3(side*.63f,.96f,1.04f),new Vector3(.42f,.30f,.48f),true,Quaternion.identity);
                    for(int rail=0;rail<3;rail++)
                        box(new Vector3(side*.63f,1.13f,.88f+rail*.16f),new Vector3(.47f,.035f,.04f),true,Quaternion.identity);
                    box(new Vector3(side*.70f,.86f,-1.20f),new Vector3(.25f,.17f,.12f),true,Quaternion.identity);
                }
                // Radiator louvers and a narrow antenna create a legible service silhouette.
                for(int vent=0;vent<7;vent++)
                    box(new Vector3((vent-3)*.12f,.96f,.99f),new Vector3(.065f,.035f,.50f),true,Quaternion.identity);
                cylinder(new Vector3(.39f,1.68f,.39f),new Vector3(.028f,.028f,.74f),Quaternion.Euler(90,0,0));
                meshes[kind*2]=Combine(paint,"Armored enemy service panels");
                meshes[kind*2+1]=Combine(hardware,"Enemy mechanical fittings");
            }
            LastStandModuleGeometry.Release(plate);LastStandModuleGeometry.Release(round);
        }
        static Mesh Combine(List<CombineInstance> items,string name)
        {
            var result=new Mesh{name=name};result.CombineMeshes(items.ToArray(),true,true);return result;
        }
        public Transform Attach(Transform parent,bool ranged)
        {
            var root=new GameObject(ranged?"Ranged vehicle machinery":"Assault vehicle machinery").transform;
            root.SetParent(parent,false);int index=ranged?2:0;
            LastStandModuleGeometry.Part("Enemy service armor",root,Vector3.zero,Vector3.one,meshes[index],armor);
            LastStandModuleGeometry.Part("Enemy running hardware",root,Vector3.zero,Vector3.one,meshes[index+1],steel);
            return root;
        }
        public void Dispose(){foreach(var mesh in meshes)LastStandModuleGeometry.Release(mesh);}
    }
}
