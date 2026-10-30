using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed class LastStandLoopHud
    {
        readonly LastStandLoopController loop;
        readonly Canvas canvas;
        readonly RectTransform root;
        readonly LastStandHudElements elements;
        readonly Dictionary<string,RectTransform> nodes;
        readonly LastStandGarageView garage;
        readonly LastStandCombatHud combat;
        readonly LastStandShopHud shop;
        readonly LastStandModalHost modals;
        readonly LastStandHudObservations observations;
        // Compatibility seam for the imported settings fixture; ownership lives in the host.
        readonly LastStandSettingsHud settings;
        readonly LastStandHudKeyboard keyboard;
        readonly Button[] actions,coreActions,backgroundActions;
        readonly Texture2D metalGrain;
        readonly Sprite metalSurface;
        string projectedPhase;
        Vector2 layoutPixels;
        // One deterministic, reusable metal surface. It is made once for the
        // dedicated HUD and released with it, never generated during Refresh.
        static Texture2D MetalGrain()
        {
            const int size = 96;
            var texture = new Texture2D(size,size,TextureFormat.RGBA32,false);
            texture.name = "LastStandConsoleMetal"; texture.wrapMode = TextureWrapMode.Repeat;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
            {
                // Fine continuous grain stays quiet on both graphite and brass.
                // Wear belongs to the edge mesh, not repeating patina blocks.
                int noise = ((x * 73 + y * 151) ^ (x * y * 17)) & 7;
                int brushed = ((y * 23) ^ (y >> 2) * 13) & 3;
                int value = 252 - noise / 2 - brushed;
                if (y % 47 == 0 && x % 31 < 11) value = 255;
                byte v = (byte)value; pixels[y * size + x] = new Color32(v,v,v,255);
            }
            texture.SetPixels32(pixels); texture.Apply(false,true); return texture;
        }
        public LastStandLoopHud(LastStandLoopController loop,Canvas canvas,Font font)
        {
            this.loop=loop;this.canvas=canvas;metalGrain=MetalGrain();
            metalSurface=Sprite.Create(metalGrain,new Rect(0,0,96,96),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,new Vector4(10,10,10,10));
            metalSurface.name="LastStandConsoleSurface";
            elements=new LastStandHudElements(new LastStandUiPrimitives(font,metalGrain,metalSurface));nodes=elements.Nodes;
            root=LastStandUiPrimitives.Node("LastStandLoopHud",canvas.transform);root.anchorMin=Vector2.zero;root.anchorMax=Vector2.one;
            root.offsetMin=root.offsetMax=Vector2.zero;
            combat=new LastStandCombatHud(loop,root,elements,metalGrain,metalSurface);
            garage=new LastStandGarageView(loop,canvas,root,elements);
            shop=new LastStandShopHud(loop,root,elements,Refresh,Layout,b=>keyboard.Focus(b),combat.SetSummary,
                (activation,intent,result)=>observations.ObservePurchase(activation,intent,result));
            modals=new LastStandModalHost(loop,root,font,metalGrain,metalSurface,elements,shop.OpenPermanentFromPlanner,shop.CanOpenPermanentShop);settings=modals.Settings;
            actions=new[]{combat.Fitting,combat.Deploy,combat.Claim,combat.Purchase,combat.Redeploy,combat.Retry,combat.Pause,combat.Mute,combat.Tier,combat.Effects,
                modals.Menu,combat.SpeedMinus,combat.SpeedRate,combat.SpeedPlus,garage.TierPrevious,garage.TierNext,garage.FittingPrevious,garage.FittingNext,garage.ResearchEntry};
            var core=new List<Button>(actions);core.Add(combat.WaveInfo);coreActions=core.ToArray();
            var background=new List<Button>(coreActions);background.AddRange(shop.Buttons);backgroundActions=background.ToArray();
            var all=new List<Button>(backgroundActions);all.AddRange(modals.Buttons);
            keyboard=root.gameObject.AddComponent<LastStandHudKeyboard>();
            keyboard.Initialize(all.ToArray(),b=>{shop.RevealSelection(b);modals.Reveal(b);});modals.BindKeyboard(keyboard);
            observations=new LastStandHudObservations(loop,root,shop,modals,garage,combat,coreActions);
        }
        string DeploymentRefusal()
        {
            if(loop.HasLockedTierPreview)return "Choose an unlocked tier.";
            if(loop.Progression.SaveState!="ready")return "Confirm the local save.";
            if(!loop.Session.CanRun)return "Return to this tab.";
            if(loop.Progression.PendingDefeat!=null)return "Claim the saved result.";
            if(loop.Progression.HasCheckpoint)return "Resume the saved checkpoint.";
            if(loop.Progression.NextRunId==int.MaxValue)return "Local run limit reached.";
            return "Deployment unavailable.";
        }
        public void Refresh()
        {
            modals.BeforeRefresh(garage.ResearchEntry,combat.WaveInfo);
            shop.ReconcileSession();
            var state=combat.Project(shop.IsOpen);keyboard.BeforeRefresh(state.Phase!=projectedPhase);projectedPhase=state.Phase;
            for(int i=0;i<actions.Length;i++)
            {
                var button=actions[i];button.gameObject.SetActive(state.Active[i]);button.GetComponentInChildren<Text>(true).text=state.Labels[i];
                LastStandUiPrimitives.Style(button,state.Available[i],button.name==state.Primary);
            }
            combat.Refresh(state,loop.GarageCardsVisible,shop.IsOpen);garage.Refresh(state.Available[1],DeploymentRefusal());shop.Refresh();
            if(loop.GarageCardsVisible&&!shop.IsOpen)shop.Entry.GetComponentInChildren<Text>(true).text="UPGRADES";
            if((state.Phase=="battle"||state.Phase=="settling")&&!shop.IsOpen)shop.Entry.GetComponentInChildren<Text>(true).text="RUN\nUPGRADES";
            nodes["DockHeading"].GetComponent<Text>().text=state.Phase=="battle"||state.Phase=="settling"?"GAME SPEED":"FIELD CONTROLS";
            modals.Refresh(keyboard,backgroundActions);Layout();
            modals.AfterRefresh(keyboard,garage.TierNext,garage.FittingNext);observations.ReportShopState();
        }
        public void Layout()
        {
            if(!root)return;var size=root.rect.size;if(size.x<1||size.y<1)return;
            var pixels=canvas.pixelRect;if(pixels.width<1||pixels.height<1)return;
            bool resized=layoutPixels!=pixels.size;layoutPixels=pixels.size;
            float ratio=LastStandHudDisplay.PreferredPixelRatio(),cssWidth=pixels.width/ratio,cssHeight=pixels.height/ratio;
            float unitsX=size.x/cssWidth,unitsY=size.y/cssHeight;
            var active=new List<string>();foreach(var button in coreActions)if(button.gameObject.activeSelf)active.Add(button.name);
            if(shop.Entry.gameObject.activeSelf)active.Add(shop.Entry.name);
            bool receipt=loop.Progression.SaveState=="ready"&&loop.Progression.LastReceipt!=null;
            var projection=LastStandHudLayout.Project(cssWidth,cssHeight,projectedPhase,active.ToArray(),shop.LayoutInput(),receipt);
            if(shop.IsOpen)projection=LastStandHudLayout.Project(cssWidth,cssHeight,projectedPhase,active.ToArray(),shop.MeasuredInput(projection,unitsX,unitsY,combat.Status),receipt);
            var slots=new Dictionary<string,LastStandHudLayout.Slot>();foreach(var slot in projection.Slots)slots.Add(slot.Id,slot);
            shop.BeginLayout(projection.ScrollOffset,projection.MaximumScrollOffset,unitsY);
            try
            {
                foreach(var entry in nodes)
                {
                    bool visible=slots.TryGetValue(entry.Key,out var slot);entry.Value.gameObject.SetActive(visible);if(!visible)continue;
                    if(entry.Key=="WaveReceipt")
                    {
                        entry.Value.SetParent(nodes[slot.Parent],false);var lines=loop.ConfirmedWaveReceipt.Split('\n');
                        combat.WaveReceipt.text=slots.ContainsKey("WaveReceiptDetail")?lines[0]:slot.Bounds.Height<36?loop.ConfirmedWaveReceipt.Replace("\n"," / "):loop.ConfirmedWaveReceipt;
                        combat.WaveReceiptDetail.text=lines.Length>1?lines[1]:"";
                    }
                    var bounds=slot.Bounds;float x=bounds.X,y=bounds.Y;
                    if(slot.Parent!=null){var parent=slots[slot.Parent].Bounds;x-=parent.X;y-=parent.Y;}
                    LastStandUiPrimitives.Place(entry.Value,x*unitsX,y*unitsY,bounds.Width*unitsX,bounds.Height*unitsY);
                    var text=entry.Value.GetComponent<Text>();if(text)text.fontSize=Mathf.CeilToInt(slot.FontSize*unitsY);
                }
            }
            finally{shop.EndLayout(false);}
            combat.LayoutInstruments(slots,unitsX,unitsY);modals.Layout(cssWidth,cssHeight,unitsX,unitsY);
            garage.Layout(slots,cssWidth,cssHeight,ratio,shop.IsOpen);keyboard.Refresh();shop.EndLayout(resized);observations.ReportLayout();
        }
        public void Dispose()
        {
            observations.Dispose();shop.Dispose();garage.Dispose();
            if(Application.isPlaying)
            {if(root)UnityEngine.Object.Destroy(root.gameObject);UnityEngine.Object.Destroy(metalSurface);UnityEngine.Object.Destroy(metalGrain);}
            else
            {if(root)UnityEngine.Object.DestroyImmediate(root.gameObject);UnityEngine.Object.DestroyImmediate(metalSurface);UnityEngine.Object.DestroyImmediate(metalGrain);}
        }
    }
}
