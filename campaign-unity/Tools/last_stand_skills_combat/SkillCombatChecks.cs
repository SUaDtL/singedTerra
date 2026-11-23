using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;
namespace SingedTerra.Encounter {
 public sealed partial class EncounterModel {
  public void SkillTestTargets(int distance=1000,int hull=10000,int incoming=0) {
   nextSpawn=1000000;waveSpawned=WaveEnemyCount;Spawned=WaveEnemyCount;
   foreach(var foe in foes)foe.Hull=0;
   for(int i=0;i<WaveEnemyCount;i++) {var foe=foes[i];foe.Id=i+1;foe.WaveOrdinal=i;foe.Lane=0;foe.Kind=FoeKind.Close;
    foe.Distance=distance+Profile.Speed(foe.Kind);foe.Hull=foe.MaximumHull=hull;foe.Damage=i==0?incoming:0;foe.NextAttack=0;foe.Armor=0;}
  }
  public void SkillTestHull(int value){Hull=value;}
  public void SkillTestWeaponsDelayed(){nextCannon=nextLauncher=nextScattergun=nextMortar=nextRailgun=nextArc=1000000;}
 }
}
static class SkillCombatChecks {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static LastStandSkillSnapshot Skills(params LastStandSkillId[] ids){var ranks=new int[6];foreach(var id in ids)ranks[(int)id]=1;return new LastStandSkillSnapshot(new LastStandSkillLoadout(ids),ranks);}
 static LastStandShopState Shop(LastStandRunEdition edition=null,string secondary=null){var loadout=new LastStandLoadout("launcher",secondary);return new LastStandShopState(1,loadout.Primary,new int[LastStandUpgradeCatalog.Tracks.Count],LastStandUpgradeCatalog.EconomyVersion,edition??LastStandRunEdition.Current,1,loadout);}
 static EncounterModel Model(LastStandSkillSnapshot skills,string secondary=null)=>EncounterModel.CreatePlayable(LastStandFitting.Launcher,1,Shop(secondary:secondary),skills);
 static void Activation(){var m=Model(Skills(LastStandSkillId.Overdrive,LastStandSkillId.EmergencyRepairs));Check(!m.TryActivateSkill(LastStandSkillId.Minefield),"unequipped denied");Check(!m.TryActivateSkill(LastStandSkillId.EmergencyRepairs),"full hull does not consume");m.SkillTestHull(60);Check(m.TryActivateSkill(LastStandSkillId.EmergencyRepairs)&&m.Hull==96,"30 percent immediate repair");Check(!m.TryActivateSkill(LastStandSkillId.EmergencyRepairs),"spent repair denied");Check(m.TryActivateSkill(LastStandSkillId.Overdrive)&&!m.TryActivateSkill(LastStandSkillId.Overdrive),"one overdrive per run");Check(!m.TryActivateSkill(LastStandSkillId.ReinforcedHull),"passive cannot activate");}
 static void Overdrive(){var normal=Model(Skills(),"scattergun");var boosted=Model(Skills(LastStandSkillId.Overdrive),"scattergun");normal.SkillTestTargets();boosted.SkillTestTargets();normal.Step();boosted.Step();Check(boosted.TryActivateSkill(LastStandSkillId.Overdrive),"activate after first volley");for(int n=0;n<239;n++){normal.Step();boosted.Step();}Check(boosted.CannonShots>normal.CannonShots&&boosted.LauncherShots>normal.LauncherShots&&boosted.ScattergunShots>normal.ScattergunShots,"all weapons accelerated");Check(boosted.OverdriveRemainingTicks==1,"exact simulated duration");boosted.Step();Check(boosted.OverdriveRemainingTicks==0,"overdrive expires");int first=boosted.CannonShots;for(int n=0;n<100;n++)boosted.Step();Check(boosted.CannonShots-first==5,"normal cadence resumes");}
 static void Minefield(){var m=Model(Skills(LastStandSkillId.Minefield));m.SkillTestTargets(11000);m.SkillTestWeaponsDelayed();Check(m.TryActivateSkill(LastStandSkillId.Minefield),"arm mines");m.Step();Check(m.MinefieldArmed,"wait outside ring");m.Foes[0].Distance=10000+m.Profile.Speed(m.Foes[0].Kind);m.Step();Check(!m.MinefieldArmed&&m.Foes[0].Hull==9920&&m.Foes[1].Hull==10000,"only ring enemies take four cannon hits");Check(!m.TryActivateSkill(LastStandSkillId.Minefield),"detonation does not refill");}
 static void Passives(){var skills=Skills(LastStandSkillId.ReinforcedHull,LastStandSkillId.Ballistics,LastStandSkillId.ReactiveLining);var m=Model(skills);Check(m.CurrentMaximumHull==132&&m.Hull==132,"hull passive");Check(m.CurrentCannonDamage==21,"ballistics damage");Check(m.IncomingDamagePerHit(20)==18&&m.IncomingDamagePerHit(1)==1,"lining after armor with floor");m.SkillTestHull(70);m.ApplyShopProjection(Shop());Check(m.Hull==70&&m.CurrentMaximumHull==132&&m.CurrentCannonDamage==21,"projection does not stack or heal");}
 static void Checkpoint(){var skills=Skills(LastStandSkillId.Overdrive,LastStandSkillId.Minefield);var start=LastStandRunCheckpoint.Start(1,1,new LastStandLoadout("launcher"),new int[LastStandUpgradeCatalog.Tracks.Count],skills:skills);var m=start.RestoreModel();Check(m.TryActivateSkill(LastStandSkillId.Overdrive)&&m.TryActivateSkill(LastStandSkillId.Minefield),"activate both");while(!m.AwaitingWaveCommit&&m.Status==EncounterStatus.Running)m.Step();Check(m.AwaitingWaveCommit,"first wave clear");var checkpoint=m.CaptureCheckpoint();var resumed=EncounterModel.RestoreCheckpoint(m.Profile,m.Fitting,checkpoint);Check(resumed.Snapshot()==m.Snapshot(),"exact effect restore");Check(!resumed.TryActivateSkill(LastStandSkillId.Overdrive)&&!resumed.TryActivateSkill(LastStandSkillId.Minefield),"spent or boundary denied");m.ContinueAfterCheckpoint();resumed.ContinueAfterCheckpoint();Check(!resumed.TryActivateSkill(LastStandSkillId.Overdrive)&&!resumed.TryActivateSkill(LastStandSkillId.Minefield),"spent uses stay spent after continue");for(int i=0;i<50;i++){m.Step();resumed.Step();}Check(m.Snapshot()==resumed.Snapshot(),"resume deterministic");Check(start.RestoreModel().CanActivateSkill(LastStandSkillId.Overdrive),"unfinished entire wave rolls back together");}
 static void Retained(){var shop=Shop(LastStandRunEdition.Buildcraft);var old=EncounterModel.CreatePlayable(shop.Fitting,1,shop);Check(old.Skills.IsEmpty&&!old.CanActivateSkill(LastStandSkillId.Overdrive),"old edition neutral");bool rejected=false;try{EncounterModel.CreatePlayable(shop.Fitting,1,shop,Skills(LastStandSkillId.Overdrive));}catch(ArgumentException){rejected=true;}Check(rejected,"old edition cannot gain skills");Check(LastStandRunEdition.Resolve("last-stand-waves-v3","last-stand-content-v3",shop.EconomyVersion)==LastStandRunEdition.Buildcraft,"retained v3 resolves");}
 static void Invalid(){var m=Model(Skills(LastStandSkillId.Overdrive));var e=m.CaptureCheckpoint();bool rejected=false;try{new LastStandSkillCombatCheckpoint(8).Validate(e.Skills,e.Tick+1,e.CannonDamage);}catch(ArgumentException){rejected=true;}Check(rejected,"unknown spent bits rejected");rejected=false;try{new LastStandSkillCombatCheckpoint(4,0,true,1).Validate(e.Skills,e.Tick+1,e.CannonDamage);}catch(ArgumentException){rejected=true;}Check(rejected,"unequipped mine state rejected");}
 static LastStandSkillSnapshot Ranked(int rank,params LastStandSkillId[] ids){var ranks=new int[6];foreach(var id in ids)ranks[(int)id]=rank;return new LastStandSkillSnapshot(new LastStandSkillLoadout(ids),ranks);}
 static void Ranks(){for(int rank=1;rank<=3;rank++){
  var passive=Model(Ranked(rank,LastStandSkillId.ReinforcedHull,LastStandSkillId.Ballistics,LastStandSkillId.ReactiveLining));
  Check(passive.CurrentMaximumHull==120*(105+5*rank)/100,"rank hull formula");Check(passive.CurrentCannonDamage==20*(104+4*rank)/100,"rank damage formula");
  passive.TryApplyPlayableArmorProjection(5);Check(passive.IncomingDamagePerHit(25)==20*(95-5*rank)/100,"rank defense after armor");
  var active=Model(Ranked(rank,LastStandSkillId.Overdrive,LastStandSkillId.EmergencyRepairs,LastStandSkillId.Minefield));active.SkillTestHull(1);
  Check(active.TryActivateSkill(LastStandSkillId.EmergencyRepairs)&&active.Hull==1+120*(20+10*rank)/100,"rank repair formula");
  Check(active.TryActivateSkill(LastStandSkillId.Overdrive)&&active.OverdriveRemainingTicks==(9+3*rank)*20,"rank duration formula");
  Check(active.TryActivateSkill(LastStandSkillId.Minefield)&&active.MinefieldDamage==20*(3+rank),"rank mine formula");
 }}
 static void Clock(){var direct=Model(Skills(LastStandSkillId.Overdrive,LastStandSkillId.Minefield));var paced=Model(Skills(LastStandSkillId.Overdrive,LastStandSkillId.Minefield));
  direct.SkillTestTargets(12000);paced.SkillTestTargets(12000);direct.TryActivateSkill(LastStandSkillId.Overdrive);paced.TryActivateSkill(LastStandSkillId.Overdrive);
  direct.TryActivateSkill(LastStandSkillId.Minefield);paced.TryActivateSkill(LastStandSkillId.Minefield);
  var clock=new LastStandRunClock(0,400,1,5);Action<double> advance=time=>{do{Check(clock.Observe(time),"clock admits");while(clock.TryTakeStep())paced.Step();}while(clock.CatchingUp);};
  advance(1);string before=paced.Snapshot();Check(clock.Pause(1),"pause admitted");advance(101);Check(paced.Snapshot()==before&&paced.OverdriveRemainingTicks==220,"pause freezes skill timers");
  Check(clock.Resume(101)&&clock.SetSpeed(101,5),"resume5x");advance(104.8);for(int n=0;n<400;n++)direct.Step();Check(paced.Tick==400&&paced.Snapshot()==direct.Snapshot(),"speed and delayed callback preserve skill outcomes");
 }
 static void ArmedBoundary(){var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)LastStandUpgradeTrackId.CannonAttack]=100;
  var cp=LastStandRunCheckpoint.Start(1,1,new LastStandLoadout("launcher"),levels,skills:Skills(LastStandSkillId.Minefield,LastStandSkillId.Overdrive,LastStandSkillId.ReinforcedHull));
  var model=cp.RestoreModel();var shop=cp.RestoreShop();model.SkillTestHull(70);
  Check(model.TryActivateSkill(LastStandSkillId.Minefield)&&model.TryActivateSkill(LastStandSkillId.Overdrive),"arm both effects before earning purchase funds");
  int armedDamage=model.MinefieldDamage,oldDamage=model.CurrentCannonDamage,oldMaximum=model.CurrentMaximumHull;
  int fundingBudget=200;while(shop.Scrap<5&&model.Status==EncounterStatus.Running&&fundingBudget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}
  Check(shop.Scrap>=5&&model.MinefieldArmed&&model.OverdriveRemainingTicks>0&&!model.AwaitingWaveCommit,"actual kills fund a purchase while both effects remain active");
  int scrap=shop.Scrap,spent=shop.SpentScrap,hull=model.Hull,remaining=model.OverdriveRemainingTicks;
  var purchase=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack,LastStandBulkQuantity.One));
  Check(purchase.Accepted&&purchase.ChargedScrap==5&&shop.Scrap==scrap-5&&shop.SpentScrap==spent+5&&shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases==1,"real paid cannon purchase debits earned Scrap once");
  model.ApplyShopProjection(shop);
  Check(oldDamage==1125&&model.CurrentCannonDamage==1138&&model.MinefieldDamage==armedDamage&&armedDamage<model.CurrentCannonDamage*4,"paid attack improves weapon but cannot reprice armed mines");
  Check(model.Hull==hull&&model.CurrentMaximumHull==oldMaximum&&oldMaximum==132&&model.OverdriveRemainingTicks==remaining,"attack purchase does not heal, stack passive hull or restart Overdrive");
  Check(model.RemainingSkillUses(LastStandSkillId.Minefield)==0&&model.RemainingSkillUses(LastStandSkillId.Overdrive)==0,"purchase cannot refill active uses");
  string projected=model.Snapshot();model.ApplyShopProjection(shop);model.ApplyShopProjection(shop);Check(model.Snapshot()==projected,"reapplying paid projection changes no skill or hull state");
  int budget=20000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}
  Check(model.AwaitingWaveCommit&&model.MinefieldArmed&&model.OverdriveRemainingTicks>0,"high attack clears before ring contact and Overdrive expiry");
  cp=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint());var restored=cp.RestoreModel();var restoredShop=cp.RestoreShop();
  Check(restoredShop.SpentScrap==5&&restoredShop.Scrap==shop.Scrap&&restoredShop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases==1,"checkpoint retains paid purchase and debit");
  Check(restored.MinefieldArmed&&restored.MinefieldDamage==armedDamage&&restored.CurrentCannonDamage==1138&&restored.Hull==70&&restored.Snapshot()==model.Snapshot(),"checkpoint retains old armed damage, new paid attack, active timer and damaged passive hull");
  Check(model.ContinueAfterCheckpoint()&&restored.ContinueAfterCheckpoint(),"continue matching paid checkpoints");
  Check(!restored.TryActivateSkill(LastStandSkillId.Minefield)&&!restored.TryActivateSkill(LastStandSkillId.Overdrive),"restored paid boundary cannot refill used actives");
  for(int n=0;n<50;n++){model.Step();restored.Step();}Check(model.Snapshot()==restored.Snapshot(),"paid upgrade and effect restore have identical future combat");
  var newer=Model(Skills(LastStandSkillId.Minefield));Check(newer.RemainingSkillUses(LastStandSkillId.Minefield)==1,"new deployment alone resets uses");
 }
 public static int Main(string[] args){try{switch(args[0]){case "ranks":Ranks();break;case "clock":Clock();break;case "armed-boundary":ArmedBoundary();break;case "activation":Activation();break;case "overdrive":Overdrive();break;case "minefield":Minefield();break;case "passives":Passives();break;case "checkpoint":Checkpoint();break;case "retained":Retained();break;case "invalid":Invalid();break;default:throw new Exception("unknown case");}Console.WriteLine("PASS "+args[0]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
