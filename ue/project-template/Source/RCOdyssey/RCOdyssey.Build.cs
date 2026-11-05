using UnrealBuildTool;

// Game module. Phase 3 adds the SimHost (V8/Puerts) bridge and the RenderAdapter here.
public class RCOdyssey : ModuleRules
{
	public RCOdyssey(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });
	}
}
