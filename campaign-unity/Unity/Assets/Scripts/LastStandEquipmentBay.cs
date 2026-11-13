using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using UnityEngine.Rendering.Universal;

namespace SingedTerra.LastStand
{
    // Garage presentation only. The existing rig, controls and transaction owners stay live.
    internal sealed class LastStandEquipmentBay : IDisposable
    {
        readonly LastStandLoopController loop;
        readonly TankPresentation art;
        readonly RectTransform root, scenery, furniture;
        readonly RawImage tankImage, hangarImage;
        readonly RawImage fittingIcon;
        readonly EquipmentBayContactShadow contactShadow;
        readonly Text damage, armor, hull, fitting, bank, bayCount, moduleName, saveState, serviceFitting;
        readonly Font displayFont, bodyFont;
        readonly bool ownsDisplayFont;
        readonly Dictionary<Renderer,bool> hidden = new Dictionary<Renderer,bool>();
        readonly List<Light> lamps = new List<Light>();
        readonly List<Quaternion> lampRotations = new List<Quaternion>();
        readonly Dictionary<Text,Font> priorFonts = new Dictionary<Text,Font>();
        readonly Dictionary<Text,int> typeSizes=new Dictionary<Text,int>();
        readonly Dictionary<Text,float> typeWidths=new Dictionary<Text,float>();
        readonly List<RectTransform> panelBounds=new List<RectTransform>();
        readonly Texture2D backdrop;
        readonly LastStandFittingCallout[] partCallouts=new LastStandFittingCallout[3];
        readonly LastStandFittingCallout fittingCallout;
        readonly Text[] partNames=new Text[3];
        RenderTexture target, priorTarget;
        CameraClearFlags priorClear;
        Color priorBackground;
        bool active;
        Light sun;
        bool sunWasEnabled;
        bool priorPostProcessing;
        GameObject shadowFloor;
        Mesh shadowMesh;
        Material shadowMaterial;
        Texture priorReflection;
        UnityEngine.Rendering.DefaultReflectionMode priorReflectionMode;
        UnityEngine.Rendering.AmbientMode priorAmbientMode;
        Color priorAmbientSky, priorAmbientEquator, priorAmbientGround;
        float priorAmbientIntensity, priorReflectionIntensity;
        static readonly Color Gold = new Color(.78f,.62f,.35f), Copy = new Color(.88f,.86f,.77f);

        public static bool Fits(float width,float height) => LastStandHudLayout.HasEquipmentBay(width,height);

        public LastStandEquipmentBay(LastStandLoopController loop, RectTransform root)
        {
            this.loop=loop;this.root=root;art=loop.GetComponent<TankPresentation>();
            backdrop=Resources.Load<Texture2D>("EquipmentBay/Hangar");
            // Native review uses installed fonts without redistributing proprietary font files.
            // Resource fonts, when supplied, take precedence on every host.
            displayFont=LastStandEquipmentArt.Display;ownsDisplayFont=!displayFont;
            if(ownsDisplayFont)displayFont=Font.CreateDynamicFontFromOSFont(new[]{"Impact","Arial"},32);
            bodyFont=LastStandEquipmentArt.Body ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            scenery=Node("EquipmentBayScenery",root);scenery.SetAsFirstSibling();Stretch(scenery);
            var background=Node("HangarMatte",scenery);Stretch(background);
            hangarImage=background.gameObject.AddComponent<RawImage>();hangarImage.texture=backdrop;hangarImage.raycastTarget=false;
            var shadow=Node("TankContactShadow",scenery);Stretch(shadow);contactShadow=shadow.gameObject.AddComponent<EquipmentBayContactShadow>();
            contactShadow.View=art.view;contactShadow.Art=art;contactShadow.raycastTarget=false;
            var tank=Node("LiveTank",scenery);Stretch(tank);tankImage=tank.gameObject.AddComponent<RawImage>();tankImage.raycastTarget=false;
            furniture=Node("EquipmentBayFurniture",root);furniture.SetSiblingIndex(1);Stretch(furniture);
            Panel("Header",0,0,1600,83);
            Label("Brand","singedTerra",28,3,270,48,34,true,Gold);
            Label("Motto","SCORCHED EARTH. HIGHER GROUND.",30,53,280,19,12,false,Copy);
            Line(308,15,1,51,Gold);
            Label("BayTitle","EQUIPMENT BAY",334,11,490,42,34,true,Gold);
            Label("BaySubtitle","FIT.  ENDURE.  IMPROVE.  REPEAT.",337,54,500,20,13,false,Copy);
            Label("BayMark","TERRA ENDURES.",1290,25,180,26,15,false,Gold);

            Panel("VehicleDossier",18,110,288,337);
            Label("VehicleName","FIELD TANK",34,126,256,43,30,true,Gold);
            Label("VehicleType","LAST STAND  /  SERVICE RECORD",34,174,256,21,12,false,Copy);
            Line(34,204,256,1,Gold);
            damage=Stat("CANNON DAMAGE",235);
            hull=Stat("HULL UPGRADE",277);
            armor=Stat("ARMOR UPGRADE",319);
            bayCount=Stat("EQUIPMENT BAYS",361);
            Label("DossierFooter","MAINTAIN TODAY.\nSURVIVE TOMORROW.",34,390,256,50,13,false,Gold);
            Panel("DeploymentStatus",18,464,288,84);

            var slots=new[]{LastStandTankPartSlot.Turret,LastStandTankPartSlot.Hull,LastStandTankPartSlot.Barrel};
            var positions=new[]{new Vector2(335,119),new Vector2(335,551),new Vector2(1070,399)};
            for(int i=0;i<slots.Length;i++)
            {
                int index=i;var slot=slots[i];var pos=positions[i];
                var card=Panel("ServicePart"+i,pos.x,pos.y,225,72);
                Label("ServicePartTitle"+i,LastStandTankAppearanceCatalog.SlotLabel(slot).ToUpperInvariant(),pos.x+13,pos.y+8,199,26,16,true,Gold);
                partNames[i]=Label("ServicePartName"+i,"",pos.x+13,pos.y+34,199,26,12,false,Copy);
                partCallouts[i]=furniture.gameObject.AddComponent<LastStandFittingCallout>();
                partCallouts[i].Initialize(root.GetComponentInParent<Canvas>(),art,card,
                    ()=>art.TankVisuals.PartRenderers(slot),()=>partNames[index].text,"ST_LS_SERVICE_PART_"+i);
            }

            Panel("InstalledDeck",18,660,550,196);
            Label("InstalledHeading","INSTALLED SYSTEMS",34,675,500,24,17,true,Gold);
            Line(34,704,518,1,Gold);
            Label("CannonHeading","STANDARD CANNON",34,714,234,26,19,true,Copy);
            var cannonIcon=LastStandEquipmentArt.Icon("CannonArt",furniture,0);LastStandUiPrimitives.Place(cannonIcon.rectTransform,34,742,100,49);
            Label("CannonNote","AUTOMATIC FIRE\nAlways equipped",139,742,130,50,13,false,Copy);
            Line(280,719,1,79,new Color(.35f,.3f,.2f));
            fitting=Label("FittingHeading","FIELD REPAIR",299,714,243,26,19,true,Gold);
            fittingIcon=LastStandEquipmentArt.Icon("FittingArt",furniture,1);LastStandUiPrimitives.Place(fittingIcon.rectTransform,299,742,90,49);
            moduleName=Label("FittingSummary","",395,742,150,50,13,false,Copy);
            var fittingCard=Panel("ServiceFitting",335,325,225,72);
            Label("ServiceFittingTitle","OPTIONAL SYSTEM",348,333,199,26,16,true,Gold);
            serviceFitting=Label("ServiceFittingName","",348,359,199,26,12,false,Copy);
            fittingCallout=furniture.gameObject.AddComponent<LastStandFittingCallout>();
            fittingCallout.Initialize(root.GetComponentInParent<Canvas>(),art,fittingCard);
            fittingCallout.SetTint(LastStandUiPrimitives.Brass);

            Panel("DevelopmentDeck",582,660,466,196);
            Label("DevelopmentHeading","DEVELOPMENT",598,675,434,24,17,true,Gold);
            Line(598,704,434,1,Gold);
            Label("WorkshopCaption","PERMANENT UPGRADES",598,722,209,22,13,false,Copy);
            Label("LabCaption","RESEARCH LAB",823,722,209,22,13,false,Copy);
            Label("DevelopmentNote","Invest in the next deployment.",598,817,434,21,13,false,Gold);

            Panel("ResourcesDeck",1062,660,520,196);
            Label("ResourcesHeading","RESOURCES / DEPLOYMENT",1078,675,488,24,17,true,Gold);
            Line(1078,704,488,1,Gold);
            bank=Label("SalvageBalance","0",1078,718,200,45,30,true,Copy);
            Label("SalvageLabel","SALVAGE",1078,766,200,19,12,false,Gold);
            saveState=Label("SaveReadiness","LOCAL SAVE READY",1078,810,200,22,12,false,Copy);
            Label("FooterLeft","TERRA IS HARSH. GOOD.",28,874,400,18,11,false,Gold);
            Label("FooterRight","SINGEDTERRA DEFENSE COMMAND",1160,874,410,18,11,false,Gold);
            partCallouts[0].AvoidPanels=panelBounds.ToArray();
            scenery.gameObject.SetActive(false);furniture.gameObject.SetActive(false);
        }

        Text Stat(string text,float y)
        {
            Label(text+"Label",text,34,y,160,22,13,false,Copy);
            return Label(text+"Value","",200,y-3,84,26,20,true,Gold,TextAnchor.MiddleRight);
        }
        static RectTransform Node(string name,Transform parent) => LastStandUiPrimitives.Node(name,parent);
        static void Stretch(RectTransform r){r.anchorMin=Vector2.zero;r.anchorMax=Vector2.one;r.offsetMin=r.offsetMax=Vector2.zero;}
        RectTransform Panel(string name,float x,float y,float w,float h)
        {
            var r=Node(name,furniture);LastStandUiPrimitives.Place(r,x,y,w,h);r.gameObject.AddComponent<EquipmentBayFrame>().raycastTarget=false;
            panelBounds.Add(r);
            return r;
        }
        void Line(float x,float y,float w,float h,Color color)
        {
            var r=Node("Rule",furniture);LastStandUiPrimitives.Place(r,x,y,w,h);var i=r.gameObject.AddComponent<Image>();i.color=color;i.raycastTarget=false;
        }
        Text Label(string name,string text,float x,float y,float w,float h,int size,bool display,Color color,TextAnchor align=TextAnchor.UpperLeft)
        {
            var r=Node(name,furniture);LastStandUiPrimitives.Place(r,x,y,w,Mathf.Max(26,h));var t=r.gameObject.AddComponent<Text>();
            t.text=text;t.font=display?displayFont:bodyFont;t.fontSize=size;t.color=color;t.alignment=align;t.supportRichText=false;t.raycastTarget=false;
            t.horizontalOverflow=HorizontalWrapMode.Wrap;t.verticalOverflow=VerticalWrapMode.Overflow;typeSizes[t]=size;typeWidths[t]=w;return t;
        }
        public void Layout(float width,float height,bool shopOpen,Dictionary<string,RectTransform> nodes,bool hidesBackground=false)
        {
            bool visible=backdrop && Fits(width,height) && loop.GarageCardsVisible && !art.EncounterActive;
            SetActive(visible);
            if(!visible)return;
            float sx=root.rect.width/1600f,sy=root.rect.height/900f;
            furniture.anchorMin=furniture.anchorMax=furniture.pivot=new Vector2(0,1);furniture.sizeDelta=new Vector2(1600,900);
            furniture.anchoredPosition=Vector2.zero;furniture.localScale=new Vector3(sx,sy,1);
            bool showFurniture=!hidesBackground&&!shopOpen;
            furniture.gameObject.SetActive(showFurniture);
            int minimumType=Mathf.CeilToInt(Mathf.Max(14*1600/width,14*900/height));
            foreach(var type in typeSizes)
            {
                type.Key.fontSize=Mathf.Max(type.Value,minimumType);
                // Panels span the viewport; letterforms retain their aspect.
                var textRect=type.Key.rectTransform;
                textRect.localScale=new Vector3(sy/sx,1,1);
                textRect.sizeDelta=new Vector2(typeWidths[type.Key]*sx/sy,textRect.sizeDelta.y);
                if(type.Key.name=="Motto"||type.Key.name=="CannonNote")type.Key.gameObject.SetActive(width>=1440);
            }
            EnsureTarget();
            // Crop the photograph; never stretch its perspective independently
            // of the live vehicle. Bay and Armory share the same parked position.
            float aspect=(float)target.width/target.height,photoAspect=(float)backdrop.width/backdrop.height;
            float uvWidth=Mathf.Min(1,aspect/photoAspect),uvHeight=Mathf.Min(1,photoAspect/aspect);
            hangarImage.uvRect=new Rect((1-uvWidth)*.5f,(1-uvHeight)*.5f,uvWidth,uvHeight);
            if(EquipmentBayContactShadow.TryFootprint(art,out var footprint)&&shadowFloor)
            {
                shadowFloor.transform.position=new Vector3(footprint.center.x,footprint.min.y-.006f,footprint.center.z);
                var ground=new Vector3(footprint.center.x,footprint.min.y,footprint.center.z);
                art.SetBayGrounding(true,ground,hangarImage.uvRect);
                if(loop.ArmoryCanPreview&&height<900)
                {
                    // Fit the complete silhouette between the 100px header and
                    // 254px drawer, retaining 14px clearance on each edge.
                    // Move the photograph and live projection as one composition.
                    hangarImage.uvRect=art.FitBayMatte(new Rect(.16f,268/height,.68f,1-382/height),photoAspect);
                    art.SetBayGrounding(true,ground,hangarImage.uvRect);
                }
                else if(loop.AppearanceCanPreview)
                {
                    var world=LastStandAppearanceLayout.Project(width,height).World;
                    hangarImage.uvRect=art.FitBayMatte(new Rect(world.X/width,1-(world.Y+world.Height)/height,world.Width/width,world.Height/height),photoAspect);
                    art.SetBayGrounding(true,ground,hangarImage.uvRect);
                }
            }
            for(int i=0;i<lamps.Count;i++)lamps[i].transform.rotation=Quaternion.AngleAxis(art.InspectionYaw,Vector3.up)*lampRotations[i];
            contactShadow.SetVerticesDirty();
            var coreSlots=new[]{LastStandTankPartSlot.Turret,LastStandTankPartSlot.Hull,LastStandTankPartSlot.Barrel};
            for(int i=0;i<partCallouts.Length;i++)
            {
                var slot=coreSlots[i];var appearance=art.TankVisuals.Current;
                partNames[i].text=LastStandTankAppearanceCatalog.PartLabel(slot,appearance.Part(slot));
                partCallouts[i].PixelRatio=Screen.width/width;
                partCallouts[i].Refresh(showFurniture);
            }
            if(showFurniture)
            {
                foreach(string name in new[]{"TierPreviousText","TierNextText","GarageTierName","ArmoryEntryText","DeployText","RedeployText","ResearchEntryText","ShopEntryText"})
                    if(nodes.TryGetValue(name,out var r))
                    {
                        var text=r.GetComponent<Text>();if(!text)continue;
                        if(!priorFonts.ContainsKey(text))priorFonts.Add(text,text.font);text.font=displayFont;
                    }
            }
            var p=loop.Progression;
            damage.text=p.CannonDamage.ToString();hull.text="LV "+p.GetPermanentLevel(LastStandUpgradeTrackId.HullCapacity);
            armor.text="LV "+p.GetPermanentLevel(LastStandUpgradeTrackId.Armor);bayCount.text=p.EquipmentBayCount+" / 2";
            fitting.text=FittingName(p.SelectedLoadout.Primary).ToUpperInvariant();
            serviceFitting.text=FittingName(p.SelectedLoadout.Primary);
            fittingCallout.PixelRatio=Screen.width/width;
            fittingCallout.Refresh(showFurniture);
            LastStandEquipmentArt.Select(fittingIcon,LastStandEquipmentArt.Index(p.SelectedLoadout.Primary));
            moduleName.text=p.SelectedLoadout.Secondary.HasValue?FittingName(p.SelectedLoadout.Secondary.Value):"BAY 2  /  "+(p.EquipmentBayCount<2?"LOCKED":"EMPTY");
            bank.text=p.Wallet.ToString("N0");saveState.text=p.SaveState=="ready"?"LOCAL SAVE READY":"SAVE: "+p.SaveState.ToUpperInvariant();
        }
        static string FittingName(LastStandFitting fitting)
        {foreach(var item in LastStandFittingCatalog.Definitions)if(item.Mechanic==fitting)return item.Name;return fitting.ToString();}
        void EnsureTarget()
        {
            var canvas=root.GetComponentInParent<Canvas>();var pixels=canvas?canvas.pixelRect:new Rect(0,0,Screen.width,Screen.height);
            int w=Mathf.Max(1,Mathf.RoundToInt(pixels.width)),h=Mathf.Max(1,Mathf.RoundToInt(pixels.height));
            if(target&&target.width==w&&target.height==h)return;
            if(target){art.view.targetTexture=priorTarget;target.Release();Destroy(target);}
            target=new RenderTexture(w,h,24,RenderTextureFormat.ARGB32){name="EquipmentBayLiveTank",antiAliasing=4};target.Create();
            art.view.targetTexture=target;tankImage.texture=target;
        }
        void SetActive(bool value)
        {
            if(active==value)return;active=value;scenery.gameObject.SetActive(value);furniture.gameObject.SetActive(value);
            if(value)
            {
                priorTarget=art.view.targetTexture;priorClear=art.view.clearFlags;priorBackground=art.view.backgroundColor;
                var cameraData=art.view.GetUniversalAdditionalCameraData();priorPostProcessing=cameraData.renderPostProcessing;cameraData.renderPostProcessing=true;
                priorReflection=RenderSettings.customReflectionTexture;priorReflectionMode=RenderSettings.defaultReflectionMode;
                priorAmbientMode=RenderSettings.ambientMode;priorAmbientSky=RenderSettings.ambientSkyColor;
                priorAmbientEquator=RenderSettings.ambientEquatorColor;priorAmbientGround=RenderSettings.ambientGroundColor;
                priorAmbientIntensity=RenderSettings.ambientIntensity;priorReflectionIntensity=RenderSettings.reflectionIntensity;
                RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Trilight;
                RenderSettings.ambientSkyColor=new Color(.20f,.16f,.115f);
                RenderSettings.ambientEquatorColor=new Color(.105f,.095f,.08f);
                RenderSettings.ambientGroundColor=new Color(.035f,.027f,.018f);
                RenderSettings.ambientIntensity=1;RenderSettings.reflectionIntensity=.65f;
                var reflection=Resources.Load<Cubemap>("ArtDirection/HangarReflection");
                if(reflection){RenderSettings.customReflectionTexture=reflection;RenderSettings.defaultReflectionMode=UnityEngine.Rendering.DefaultReflectionMode.Custom;}
                art.view.clearFlags=CameraClearFlags.SolidColor;art.view.backgroundColor=Color.clear;
                foreach(var renderer in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsInactive.Include,FindObjectsSortMode.None))
                {
                    if(renderer.gameObject.scene!=art.gameObject.scene || renderer.transform.IsChildOf(art.tank))continue;
                    hidden[renderer]=renderer.forceRenderingOff;renderer.forceRenderingOff=true;
                }
                sun=RenderSettings.sun;if(sun){sunWasEnabled=sun.enabled;sun.enabled=false;}
                Lamp("Bay warm key",new Vector3(48,-105,0),new Color(1,.80f,.53f),2.5f);
                Lamp("Bay cool rim",new Vector3(35,145,0),new Color(.67f,.77f,1),.65f);
                Lamp("Bay fill",new Vector3(20,40,0),new Color(.84f,.79f,.66f),.18f);
                RenderSettings.sun=lamps[0];
                shadowMaterial=new Material(Shader.Find("SingedTerra/Bay Contact Shadows"));
                // Rendering-only geometry must not request a MeshCollider from
                // stripped WebGL physics modules, even briefly.
                shadowFloor=new GameObject("Bay shadow receiver",typeof(MeshFilter),typeof(MeshRenderer));
                var floorMesh=shadowMesh=new Mesh{name="Bay shadow receiver mesh"};
                floorMesh.vertices=new[]{new Vector3(-5,0,-5),new Vector3(-5,0,5),new Vector3(5,0,5),new Vector3(5,0,-5)};
                floorMesh.normals=new[]{Vector3.up,Vector3.up,Vector3.up,Vector3.up};
                floorMesh.uv=new[]{Vector2.zero,Vector2.up,Vector2.one,Vector2.right};
                floorMesh.triangles=new[]{0,1,2,0,2,3};floorMesh.RecalculateBounds();
                shadowFloor.GetComponent<MeshFilter>().sharedMesh=floorMesh;
                shadowFloor.transform.SetParent(art.transform,false);shadowFloor.transform.position=art.tank.position+Vector3.up*.015f;
                shadowFloor.transform.localScale=Vector3.one*3;
                var receiver=shadowFloor.GetComponent<Renderer>();receiver.sharedMaterial=shadowMaterial;
                receiver.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
                EnsureTarget();
            }
            else
            {
                art.SetBayGrounding(false);
                if(art.view){art.view.targetTexture=priorTarget;art.view.clearFlags=priorClear;art.view.backgroundColor=priorBackground;art.view.GetUniversalAdditionalCameraData().renderPostProcessing=priorPostProcessing;}
                foreach(var pair in hidden)if(pair.Key)pair.Key.forceRenderingOff=pair.Value;hidden.Clear();
                if(lamps.Count>0&&RenderSettings.sun==lamps[0])RenderSettings.sun=sun;
                foreach(var lamp in lamps)if(lamp)Destroy(lamp.gameObject);lamps.Clear();lampRotations.Clear();if(sun)sun.enabled=sunWasEnabled;
                if(shadowMesh)Destroy(shadowMesh);shadowMesh=null;
                if(shadowFloor)Destroy(shadowFloor);
                if(shadowMaterial)Destroy(shadowMaterial);shadowFloor=null;shadowMaterial=null;
                foreach(var pair in priorFonts)if(pair.Key)pair.Key.font=pair.Value;priorFonts.Clear();
                tankImage.texture=null;if(target){target.Release();Destroy(target);target=null;}
                RenderSettings.customReflectionTexture=priorReflection;RenderSettings.defaultReflectionMode=priorReflectionMode;
                RenderSettings.ambientMode=priorAmbientMode;RenderSettings.ambientSkyColor=priorAmbientSky;
                RenderSettings.ambientEquatorColor=priorAmbientEquator;RenderSettings.ambientGroundColor=priorAmbientGround;
                RenderSettings.ambientIntensity=priorAmbientIntensity;RenderSettings.reflectionIntensity=priorReflectionIntensity;
            }
        }
        void Lamp(string name,Vector3 angles,Color color,float intensity)
        {
            var g=new GameObject(name);g.transform.SetParent(art.transform,false);g.transform.rotation=Quaternion.Euler(angles);
            var l=g.AddComponent<Light>();l.type=LightType.Directional;l.color=color;l.intensity=intensity;
            lampRotations.Add(g.transform.rotation);
            l.shadows=lamps.Count==0?LightShadows.Soft:LightShadows.None;l.shadowBias=.025f;l.shadowNormalBias=.15f;lamps.Add(l);
        }
        static void Destroy(UnityEngine.Object value){if(Application.isPlaying)UnityEngine.Object.Destroy(value);else UnityEngine.Object.DestroyImmediate(value);}
        public void Dispose(){SetActive(false);if(scenery)Destroy(scenery.gameObject);if(furniture)Destroy(furniture.gameObject);if(ownsDisplayFont&&displayFont)Destroy(displayFont);}
    }

    // Soft projected contact under the live rig; the hangar matte contains no tank.
    [RequireComponent(typeof(CanvasRenderer))]
    internal sealed class EquipmentBayContactShadow : MaskableGraphic
    {
        public Camera View;
        public TankPresentation Art;
        void LateUpdate(){SetVerticesDirty();}
        internal static bool TryFootprint(TankPresentation art,out Bounds bounds)
        {
            bounds=default(Bounds);bool found=false;
            if(!art||!art.TankVisuals)return false;
            foreach(var renderer in art.TankVisuals.PartRenderers(LastStandTankPartSlot.Treads))
            {
                if(!renderer||!renderer.enabled||renderer.forceRenderingOff||!renderer.gameObject.activeInHierarchy)continue;
                if(!found){bounds=renderer.bounds;found=true;}else bounds.Encapsulate(renderer.bounds);
            }
            return found;
        }
        protected override void OnPopulateMesh(VertexHelper mesh)
        {
            mesh.Clear();if(!View||!TryFootprint(Art,out var bounds))return;
            var centre=new Vector3(bounds.center.x,bounds.min.y+.01f,bounds.center.z);
            var rect=rectTransform.rect;
            Action<Vector3,float> Vertex=(world,alpha)=>{
                var p=View.WorldToViewportPoint(world);
                mesh.AddVert(new Vector3(rect.xMin+p.x*rect.width,rect.yMin+p.y*rect.height,0),new Color(0,0,0,alpha),Vector2.zero);
            };
            // A tracked chassis has a rectangular footprint. An ellipse leaves
            // the near tread corners outside the contact patch and looking airborne.
            var corners=new[]{new Vector2(-1,-1),new Vector2(-1,1),new Vector2(1,1),new Vector2(1,-1)};
            Vertex(centre,.82f);
            for(int ring=0;ring<2;ring++)for(int i=0;i<4;i++)
            {
                float radius=ring==0?.96f:1.13f;
                Vertex(centre+new Vector3(corners[i].x*bounds.extents.x*radius,0,corners[i].y*bounds.extents.z*radius),ring==0?.76f:0);
                int next=(i+1)%4;
                if(ring==0)mesh.AddTriangle(0,1+i,1+next);
                else{mesh.AddTriangle(1+i,5+i,5+next);mesh.AddTriangle(1+i,5+next,1+next);}
            }
        }
    }

    // Authored bevel geometry stays independent from the rectangular input surface.
    [RequireComponent(typeof(CanvasRenderer))]
    internal sealed class EquipmentBayFrame : MaskableGraphic
    {
        public override Texture mainTexture=>LastStandEquipmentArt.Panel?LastStandEquipmentArt.Panel:Texture2D.whiteTexture;
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();Rect r=rectTransform.rect;
            if(LastStandEquipmentArt.Panel)
            {
                float border=Mathf.Min(14,Mathf.Min(r.width,r.height)*.2f);
                float[] xs={r.xMin,r.xMin+border,r.xMax-border,r.xMax},ys={r.yMin,r.yMin+border,r.yMax-border,r.yMax};
                float[] us={0,.06f,.94f,1},vs={0,.09f,.91f,1};
                for(int y=0;y<3;y++)for(int x=0;x<3;x++)
                {
                    int n=vh.currentVertCount;
                    vh.AddVert(new Vector3(xs[x],ys[y]),color,new Vector2(us[x],vs[y]));
                    vh.AddVert(new Vector3(xs[x],ys[y+1]),color,new Vector2(us[x],vs[y+1]));
                    vh.AddVert(new Vector3(xs[x+1],ys[y+1]),color,new Vector2(us[x+1],vs[y+1]));
                    vh.AddVert(new Vector3(xs[x+1],ys[y]),color,new Vector2(us[x+1],vs[y]));
                    vh.AddTriangle(n,n+1,n+2);vh.AddTriangle(n+2,n+3,n);
                }
                return;
            }
            Face(vh,r,8,new Color(.035f,.038f,.033f,.98f),new Color(.025f,.027f,.024f,.98f));
            Face(vh,Inset(r,2),6,new Color(.43f,.35f,.22f),new Color(.16f,.13f,.08f));
            Face(vh,Inset(r,4),5,new Color(.11f,.115f,.10f),new Color(.045f,.05f,.043f));
            Face(vh,Inset(r,8),2,new Color(.024f,.028f,.025f,.98f),new Color(.05f,.055f,.048f,.98f));
            foreach(float x in new[]{r.xMin+7,r.xMax-7})foreach(float y in new[]{r.yMin+7,r.yMax-7})
            {Face(vh,new Rect(x-2,y-2,4,4),1,new Color(.56f,.46f,.29f),new Color(.18f,.15f,.10f));}
        }
        static Rect Inset(Rect r,float n)=>new Rect(r.x+n,r.y+n,Mathf.Max(0,r.width-n*2),Mathf.Max(0,r.height-n*2));
        static void Face(VertexHelper vh,Rect r,float cut,Color top,Color bottom)=>LastStandConsoleGeometry.Face(vh,r,cut,top,bottom);
    }
}
