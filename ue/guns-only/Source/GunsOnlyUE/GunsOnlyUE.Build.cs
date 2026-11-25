using System.IO;
using UnrealBuildTool;

public class GunsOnlyUE : ModuleRules
{
	public GunsOnlyUE(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"ProceduralMeshComponent",
			"UMG",
			"Slate",
			"SlateCore",
			"ImageWrapper",
			"Json",
			"JsonUtilities",
			"RenderCore",
			"RHI"
		});

		string ProjectDir = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", ".."));
		string IncludeDir = Path.Combine(ProjectDir, "ThirdParty", "GunsOnlySim", "include");
		PublicIncludePaths.Add(IncludeDir);

		if (Target.Platform == UnrealTargetPlatform.Mac)
		{
			string MacLib = Path.Combine(ProjectDir, "Binaries", "ThirdParty", "GunsOnlySim", "Mac", "libGunsOnlySim.dylib");
			if (File.Exists(MacLib))
			{
				RuntimeDependencies.Add("$(BinaryOutputDir)/libGunsOnlySim.dylib", MacLib);
			}
		}
		else if (Target.Platform == UnrealTargetPlatform.IOS)
		{
			PublicDefinitions.Add("GUNS_SIM_STATIC=1");
			string IosLib = Path.Combine(ProjectDir, "ThirdParty", "GunsOnlySim", "lib", "ios-arm64", "libGunsOnlySim.a");
			if (File.Exists(IosLib))
			{
				PublicAdditionalLibraries.Add(IosLib);
			}
		}
	}
}
