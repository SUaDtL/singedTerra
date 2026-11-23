using System;
using System.Collections.Generic;
using SingedTerra.LastStand;
using SingedTerra.Encounter;
namespace SingedTerra.Encounter {
 public sealed partial class EncounterModel {
  // Calibration-only seeded empty cohort. Never saved, rewarded or exposed in the player.
  public void SkillBalanceSeedWave(int wave){if(Tick!=0||wave<1)throw new ArgumentException("seed boundary");Wave=wave;CompletedWave=wave-1;Spawned=Kills=LastStandWaveCatalog.TotalEnemiesThroughWave(wave-1,Profile.Edition);}
 }
}
static class SkillBalanceMeasurements {
 static Dictionary<string,object> D(params object[] pairs){var d=new Dictionary<string,object>();for(int n=0;n<pairs.Length;n+=2)d.Add((string)pairs[n],pairs[n+1]);return d;}
 static LastStandSkillSnapshot Snapshot(string mode,int rank){var ids=mode=="active"?new[]{LastStandSkillId.Overdrive,LastStandSkillId.EmergencyRepairs,LastStandSkillId.Minefield}:mode=="passive"?new[]{LastStandSkillId.ReinforcedHull,LastStandSkillId.Ballistics,LastStandSkillId.ReactiveLining}:new LastStandSkillId[0];var ranks=new int[6];foreach(var id in ids)ranks[(int)id]=rank;return new LastStandSkillSnapshot(new LastStandSkillLoadout(ids),ranks);}
 static object Run(string scenario,int tier,int wave,int levels,int rank,string mode){
  var paid=new int[LastStandUpgradeCatalog.Tracks.Count];foreach(var track in LastStandUpgradeCatalog.Tracks)paid[(int)track.Id]=Math.Min(levels,track.PermanentCap);
  var loadout=new LastStandLoadout("launcher","repair");var research=LastStandCombatResearchSnapshot.None;
  var shop=new LastStandShopState(1,loadout.Primary,paid,LastStandUpgradeCatalog.EconomyVersion,LastStandRunEdition.Current,tier,loadout,research);
  var m=EncounterModel.CreatePlayable(loadout.Primary,tier,shop,Snapshot(mode,rank));m.SkillBalanceSeedWave(wave);
  int initialHull=m.Hull,initialDamage=m.CurrentCannonDamage;string before=m.Snapshot();m.ApplyShopProjection(shop);m.ApplyShopProjection(shop);
  if(before!=m.Snapshot())throw new Exception("reapplying identical projection stacks effects");
  long dealt=0,taken=0;int firstKills=m.Kills,firstTick=m.Tick;var uses=new List<object>();
  Action count=()=>{foreach(var e in m.Events)switch(e.Kind){case EncounterEventKind.Cannon:case EncounterEventKind.Launcher:case EncounterEventKind.Scattergun:case EncounterEventKind.Mortar:case EncounterEventKind.Railgun:case EncounterEventKind.Arc:case EncounterEventKind.Minefield:dealt+=e.Amount;break;case EncounterEventKind.CloseHit:case EncounterEventKind.RangedHit:taken+=e.Amount;break;}};
  Action<LastStandSkillId> use=id=>{if(m.TryActivateSkill(id)){count();uses.Add(D("skill",LastStandSkillCatalog.Get(id).Key,"tick",m.Tick,"wave",m.Wave,"hull",m.Hull));}};
  while(m.Status==EncounterStatus.Running&&m.Tick<50000&&m.CompletedWave<wave+49){
   if(mode=="active"){
    if(m.ActiveCount>=Math.Max(4,m.WaveEnemyCount/2)||m.Hull*100L<=m.CurrentMaximumHull*60L)use(LastStandSkillId.Overdrive);
    if(m.Hull*100L<=m.CurrentMaximumHull*45L)use(LastStandSkillId.EmergencyRepairs);
    int close=0;foreach(var enemy in m.Foes)if(enemy.Alive&&enemy.Distance<=EncounterModel.MinefieldRadius)close++;
    if(close>=2||m.Hull*100L<=m.CurrentMaximumHull*60L)use(LastStandSkillId.Minefield);
   }
   m.Step();count();if(m.AwaitingWaveCommit)m.ContinueAfterCheckpoint();
  }
  return D("scenario",scenario,"tier",tier,"startingWave",wave,"permanentLevel",levels,"skillRank",rank,"mode",mode,
   "fitting","launcher+repair","researchRanks",new[]{0,0,0},"ticks",m.Tick-firstTick,"simulatedMilliseconds",(m.Tick-firstTick)*50,
   "outcome",m.Status==EncounterStatus.Defeated?"defeated":m.CompletedWave>=wave+49?"50-wave-cap":"tick-cap","wavesCleared",m.CompletedWave-wave+1,
   "kills",m.Kills-firstKills,"effectiveDamage",dealt,"hullDamageTaken",taken,
   "initialHull",initialHull,"finalHull",m.Hull,"initialCannonDamage",initialDamage,"healed",m.Restored,"uses",uses,"repeatProjectionUnchanged",true);
 }
 public static int Main(){try{var rows=new List<object>();foreach(string mode in new[]{"none","passive","active"}){
  rows.Add(Run("early-pressure",1,25,0,1,mode));rows.Add(Run("mid-pressure",3,500,100,2,mode));rows.Add(Run("deep-pressure",6,2500,800,3,mode));
  rows.Add(Run("early-sustained",1,25,5,1,mode));rows.Add(Run("mid-sustained",3,500,300,2,mode));rows.Add(Run("deep-sustained",6,2500,1600,3,mode));}
  Console.WriteLine(LastStandSaveJson.Write(D("schema",1,"policy","skills-seeded-pressure-v1","rulesVersion",LastStandRunEdition.Current.RulesVersion,
   "scope","Modeled production combat with laboratory full-hull, fresh-use, three-slot initial conditions; not earned acquisition, elapsed-time endurance or native-play proof.",
   "activationPolicy","Overdrive at half-wave active enemies (at least4) or60%hull; Repairs at45%hull; Mines at2nearby enemies or60%hull. Once each per run. No in-run purchases. Cease after50clears or50000ticks.","rows",rows)));return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
