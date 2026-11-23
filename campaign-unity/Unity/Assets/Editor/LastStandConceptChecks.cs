using UnityEngine;

// One serial editor invocation exercises the affected presentation boundaries.
public static class LastStandConceptChecks
{
    public static void RunGrounding()
    {
        LastStandEquipmentBayChecks.Run();LastStandArmoryChecks.Run();
        LastStandFittingChecks.Run();LastStandInterfaceCompositionChecks.Run();
        Debug.Log("ST_CONCEPT_GROUNDING_CHECKS_PASS");
    }
    public static void RunInterface()
    {
        LastStandInterfaceCompositionChecks.Run();
        LastStandControlsChecks.Run();LastStandFittingChecks.Run();RunFidelity();
        Debug.Log("ST_CONCEPT_INTERFACE_CHECKS_PASS");
    }
    public static void RunInterfaceMenus()
    {
        LastStandShopChecks.RunWorkshop();LastStandShopChecks.RunBattleShop();LastStandShopChecks.RunResearchSprint();
        LastStandHudChecks.RunGarage();LastStandHudChecks.RunBattle();
        Debug.Log("ST_CONCEPT_INTERFACE_MENUS_PASS");
    }
    public static void RunInterfaceRemaining()
    {
        LastStandHudChecks.RunGarage();LastStandHudChecks.RunBattle();LastStandHudChecks.RunEffects();
        LastStandInterfaceCompositionChecks.Run();LastStandFittingChecks.Run();Debug.Log("ST_CONCEPT_INTERFACE_REMAINING_PASS");
    }
    public static void RunInterfaceFinal()
    {
        LastStandHudChecks.RunBattle();LastStandInterfaceCompositionChecks.Run();LastStandFittingChecks.Run();
        Debug.Log("ST_CONCEPT_INTERFACE_FINAL_PASS");
    }
    public static void RunFidelity()
    {
        Run();RunRegression();LastStandTankKitImport.Validate();
        LastStandHudChecks.RunGarage();LastStandHudChecks.RunBattle();
        Debug.Log("ST_CONCEPT_FIDELITY_CHECKS_PASS");
    }
    public static void Run()
    {
        LastStandEquipmentBayChecks.Run();
        LastStandArmoryChecks.Run();
        LastStandEnvironmentChecks.Run();
        Debug.Log("ST_CONCEPT_CHECKS_PASS");
    }
    public static void RunRegression()
    {
        LastStandUiFoundationChecks.Run();
        LastStandLoopChecks.RunChromeChecks();
        LastStandAppearanceChecks.Run();
        LastStandArmamentChecks.Run();
        LastStandCombatFeedbackChecks.Run();
        LastStandWaveChecks.Run();
        Debug.Log("ST_CONCEPT_REGRESSION_PASS");
    }
}
