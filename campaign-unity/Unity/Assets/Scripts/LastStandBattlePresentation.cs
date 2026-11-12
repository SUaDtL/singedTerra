using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Read-only equipment and mission layer. All input remains in the existing HUD.
    internal sealed class LastStandBattlePresentation
    {
        readonly LastStandLoopController loop;
        readonly RectTransform root;
        readonly Text wave,enemies,resources,primaryName,secondaryName,speedCaption;
        readonly RawImage primary,secondary;
        readonly Dictionary<Text,int> typeSizes=new Dictionary<Text,int>();
        readonly Dictionary<Text,float> typeWidths=new Dictionary<Text,float>();
        public LastStandBattlePresentation(LastStandLoopController loop,RectTransform parent)
        {
            this.loop=loop;root=LastStandUiPrimitives.Node("BattleArt",parent);
            Frame(16,14,285,230);Label("Brand","singedTerra",30,24,250,44,35,true);
            Label("Slogan","SCORCHED EARTH. HIGHER GROUND.",31,73,250,24,12,false);
            Label("Campaign","LAST STAND / CAMPAIGN",31,104,250,24,16,true);
            wave=Label("Wave","",31,138,250,32,25,true);
            enemies=Label("Enemies","",31,184,250,40,18,false);
            Frame(430,720,604,164);Label("Loadout","WEAPON SYSTEMS",447,733,560,24,18,true);
            Frame(444,761,184,112);Frame(640,761,184,112);Frame(836,761,184,112);
            var cannon=LastStandEquipmentArt.Icon("Cannon",root,0);Place(cannon,452,769,164,73);
            Label("CannonCaption","CANNON",456,844,160,23,14,true);
            primary=LastStandEquipmentArt.Icon("Primary",root,1);Place(primary,648,769,164,73);
            primaryName=Label("PrimaryCaption","",652,844,160,23,14,true);
            secondary=LastStandEquipmentArt.Icon("Secondary",root,2);Place(secondary,844,769,164,73);
            secondaryName=Label("SecondaryCaption","",848,844,160,23,14,true);
            speedCaption=Label("SpeedCaption","SIMULATION SPEED",1064,768,250,30,14,false);
            resources=Label("Resources","",1354,768,210,30,21,true);
            root.gameObject.SetActive(false);
        }
        void Frame(float x,float y,float w,float h)
        {var r=LastStandUiPrimitives.Node("Steel panel",root);LastStandUiPrimitives.Place(r,x,y,w,h);r.gameObject.AddComponent<EquipmentBayFrame>().raycastTarget=false;}
        void Place(Component c,float x,float y,float w,float h)=>LastStandUiPrimitives.Place((RectTransform)c.transform,x,y,w,h);
        Text Label(string id,string value,float x,float y,float w,float h,int size,bool heading)
        {
            var t=LastStandUiPrimitives.Node(id,root).gameObject.AddComponent<Text>();t.font=heading?LastStandEquipmentArt.Display:LastStandEquipmentArt.Body;
            t.text=value;t.fontSize=size;t.color=heading?LastStandUiPrimitives.Brass:LastStandUiPrimitives.Paper;t.raycastTarget=false;t.supportRichText=false;
            Place(t,x,y,w,h);typeSizes[t]=size;typeWidths[t]=w;return t;
        }
        static string Name(LastStandFitting fitting)
        {foreach(var entry in LastStandFittingCatalog.Definitions)if(entry.Mechanic==fitting)return entry.Name.ToUpperInvariant();return fitting.ToString();}
        public void Layout(float width,float height,bool shopOpen)
        {
            var model=loop.Session.Model;
            bool show=LastStandHudLayout.HasConceptCombat(width,height)&&model!=null&&(loop.Phase=="battle"||loop.Phase=="settling")&&!shopOpen;
            root.gameObject.SetActive(show);if(!show)return;
            var parent=(RectTransform)root.parent;root.sizeDelta=new Vector2(1600,900);root.localScale=new Vector3(parent.rect.width/1600,parent.rect.height/900,1);
            int minimumType=Mathf.CeilToInt(Mathf.Max(14*1600/width,14*900/height));
            foreach(var type in typeSizes)
            {
                type.Key.fontSize=Mathf.Max(type.Value,minimumType);
                var textRect=type.Key.rectTransform;float aspect=root.localScale.x/root.localScale.y;
                textRect.localScale=new Vector3(1/aspect,1,1);
                textRect.sizeDelta=new Vector2(typeWidths[type.Key]*aspect,textRect.sizeDelta.y);
                if(type.Key.name=="Slogan")type.Key.gameObject.SetActive(width>=1600);
            }
            wave.text="TIER "+model.Profile.Tier+"  /  WAVE "+model.Wave;
            enemies.text="ENEMIES REMAINING   "+model.RemainingWaveEnemies;
            resources.text=loop.Progression.Wallet.ToString("N0")+"  SALVAGE";
            bool skills=model.Skills.Loadout.Count>0;
            speedCaption.gameObject.SetActive(!skills);
            Place(resources,1354,skills?788:768,210,skills?24:30);
            var loadout=model.Loadout;primaryName.text=Name(loadout.Primary);LastStandEquipmentArt.Select(primary,LastStandEquipmentArt.Index(loadout.Primary));
            secondary.gameObject.SetActive(loadout.Secondary.HasValue);secondaryName.text=loadout.Secondary.HasValue?Name(loadout.Secondary.Value):"BAY 2 / NOT FITTED";
            if(loadout.Secondary.HasValue)LastStandEquipmentArt.Select(secondary,LastStandEquipmentArt.Index(loadout.Secondary.Value));
        }
    }
}
