using System;
using System.Collections.Generic;
using System.IO;
using GunsOnly.UnityBridge;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// F-22-only low-altitude presentation assembled from exact Web inputs:
/// the GOKTRN1 32 m source grid, Web terrain triangulation/normal/land-cover maths, the byte-identical
/// generated foliage atlas, and a renderer-neutral export of the Web desktop/near scenery plan.
/// Nothing in this component supplies collision, navigation, targeting, or simulation authority.
/// </summary>
public sealed class F22UkraineLowAltitudeWorld : MonoBehaviour {
    public const string PresentationId =
        "presentation.ukraine-modern.f22-low-altitude.web-build-299.v1";
    public const string TerrainTruthResourcePath =
        "GunsOnly/UkraineModern/environment/terrain/rapier-site.kernel.truth";
    public const string PresentationResourcePath =
        "GunsOnly/UkraineModern/presentation/f22-low-altitude-world.web-build-299.v1";
    public const string FoliageTextureResourcePath =
        "GunsOnly/UkraineModern/environment/foliage/ukraine-temperate-foliage-v1";
    public const string FoliageManifestResourcePath =
        "GunsOnly/UkraineModern/environment/foliage/ukraine-foliage-art-manifest.v1";
    public const string FoliageShaderResourcePath =
        "GunsOnly/UkraineModern/F22UkraineFoliage";

    public const string TerrainTruthSha256 =
        "ae3f377f360a81e3fc4482d6bc8410190968da69749c5333f038e1d99aa07908";
    public const string FoliageSha256 =
        "9172d362a64332cb87535359b2ed9553db28fb01628de909196446ff34ccfec4";
    public const string FoliageManifestSha256 =
        "d9a2ff59a5c9d2e54c6696c121befe7f8f7b4fa68599e975a14e747c8ce61e77";
    public const string PresentationSha256 =
        "7a5abfaaca1ab1ab91752ac669dfb0da236726d9e5586b811c48366b533b26be";
    public const float FoliageAlphaCutoff = 0.38f;
    public const float DetailHalfSpanM = 8192f;
    public const float FarFallbackHalfSpanM = 64000f;
    public const int ExactTerrainSampleCount = 513;
    public const int ExactTerrainTileSampleCount = 257;
    public const float ExactTerrainSpacingM = 32f;

    public Material TerrainMaterial { get; private set; }
    public static bool NativeQaCaptureEnabled => Array.Exists(
        Environment.GetCommandLineArgs(),
        argument => string.Equals(argument, "--f22-low-altitude-qa",
            StringComparison.OrdinalIgnoreCase));

    readonly List<Mesh> _ownedMeshes = new();
    readonly List<Material> _ownedMaterials = new();
    TerrainTruth _truth;
    WorldContract _contract;

    public static F22UkraineLowAltitudeWorld Build(Transform parent) {
        if (parent == null) throw new ArgumentNullException(nameof(parent));
        var root = new GameObject("F22UkraineLowAltitudeWorld");
        root.transform.SetParent(parent, false);
        var world = root.AddComponent<F22UkraineLowAltitudeWorld>();
        world.BuildOrThrow();
        return world;
    }

    public void ApplyAltitude(float cameraAglM) =>
        KoreaHighlandSurface.ApplyF22UkraineAltitude(TerrainMaterial, cameraAglM);

    public void ConfigureFixedQaCamera(Camera camera) {
        if (camera == null) throw new ArgumentNullException(nameof(camera));
        const float eastM = 1280f;
        const float northM = -4500f;
        float surfaceM = SampleHeightM(eastM, northM);
        camera.transform.position = new Vector3(eastM, surfaceM + 90f, -northM);
        camera.transform.rotation = Quaternion.LookRotation(
            new Vector3(0.20f, -0.075f, -0.977f).normalized,
            Vector3.up);
        camera.fieldOfView = F22PresentationContract.CockpitVerticalFovDeg;
    }

    public float SampleHeightM(float eastM, float northM) {
        if (_truth == null) throw new InvalidOperationException("Terrain truth is not loaded.");
        return _truth.SampleHeight(eastM, northM);
    }

    void BuildOrThrow() {
        TextAsset terrainAsset = Resources.Load<TextAsset>(TerrainTruthResourcePath);
        TextAsset contractAsset = Resources.Load<TextAsset>(PresentationResourcePath);
        Texture2D foliageAtlas = Resources.Load<Texture2D>(FoliageTextureResourcePath);
        TextAsset foliageManifest = Resources.Load<TextAsset>(FoliageManifestResourcePath);
        if (terrainAsset == null || contractAsset == null || foliageAtlas == null
            || foliageManifest == null) {
            throw new InvalidOperationException(
                "F-22 low-altitude Resources are incomplete; presentation fails closed.");
        }

        _truth = TerrainTruth.Decode(terrainAsset.bytes);
        _contract = JsonUtility.FromJson<WorldContract>(contractAsset.text);
        ValidateRuntimeContract(_contract, foliageAtlas);

        TerrainMaterial = KoreaHighlandSurface.CreateMaterial(
            KoreaHighlandSurface.Presentation.F22UkraineCombat);
        BuildExactTerrainTiles();
        BuildFarFallback();

        Shader sceneryShader = Resources.Load<Shader>(FoliageShaderResourcePath)
            ?? Shader.Find("GunsOnly/F22UkraineFoliage");
        if (sceneryShader == null) {
            throw new InvalidOperationException(
                "Missing retained F-22 Ukraine foliage/scenery shader.");
        }
        foliageAtlas.wrapMode = TextureWrapMode.Clamp;
        foliageAtlas.filterMode = FilterMode.Trilinear;
        foliageAtlas.anisoLevel = Mathf.Max(4, foliageAtlas.anisoLevel);
        Material foliageMaterial = CreateSceneryMaterial(
            sceneryShader, foliageAtlas, useAtlas: true,
            "F22_UKRAINE_WEB_FOLIAGE_V1");
        Material structureMaterial = CreateSceneryMaterial(
            sceneryShader, Texture2D.whiteTexture, useAtlas: false,
            "F22_UKRAINE_WEB_STRUCTURE_V1");
        _ownedMaterials.Add(foliageMaterial);
        _ownedMaterials.Add(structureMaterial);

        BuildFoliage(foliageMaterial);
        BuildStructuresAndRoutes(structureMaterial);
        Debug.Log(
            "[GunsOnly] F-22 exact low-altitude world ready"
            + " terrain=513x513@32m tiles=4"
            + " trees=" + _contract.counts.trees
            + " buildings=" + _contract.counts.buildings
            + " roads=" + _contract.counts.roadSegments
            + " terrainSha=" + TerrainTruthSha256.Substring(0, 12)
            + " foliageSha=" + FoliageSha256.Substring(0, 12)
            + " contractSha=" + PresentationSha256.Substring(0, 12));
    }

    void ValidateRuntimeContract(WorldContract contract, Texture2D foliageAtlas) {
        if (contract == null
            || !string.Equals(contract.presentationId, PresentationId,
                StringComparison.Ordinal)
            || contract.terrain == null
            || !string.Equals(contract.terrain.sha256, TerrainTruthSha256,
                StringComparison.Ordinal)
            || contract.foliageAtlas == null
            || !string.Equals(contract.foliageAtlas.sha256, FoliageSha256,
                StringComparison.Ordinal)
            || contract.chunks == null
            || contract.chunks.Length != 4
            || contract.counts == null
            || contract.foliageAtlas.roles == null
            || contract.foliageAtlas.roles.Length != 4) {
            throw new InvalidDataException(
                "F-22 low-altitude presentation contract identity is invalid.");
        }
        if (foliageAtlas.width != 1024 || foliageAtlas.height != 1024
            || Mathf.Abs(contract.foliageAtlas.alphaCutoff - FoliageAlphaCutoff) > 0.0001f) {
            throw new InvalidDataException(
                "F-22 Ukraine foliage atlas dimensions/cutoff changed.");
        }
        int trees = 0;
        int buildings = 0;
        int roads = 0;
        foreach (ContractChunk chunk in contract.chunks) {
            if (chunk == null || chunk.sourceRecord == null
                || chunk.sourceRecord.level != 0
                || chunk.sourceRecord.sampleCount != ExactTerrainTileSampleCount
                || Mathf.Abs(chunk.sourceRecord.spacingM - ExactTerrainSpacingM) > 0.001f) {
                throw new InvalidDataException("F-22 scenery chunk lost its exact Web LOD0 source.");
            }
            trees += chunk.trees?.Length ?? 0;
            buildings += chunk.buildings?.Length ?? 0;
            roads += chunk.roads?.Length ?? 0;
        }
        if (trees != contract.counts.trees
            || buildings != contract.counts.buildings
            || roads != contract.counts.roadSegments) {
            throw new InvalidDataException("F-22 scenery placement counts do not match the contract.");
        }
    }

    Material CreateSceneryMaterial(
        Shader shader,
        Texture texture,
        bool useAtlas,
        string materialName) {
        var material = new Material(shader) { name = materialName };
        material.SetTexture("_MainTex", texture);
        material.SetFloat("_UseAtlas", useAtlas ? 1f : 0f);
        material.SetFloat("_Cutoff", FoliageAlphaCutoff);
        material.SetFloat("_EmissiveIntensity", 0.16f);
        material.SetFloat("_FogDensity", F22UkraineVisualContract.BaseFogDensityPerM);
        material.SetFloat(
            "_AtmosphereDensityScale",
            F22UkraineVisualContract.AtmosphereDensityScale);
        material.SetVector("_FogColor", ToVector(F22UkraineVisualContract.FogLow));
        material.SetVector(
            "_AtmosphereHazeColor",
            ToVector(F22UkraineVisualContract.AtmosphereHaze));
        material.SetFloat("_AtmosphereHazeMix", F22UkraineVisualContract.AtmosphereHazeMix);
        material.SetFloat("_ShadowFloor", F22UkraineVisualContract.ShadowFloor);
        return material;
    }

    void BuildExactTerrainTiles() {
        for (int tileNorth = 0; tileNorth < 2; tileNorth++) {
            for (int tileEast = 0; tileEast < 2; tileEast++) {
                Mesh mesh = CreateExactTerrainTile(tileEast, tileNorth);
                AttachMesh(
                    $"ExactWebTerrain_e{tileEast}_n{tileNorth}",
                    mesh,
                    TerrainMaterial,
                    ShadowCastingMode.On,
                    receiveShadows: true);
            }
        }
    }

    Mesh CreateExactTerrainTile(int tileEast, int tileNorth) {
        const int samples = ExactTerrainTileSampleCount;
        const int cells = samples - 1;
        int sourceStartEast = tileEast * cells;
        int sourceStartNorth = tileNorth * cells;
        var heights = new float[samples * samples];
        var water = new byte[heights.Length];
        for (int north = 0; north < samples; north++) {
            for (int east = 0; east < samples; east++) {
                int index = north * samples + east;
                short raw = _truth.Raw(sourceStartEast + east, sourceStartNorth + north);
                bool isWater = raw == _truth.WaterSentinel;
                water[index] = isWater ? (byte)1 : (byte)0;
                heights[index] = isWater ? 0f : raw * _truth.MetresPerUnit;
            }
        }
        float[] surfaceHeights = ReconstructWaterHeights(heights, water, samples);
        Vector3[] normals = SmoothedWebNormals(surfaceHeights, water, samples);
        var vertices = new Vector3[heights.Length];
        var colors = new Color32[heights.Length];
        int ringSamples = Mathf.Max(1, Mathf.Min(
            (samples - 1) / 2,
            Mathf.RoundToInt(300f / ExactTerrainSpacingM)));
        float[] concavity = WebConcavity(surfaceHeights, samples, ringSamples);
        for (int north = 0; north < samples; north++) {
            float sourceNorthM = _truth.OriginNorthM
                + (sourceStartNorth + north) * ExactTerrainSpacingM;
            for (int east = 0; east < samples; east++) {
                float sourceEastM = _truth.OriginEastM
                    + (sourceStartEast + east) * ExactTerrainSpacingM;
                int index = north * samples + east;
                vertices[index] = new Vector3(
                    sourceEastM,
                    surfaceHeights[index],
                    -sourceNorthM);
                colors[index] = WebLandcoverColor(
                    sourceEastM,
                    sourceNorthM,
                    ExactTerrainSpacingM,
                    concavity[index],
                    water[index] != 0);
            }
        }
        var indices = new int[cells * cells * 6];
        int cursor = 0;
        for (int north = 0; north < cells; north++) {
            for (int east = 0; east < cells; east++) {
                int southwest = north * samples + east;
                int southeast = southwest + 1;
                int northwest = southwest + samples;
                int northeast = northwest + 1;
                indices[cursor++] = southwest;
                indices[cursor++] = southeast;
                indices[cursor++] = northwest;
                indices[cursor++] = southeast;
                indices[cursor++] = northeast;
                indices[cursor++] = northwest;
            }
        }
        var mesh = new Mesh {
            name = $"F22ExactWebTerrain_{tileEast}_{tileNorth}",
            indexFormat = IndexFormat.UInt32,
        };
        mesh.vertices = vertices;
        mesh.normals = normals;
        mesh.colors32 = colors;
        mesh.triangles = indices;
        mesh.RecalculateBounds();
        _ownedMeshes.Add(mesh);
        return mesh;
    }

    void BuildFarFallback() {
        const int samples = 129;
        const int cells = samples - 1;
        float spacing = FarFallbackHalfSpanM * 2f / cells;
        var vertices = new Vector3[samples * samples];
        var colors = new Color32[vertices.Length];
        for (int north = 0; north < samples; north++) {
            float sourceNorthM = -FarFallbackHalfSpanM + north * spacing;
            for (int east = 0; east < samples; east++) {
                float sourceEastM = -FarFallbackHalfSpanM + east * spacing;
                int index = north * samples + east;
                float heightM = FarFallbackHeight(sourceEastM, sourceNorthM);
                vertices[index] = new Vector3(sourceEastM, heightM, -sourceNorthM);
                colors[index] = WebLandcoverColor(
                    sourceEastM, sourceNorthM, spacing, 0.5f, false);
            }
        }
        var indices = new List<int>(cells * cells * 6);
        for (int north = 0; north < cells; north++) {
            float centreNorthM = -FarFallbackHalfSpanM + (north + 0.5f) * spacing;
            for (int east = 0; east < cells; east++) {
                float centreEastM = -FarFallbackHalfSpanM + (east + 0.5f) * spacing;
                if (Mathf.Abs(centreEastM) < DetailHalfSpanM
                    && Mathf.Abs(centreNorthM) < DetailHalfSpanM) continue;
                int southwest = north * samples + east;
                int southeast = southwest + 1;
                int northwest = southwest + samples;
                int northeast = northwest + 1;
                indices.Add(southwest);
                indices.Add(southeast);
                indices.Add(northwest);
                indices.Add(southeast);
                indices.Add(northeast);
                indices.Add(northwest);
            }
        }
        var mesh = new Mesh {
            name = "F22BoundedFarTerrainFallback",
            indexFormat = IndexFormat.UInt32,
        };
        mesh.vertices = vertices;
        mesh.colors32 = colors;
        mesh.SetTriangles(indices, 0, true);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        _ownedMeshes.Add(mesh);
        AttachMesh(
            "BoundedFarTerrainFallback",
            mesh,
            TerrainMaterial,
            ShadowCastingMode.Off,
            receiveShadows: true);
    }

    float FarFallbackHeight(float eastM, float northM) {
        float edgeEast = Mathf.Clamp(eastM, -DetailHalfSpanM, DetailHalfSpanM);
        float edgeNorth = Mathf.Clamp(northM, -DetailHalfSpanM, DetailHalfSpanM);
        float edgeHeight = _truth.SampleHeight(edgeEast, edgeNorth);
        float outsideM = Mathf.Max(
            Mathf.Abs(eastM) - DetailHalfSpanM,
            Mathf.Abs(northM) - DetailHalfSpanM,
            0f);
        float blend = SmoothUnit(Mathf.Clamp01(outsideM / 4000f));
        float u = (eastM + FarFallbackHalfSpanM) / (FarFallbackHalfSpanM * 2f);
        float v = (northM + FarFallbackHalfSpanM) / (FarFallbackHalfSpanM * 2f);
        float broad = Mathf.PerlinNoise(u * 5.1f + 2.1f, v * 5.1f + 0.7f);
        float meso = Mathf.PerlinNoise(u * 17f + 9f, v * 17f + 3f);
        float fallback = 82f + broad * 265f + meso * 58f;
        return Mathf.Lerp(edgeHeight, fallback, blend);
    }

    void BuildFoliage(Material material) {
        var accumulator = new MeshAccumulator(_contract.counts.trees * 32);
        foreach (ContractChunk chunk in _contract.chunks) {
            foreach (TreePlacement tree in chunk.trees ?? Array.Empty<TreePlacement>()) {
                Vector3 position = SourcePosition(tree.positionSourceM);
                Vector3 scale = new(
                    tree.heightM * 0.42f * tree.widthScale,
                    tree.heightM * 0.92f,
                    tree.heightM * 0.42f);
                Color color = LinearColor(tree.tintLinearRgb);
                foreach (FoliageRole role in _contract.foliageAtlas.roles) {
                    AddFoliageCard(
                        accumulator, position, scale, tree.yawRad, role, role.yawRad, color);
                    AddFoliageCard(
                        accumulator, position, scale, tree.yawRad, role,
                        role.yawRad + Mathf.PI * 0.5f, color);
                }
            }
        }
        Mesh mesh = accumulator.ToMesh("F22ExactWebFoliagePlacements");
        _ownedMeshes.Add(mesh);
        AttachMesh(
            "ExactWebFoliagePlacements",
            mesh,
            material,
            ShadowCastingMode.On,
            receiveShadows: true);
    }

    static void AddFoliageCard(
        MeshAccumulator mesh,
        Vector3 position,
        Vector3 scale,
        float placementYaw,
        FoliageRole role,
        float cardYaw,
        Color color) {
        float tangentX = Mathf.Cos(cardYaw);
        float tangentZ = Mathf.Sin(cardYaw);
        float halfWidth = role.width * 0.5f;
        Vector3 left = new(
            role.centreX - tangentX * halfWidth,
            0f,
            role.centreZ - tangentZ * halfWidth);
        Vector3 right = new(
            role.centreX + tangentX * halfWidth,
            0f,
            role.centreZ + tangentZ * halfWidth);
        int start = mesh.Vertices.Count;
        mesh.Vertices.Add(TransformWeb(left, scale, placementYaw, position));
        mesh.Vertices.Add(TransformWeb(right, scale, placementYaw, position));
        left.y = role.height;
        right.y = role.height;
        mesh.Vertices.Add(TransformWeb(left, scale, placementYaw, position));
        mesh.Vertices.Add(TransformWeb(right, scale, placementYaw, position));
        float[] region = role.region;
        mesh.Uvs.Add(new Vector2(region[0], region[3]));
        mesh.Uvs.Add(new Vector2(region[2], region[3]));
        mesh.Uvs.Add(new Vector2(region[0], region[1]));
        mesh.Uvs.Add(new Vector2(region[2], region[1]));
        mesh.AddColors(color, 4);
        mesh.Indices.Add(start);
        mesh.Indices.Add(start + 1);
        mesh.Indices.Add(start + 2);
        mesh.Indices.Add(start + 1);
        mesh.Indices.Add(start + 3);
        mesh.Indices.Add(start + 2);
    }

    void BuildStructuresAndRoutes(Material material) {
        var mesh = new MeshAccumulator(_contract.counts.buildings * 90
            + _contract.counts.roadSegments * 48);
        foreach (ContractChunk chunk in _contract.chunks) {
            foreach (BuildingPlacement building in
                chunk.buildings ?? Array.Empty<BuildingPlacement>()) {
                Vector3 basePosition = SourcePosition(building.positionSourceM);
                Quaternion rotation = Quaternion.AngleAxis(building.yawRad * Mathf.Rad2Deg,
                    Vector3.up);
                Color wall = LinearColor(building.wallLinearRgb);
                Color roof = LinearColor(building.roofLinearRgb);
                foreach (BuildingLayout part in
                    _contract.geometry.buildingCompoundLayout) {
                    Vector3 localCentre = new(
                        part.x * building.widthM,
                        part.height * building.heightM * 0.5f,
                        part.z * building.depthM);
                    Vector3 centre = basePosition + rotation * localCentre;
                    Vector3 size = new(
                        part.width * building.widthM,
                        part.height * building.heightM,
                        part.depth * building.depthM);
                    mesh.AddBox(centre, rotation, size, wall);
                }
                float roofHeightM = Mathf.Min(building.widthM, building.depthM)
                    * (building.highRise ? 0.16f : 0.28f);
                mesh.AddPyramid(
                    basePosition + Vector3.up * building.heightM,
                    rotation,
                    building.widthM,
                    building.depthM,
                    roofHeightM,
                    roof);
            }

            foreach (SegmentPlacement road in chunk.roads ?? Array.Empty<SegmentPlacement>()) {
                mesh.AddSegmentBox(
                    SourcePosition(road.fromSourceM),
                    SourcePosition(road.toSourceM),
                    road.widthM,
                    0.12f,
                    0.085f,
                    LinearColor(_contract.materials.roadLinearRgb));
                mesh.AddSegmentBox(
                    SourcePosition(road.fromSourceM),
                    SourcePosition(road.toSourceM),
                    0.16f,
                    0.025f,
                    0.165f,
                    LinearColor(_contract.materials.roadMarkingLinearRgb));
            }
            foreach (SegmentPlacement rail in
                chunk.railSegments ?? Array.Empty<SegmentPlacement>()) {
                Vector3 from = SourcePosition(rail.fromSourceM);
                Vector3 to = SourcePosition(rail.toSourceM);
                mesh.AddSegmentBox(from, to, 4.2f, 0.18f, 0.1f,
                    LinearColor(_contract.materials.railBedLinearRgb));
                AddPairedRail(mesh, from, to, -0.72f);
                AddPairedRail(mesh, from, to, 0.72f);
            }
            foreach (SegmentPlacement runway in
                chunk.runways ?? Array.Empty<SegmentPlacement>()) {
                mesh.AddSegmentBox(
                    SourcePosition(runway.fromSourceM),
                    SourcePosition(runway.toSourceM),
                    runway.widthM,
                    0.11f,
                    0.08f,
                    LinearColor(_contract.materials.runwayLinearRgb));
            }
            foreach (PowerPolePlacement pole in
                chunk.powerPoles ?? Array.Empty<PowerPolePlacement>()) {
                Vector3 basePosition = SourcePosition(pole.positionSourceM);
                mesh.AddBox(
                    basePosition + Vector3.up * pole.heightM * 0.5f,
                    Quaternion.identity,
                    new Vector3(0.34f, pole.heightM, 0.34f),
                    LinearColor(_contract.materials.powerPoleLinearRgb));
            }
            foreach (SegmentPlacement line in
                chunk.powerLines ?? Array.Empty<SegmentPlacement>()) {
                mesh.AddSegmentBox(
                    SourcePosition(line.fromSourceM),
                    SourcePosition(line.toSourceM),
                    line.widthM,
                    0.08f,
                    0f,
                    LinearColor(_contract.materials.powerWireLinearRgb));
            }
        }
        Mesh presentationMesh = mesh.ToMesh("F22ExactWebStructuresAndRoutes");
        _ownedMeshes.Add(presentationMesh);
        AttachMesh(
            "ExactWebStructuresAndRoutes",
            presentationMesh,
            material,
            ShadowCastingMode.On,
            receiveShadows: true);
    }

    void AddPairedRail(MeshAccumulator mesh, Vector3 from, Vector3 to, float offsetM) {
        Vector3 horizontal = to - from;
        horizontal.y = 0f;
        Vector3 offset = horizontal.sqrMagnitude > 0.001f
            ? Vector3.Cross(Vector3.up, horizontal.normalized) * offsetM
            : Vector3.zero;
        mesh.AddSegmentBox(
            from + offset,
            to + offset,
            0.11f,
            0.13f,
            0.245f,
            LinearColor(_contract.materials.railLinearRgb));
    }

    void AttachMesh(
        string objectName,
        Mesh mesh,
        Material material,
        ShadowCastingMode shadows,
        bool receiveShadows) {
        var child = new GameObject(objectName);
        child.transform.SetParent(transform, false);
        child.AddComponent<MeshFilter>().sharedMesh = mesh;
        var renderer = child.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = material;
        renderer.shadowCastingMode = shadows;
        renderer.receiveShadows = receiveShadows;
    }

    void OnDestroy() {
        foreach (Mesh mesh in _ownedMeshes) {
            if (mesh != null) Destroy(mesh);
        }
        foreach (Material material in _ownedMaterials) {
            if (material != null) Destroy(material);
        }
        _ownedMeshes.Clear();
        _ownedMaterials.Clear();
    }

    static float[] ReconstructWaterHeights(
        float[] heights,
        byte[] water,
        int sampleCount) {
        var reconstructed = (float[])heights.Clone();
        var resolved = new byte[water.Length];
        for (int index = 0; index < water.Length; index++) {
            resolved[index] = water[index] == 0 ? (byte)1 : (byte)0;
        }
        for (int pass = 0; pass < 8; pass++) {
            var updates = new List<HeightUpdate>();
            for (int north = 0; north < sampleCount; north++) {
                for (int east = 0; east < sampleCount; east++) {
                    int index = north * sampleCount + east;
                    if (water[index] == 0 || resolved[index] != 0) continue;
                    float bankHeight = float.PositiveInfinity;
                    for (int northOffset = -1; northOffset <= 1; northOffset++) {
                        int adjacentNorth = north + northOffset;
                        if (adjacentNorth < 0 || adjacentNorth >= sampleCount) continue;
                        for (int eastOffset = -1; eastOffset <= 1; eastOffset++) {
                            if (eastOffset == 0 && northOffset == 0) continue;
                            int adjacentEast = east + eastOffset;
                            if (adjacentEast < 0 || adjacentEast >= sampleCount) continue;
                            int adjacent = adjacentNorth * sampleCount + adjacentEast;
                            if (resolved[adjacent] != 0) {
                                bankHeight = Mathf.Min(bankHeight, reconstructed[adjacent]);
                            }
                        }
                    }
                    if (!float.IsNaN(bankHeight) && !float.IsInfinity(bankHeight)) {
                        updates.Add(new HeightUpdate(index, bankHeight));
                    }
                }
            }
            if (updates.Count == 0) break;
            foreach (HeightUpdate update in updates) {
                reconstructed[update.Index] = update.HeightM;
                resolved[update.Index] = 1;
            }
        }
        return reconstructed;
    }

    static Vector3[] SmoothedWebNormals(float[] heights, byte[] water, int sampleCount) {
        var smoothed = new float[heights.Length];
        for (int north = 0; north < sampleCount; north++) {
            for (int east = 0; east < sampleCount; east++) {
                double weightedHeight = 0;
                double totalWeight = 0;
                for (int northOffset = -2; northOffset <= 2; northOffset++) {
                    int adjacentNorth = Mathf.Clamp(north + northOffset, 0, sampleCount - 1);
                    for (int eastOffset = -2; eastOffset <= 2; eastOffset++) {
                        int adjacentEast = Mathf.Clamp(east + eastOffset, 0, sampleCount - 1);
                        double weight = 1.0 / (1 + Math.Abs(eastOffset) + Math.Abs(northOffset));
                        weightedHeight += heights[adjacentNorth * sampleCount + adjacentEast]
                            * weight;
                        totalWeight += weight;
                    }
                }
                smoothed[north * sampleCount + east] = (float)(weightedHeight / totalWeight);
            }
        }
        var normals = new Vector3[heights.Length];
        for (int north = 0; north < sampleCount; north++) {
            int south = Mathf.Max(0, north - 1);
            int northNeighbour = Mathf.Min(sampleCount - 1, north + 1);
            for (int east = 0; east < sampleCount; east++) {
                int index = north * sampleCount + east;
                if (water[index] != 0) {
                    normals[index] = Vector3.up;
                    continue;
                }
                int west = Mathf.Max(0, east - 1);
                int eastNeighbour = Mathf.Min(sampleCount - 1, east + 1);
                float eastSlope = (
                    smoothed[north * sampleCount + eastNeighbour]
                    - smoothed[north * sampleCount + west])
                    / Mathf.Max(ExactTerrainSpacingM,
                        (eastNeighbour - west) * ExactTerrainSpacingM);
                float northSlope = (
                    smoothed[northNeighbour * sampleCount + east]
                    - smoothed[south * sampleCount + east])
                    / Mathf.Max(ExactTerrainSpacingM,
                        (northNeighbour - south) * ExactTerrainSpacingM);
                normals[index] = new Vector3(-eastSlope, 1f, northSlope).normalized;
            }
        }
        return normals;
    }

    static float[] WebConcavity(float[] heights, int sampleCount, int ringSamples) {
        var values = new float[heights.Length];
        for (int north = 0; north < sampleCount; north++) {
            for (int east = 0; east < sampleCount; east++) {
                int index = north * sampleCount + east;
                float total = 0f;
                int count = 0;
                for (int northStep = -1; northStep <= 1; northStep++) {
                    for (int eastStep = -1; eastStep <= 1; eastStep++) {
                        if (northStep == 0 && eastStep == 0) continue;
                        int sampleNorth = Mathf.Clamp(
                            north + northStep * ringSamples, 0, sampleCount - 1);
                        int sampleEast = Mathf.Clamp(
                            east + eastStep * ringSamples, 0, sampleCount - 1);
                        total += heights[sampleNorth * sampleCount + sampleEast];
                        count++;
                    }
                }
                float relative = heights[index] - total / count;
                float raw = Mathf.Clamp01(relative / 120f * 0.5f + 0.5f);
                int edgeDistance = Mathf.Min(
                    east, north, sampleCount - 1 - east, sampleCount - 1 - north);
                float edgeFade = Mathf.Min(1f, edgeDistance / (float)ringSamples);
                values[index] = 0.5f + (raw - 0.5f) * edgeFade;
            }
        }
        return values;
    }

    static Color32 WebLandcoverColor(
        float eastM,
        float northM,
        float spacingM,
        float concavity,
        bool water) {
        float macroEast = (float)ValueNoise1d(eastM, 1800.0, 0x51a72d39, 0x19b5);
        float macroNorth = (float)ValueNoise1d(northM, 1800.0 * 1.17,
            0x51a72d39, 0x63d1);
        float mesoEast = (float)ValueNoise1d(eastM, 360.0, 0x2e6d8b17, 0x37a9);
        float mesoNorth = (float)ValueNoise1d(northM, 360.0 * 1.31,
            0x2e6d8b17, 0x71c3);
        double macro = ClampUnit(
            macroEast * 0.46
            + macroNorth * 0.34
            + (1 - Math.Abs(macroEast - macroNorth)) * 0.20);
        double meso = ClampUnit(
            mesoEast * 0.48
            + mesoNorth * 0.34
            + mesoEast * mesoNorth * 0.18);
        byte succession = RoundByte(ClampUnit(macro * 0.68 + meso * 0.32));

        double fieldAcross = eastM * 0.894427 + northM * 0.447214
            + (macro - 0.5) * 280;
        double fieldAlong = -eastM * 0.447214 + northM * 0.894427
            + (meso - 0.5) * 220;
        double parcelEast = Math.Floor(fieldAcross / 420);
        double parcelNorth = Math.Floor(fieldAlong / 820);
        double parcelTone = Fraction(
            parcelEast * 0.754877666 + parcelNorth * 0.569840296);
        double detailWeight = ClampUnit((192 - spacingM) / 128.0);
        double stripTone = 1 - Math.Abs(Fraction(fieldAcross / 180) * 2 - 1);
        double trackDistanceM = Math.Abs(Fraction(fieldAlong / 1000) - 0.5) * 1000;
        double trackBlend = ClampUnit((trackDistanceM - 14) / 46);
        double track = (1 - SmoothUnit(trackBlend)) * detailWeight;
        double fieldTone = ClampUnit(
            0.08 + (parcelTone * 0.45 + stripTone * 0.55 * detailWeight) * 0.86);
        byte history = RoundByte(fieldTone + (0.015 - fieldTone) * track);
        return new Color32(
            succession,
            history,
            RoundByte(Mathf.Clamp01(concavity)),
            water ? (byte)255 : (byte)0);
    }

    static double ValueNoise1d(double positionM, double cellM, int seed, int axisSalt) {
        double position = positionM / cellM;
        int cell = checked((int)Math.Floor(position));
        double blend = SmoothUnit(position - cell);
        double start = LatticeHash(cell, axisSalt, seed);
        double end = LatticeHash(cell + 1, axisSalt, seed);
        return start + (end - start) * blend;
    }

    static double LatticeHash(int east, int north, int seed) {
        int hash = unchecked(east * 0x1f123bb5)
            ^ unchecked(north * 0x5f356495)
            ^ seed;
        hash = unchecked((hash ^ (int)((uint)hash >> 15)) * 0x2c1b3c6d);
        hash = unchecked((hash ^ (int)((uint)hash >> 12)) * 0x297a2d39);
        uint result = (uint)(hash ^ (int)((uint)hash >> 15));
        return result / 4294967295.0;
    }

    static double Fraction(double value) => value - Math.Floor(value);
    static double ClampUnit(double value) => Math.Min(1, Math.Max(0, value));
    static double SmoothUnit(double value) => value * value * (3 - 2 * value);
    static float SmoothUnit(float value) => value * value * (3f - 2f * value);
    static byte RoundByte(double value) =>
        (byte)Mathf.Clamp((int)Math.Floor(ClampUnit(value) * 255 + 0.5), 0, 255);

    static Vector3 SourcePosition(float[] sourceM) {
        if (sourceM == null || sourceM.Length != 3) {
            throw new InvalidDataException("Source position must be east/up/north.");
        }
        return new Vector3(sourceM[0], sourceM[1], -sourceM[2]);
    }

    static Color LinearColor(float[] rgb) {
        if (rgb == null || rgb.Length != 3) {
            throw new InvalidDataException("Linear RGB must contain three channels.");
        }
        return new Color(rgb[0], rgb[1], rgb[2], 1f);
    }

    static Vector3 TransformWeb(
        Vector3 value,
        Vector3 scale,
        float yaw,
        Vector3 position) {
        value.Scale(scale);
        float cosine = Mathf.Cos(yaw);
        float sine = Mathf.Sin(yaw);
        return position + new Vector3(
            cosine * value.x + sine * value.z,
            value.y,
            -sine * value.x + cosine * value.z);
    }

    static Vector4 ToVector(LinearRgb value) => new(value.R, value.G, value.B, 1f);

    readonly struct HeightUpdate {
        public readonly int Index;
        public readonly float HeightM;
        public HeightUpdate(int index, float heightM) {
            Index = index;
            HeightM = heightM;
        }
    }

    sealed class TerrainTruth {
        readonly short[] _samples;
        public readonly int Width;
        public readonly int Height;
        public readonly float SpacingM;
        public readonly float OriginEastM;
        public readonly float OriginNorthM;
        public readonly float MetresPerUnit;
        public readonly short WaterSentinel;

        TerrainTruth(
            int width,
            int height,
            float spacingM,
            float originEastM,
            float originNorthM,
            float metresPerUnit,
            short waterSentinel,
            short[] samples) {
            Width = width;
            Height = height;
            SpacingM = spacingM;
            OriginEastM = originEastM;
            OriginNorthM = originNorthM;
            MetresPerUnit = metresPerUnit;
            WaterSentinel = waterSentinel;
            _samples = samples;
        }

        public static TerrainTruth Decode(byte[] bytes) {
            if (bytes == null) throw new ArgumentNullException(nameof(bytes));
            using var stream = new MemoryStream(bytes, writable: false);
            using var reader = new BinaryReader(stream);
            byte[] magic = reader.ReadBytes(8);
            byte[] expected = { 0x47, 0x4f, 0x4b, 0x54, 0x52, 0x4e, 0x31, 0x00 };
            if (magic.Length != expected.Length) {
                throw new InvalidDataException("F-22 terrain truth magic is truncated.");
            }
            for (int index = 0; index < expected.Length; index++) {
                if (magic[index] != expected[index]) {
                    throw new InvalidDataException("F-22 terrain truth magic changed.");
                }
            }
            uint version = reader.ReadUInt32();
            int width = checked((int)reader.ReadUInt32());
            int height = checked((int)reader.ReadUInt32());
            double spacingM = reader.ReadDouble();
            double originEastM = reader.ReadDouble();
            double originNorthM = reader.ReadDouble();
            double metresPerUnit = reader.ReadDouble();
            short waterSentinel = reader.ReadInt16();
            reader.ReadBytes(10);
            long expectedLength = 64L + (long)width * height * sizeof(short);
            if (version != 1
                || width != ExactTerrainSampleCount
                || height != ExactTerrainSampleCount
                || Math.Abs(spacingM - ExactTerrainSpacingM) > 0.000001
                || Math.Abs(originEastM + DetailHalfSpanM) > 0.000001
                || Math.Abs(originNorthM + DetailHalfSpanM) > 0.000001
                || Math.Abs(metresPerUnit - 0.1) > 0.000001
                || stream.Length != expectedLength) {
                throw new InvalidDataException("F-22 terrain truth header changed.");
            }
            var samples = new short[checked(width * height)];
            for (int index = 0; index < samples.Length; index++) {
                samples[index] = reader.ReadInt16();
            }
            return new TerrainTruth(
                width, height, (float)spacingM, (float)originEastM,
                (float)originNorthM, (float)metresPerUnit, waterSentinel, samples);
        }

        public short Raw(int east, int north) => _samples[north * Width + east];

        public float SampleHeight(float eastM, float northM) {
            float eastGrid = Mathf.Clamp((eastM - OriginEastM) / SpacingM, 0f, Width - 1);
            float northGrid = Mathf.Clamp((northM - OriginNorthM) / SpacingM, 0f, Height - 1);
            int eastCell = Mathf.Min(Width - 2, Mathf.FloorToInt(eastGrid));
            int northCell = Mathf.Min(Height - 2, Mathf.FloorToInt(northGrid));
            float eastFraction = eastGrid - eastCell;
            float northFraction = northGrid - northCell;
            float south = Mathf.Lerp(HeightAt(eastCell, northCell),
                HeightAt(eastCell + 1, northCell), eastFraction);
            float north = Mathf.Lerp(HeightAt(eastCell, northCell + 1),
                HeightAt(eastCell + 1, northCell + 1), eastFraction);
            return Mathf.Lerp(south, north, northFraction);
        }

        float HeightAt(int east, int north) {
            short value = Raw(east, north);
            return value == WaterSentinel ? 0f : value * MetresPerUnit;
        }
    }

    sealed class MeshAccumulator {
        public readonly List<Vector3> Vertices;
        public readonly List<Vector2> Uvs;
        public readonly List<Color> Colors;
        public readonly List<int> Indices;

        public MeshAccumulator(int vertexCapacity) {
            Vertices = new List<Vector3>(Mathf.Max(0, vertexCapacity));
            Uvs = new List<Vector2>(Mathf.Max(0, vertexCapacity));
            Colors = new List<Color>(Mathf.Max(0, vertexCapacity));
            Indices = new List<int>(Mathf.Max(0, vertexCapacity * 3 / 2));
        }

        public void AddColors(Color color, int count) {
            for (int index = 0; index < count; index++) Colors.Add(color);
        }

        public void AddBox(
            Vector3 centre,
            Quaternion rotation,
            Vector3 size,
            Color color) {
            Vector3[] corners = {
                new(-0.5f, -0.5f, -0.5f), new(0.5f, -0.5f, -0.5f),
                new(0.5f, 0.5f, -0.5f), new(-0.5f, 0.5f, -0.5f),
                new(-0.5f, -0.5f, 0.5f), new(0.5f, -0.5f, 0.5f),
                new(0.5f, 0.5f, 0.5f), new(-0.5f, 0.5f, 0.5f),
            };
            int[,] faces = {
                { 0, 3, 2, 1 }, { 4, 5, 6, 7 },
                { 0, 4, 7, 3 }, { 1, 2, 6, 5 },
                { 3, 7, 6, 2 }, { 0, 1, 5, 4 },
            };
            Matrix4x4 matrix = Matrix4x4.TRS(centre, rotation, size);
            for (int face = 0; face < 6; face++) {
                int start = Vertices.Count;
                for (int corner = 0; corner < 4; corner++) {
                    Vertices.Add(matrix.MultiplyPoint3x4(corners[faces[face, corner]]));
                    Uvs.Add(Vector2.zero);
                    Colors.Add(color);
                }
                Indices.Add(start);
                Indices.Add(start + 1);
                Indices.Add(start + 2);
                Indices.Add(start);
                Indices.Add(start + 2);
                Indices.Add(start + 3);
            }
        }

        public void AddPyramid(
            Vector3 baseCentre,
            Quaternion rotation,
            float widthM,
            float depthM,
            float heightM,
            Color color) {
            // Three ConeGeometry(0.72, 1, 4) rotated 45 degrees has an axis-aligned square whose
            // half span is 0.72/sqrt(2), matching the exported Web primitive exactly.
            const float halfSpan = 0.5091169f;
            Vector3[] local = {
                new(-halfSpan * widthM, 0, -halfSpan * depthM),
                new(halfSpan * widthM, 0, -halfSpan * depthM),
                new(halfSpan * widthM, 0, halfSpan * depthM),
                new(-halfSpan * widthM, 0, halfSpan * depthM),
                new(0, heightM, 0),
            };
            int[,] triangles = {
                { 0, 4, 1 }, { 1, 4, 2 }, { 2, 4, 3 }, { 3, 4, 0 },
                { 0, 1, 2 }, { 0, 2, 3 },
            };
            for (int triangle = 0; triangle < 6; triangle++) {
                int start = Vertices.Count;
                for (int point = 0; point < 3; point++) {
                    Vertices.Add(baseCentre + rotation * local[triangles[triangle, point]]);
                    Uvs.Add(Vector2.zero);
                    Colors.Add(color);
                }
                Indices.Add(start);
                Indices.Add(start + 1);
                Indices.Add(start + 2);
            }
        }

        public void AddSegmentBox(
            Vector3 from,
            Vector3 to,
            float widthM,
            float heightM,
            float yOffsetM,
            Color color) {
            Vector3 direction = to - from;
            float lengthM = direction.magnitude;
            if (!(lengthM > 0.001f)) return;
            Quaternion rotation = Quaternion.FromToRotation(Vector3.forward, direction / lengthM);
            AddBox(
                (from + to) * 0.5f + Vector3.up * yOffsetM,
                rotation,
                new Vector3(widthM, heightM, lengthM),
                color);
        }

        public Mesh ToMesh(string name) {
            if (Vertices.Count == 0 || Indices.Count == 0) {
                throw new InvalidDataException(name + " has no geometry.");
            }
            var mesh = new Mesh {
                name = name,
                indexFormat = Vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16,
            };
            mesh.SetVertices(Vertices);
            mesh.SetUVs(0, Uvs);
            mesh.SetColors(Colors);
            mesh.SetTriangles(Indices, 0, true);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }
    }

    [Serializable]
    sealed class WorldContract {
        public string presentationId;
        public ContractTerrain terrain;
        public ContractFoliageAtlas foliageAtlas;
        public ContractGeometry geometry;
        public ContractMaterials materials;
        public ContractCounts counts;
        public ContractChunk[] chunks;
    }

    [Serializable]
    sealed class ContractTerrain { public string sha256; }

    [Serializable]
    sealed class ContractFoliageAtlas {
        public string sha256;
        public float alphaCutoff;
        public FoliageRole[] roles;
    }

    [Serializable]
    sealed class FoliageRole {
        public string id;
        public float centreX;
        public float centreZ;
        public float width;
        public float height;
        public float yawRad;
        public float[] region;
    }

    [Serializable]
    sealed class ContractGeometry { public BuildingLayout[] buildingCompoundLayout; }

    [Serializable]
    sealed class BuildingLayout {
        public float x;
        public float z;
        public float width;
        public float depth;
        public float height;
    }

    [Serializable]
    sealed class ContractMaterials {
        public float[] roadLinearRgb;
        public float[] roadMarkingLinearRgb;
        public float[] railBedLinearRgb;
        public float[] railLinearRgb;
        public float[] runwayLinearRgb;
        public float[] powerPoleLinearRgb;
        public float[] powerWireLinearRgb;
    }

    [Serializable]
    sealed class ContractCounts {
        public int chunks;
        public int trees;
        public int buildings;
        public int roadSegments;
        public int railSegments;
        public int runwaySegments;
        public int powerPoles;
        public int powerLines;
    }

    [Serializable]
    sealed class ContractChunk {
        public string chunkId;
        public SourceRecord sourceRecord;
        public TreePlacement[] trees;
        public BuildingPlacement[] buildings;
        public SegmentPlacement[] roads;
        public SegmentPlacement[] railSegments;
        public SegmentPlacement[] runways;
        public PowerPolePlacement[] powerPoles;
        public SegmentPlacement[] powerLines;
    }

    [Serializable]
    sealed class SourceRecord {
        public int level;
        public float spacingM;
        public int sampleCount;
        public string sha256;
    }

    [Serializable]
    sealed class TreePlacement {
        public float[] positionSourceM;
        public float yawRad;
        public float heightM;
        public float widthScale;
        public string kind;
        public int crownVariant;
        public float[] tintLinearRgb;
    }

    [Serializable]
    sealed class BuildingPlacement {
        public float[] positionSourceM;
        public float yawRad;
        public float widthM;
        public float depthM;
        public float heightM;
        public bool highRise;
        public string kind;
        public int colorVariant;
        public float[] wallLinearRgb;
        public float[] roofLinearRgb;
    }

    [Serializable]
    sealed class SegmentPlacement {
        public float[] fromSourceM;
        public float[] toSourceM;
        public float widthM;
    }

    [Serializable]
    sealed class PowerPolePlacement {
        public float[] positionSourceM;
        public float heightM;
    }
}

}
