using System.Collections.Generic;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Native renderer for the same Build 299 Cobra Canyon scene used by the Web app.
/// Presentation changes live behind the shared authority sample and portable visual contract.
/// </summary>
public static class VietnamTerrainStandIn {
    static readonly Vector3[] River = CobraTerrainModel.River;
    static readonly Vector3[] Road = CobraTerrainModel.Road;
    static readonly Vector3[] Ridge = CobraTerrainModel.Ridge;

    const float HalfExtent = 8000f;
    // Exact Build 299 world.json terrain ribbons.
    const float RiverHalfWidth = CobraTerrainModel.RiverHalfWidthM;
    const float RiverBlend = CobraTerrainModel.RiverBlendWidthM;
    const float RiverBankRise = CobraTerrainModel.RiverBankRiseM;
    const float RidgeHalfWidth = 205f;
    const float RidgeBlend = 430f;
    const float RidgeBankRise = 54f;
    const float RoadBenchHalfWidth = 235f;
    const float RoadBenchBlend = 470f;
    const float RoadBankRise = 24f;
    const float WaterHalfWidth = CobraTerrainModel.RiverPresentationWidthM * 0.5f;
    const float RoadHalfWidth = 14f; // painted road ribbon, not the terrain bench

    // presentation.js river role: color 0x3a8a92, emissive 0x0a343c — unlit Mac player
    // needs the emissive baked into albedo or the ribbon reads neon swimming-pool cyan.
    static readonly Color RiverDeep = Color.Lerp(
        new(0x3a / 255f, 0x8a / 255f, 0x92 / 255f, 1f),
        new(0x0a / 255f, 0x34 / 255f, 0x3c / 255f, 1f),
        0.68f);
    static readonly Color RiverShallow = Color.Lerp(
        new(0x5a / 255f, 0xaa / 255f, 0xb0 / 255f, 1f),
        new(0x0a / 255f, 0x34 / 255f, 0x3c / 255f, 1f),
        0.50f);
    // Hotter terracotta so the road cuts the mud floor at range.
    // Presentation roles: roads 0xb0683c, bridge-deck 0xd46a48, bridge-pier 0xb85a3c
    static readonly Color RoadColor = new(0xb0 / 255f, 0x68 / 255f, 0x3c / 255f);
    static readonly Color BridgeDeck = new(0xd4 / 255f, 0x6a / 255f, 0x48 / 255f);
    static readonly Color BridgePier = new(0xb8 / 255f, 0x5a / 255f, 0x3c / 255f);
    static readonly Color Karst = new(0x8a / 255f, 0x84 / 255f, 0x74 / 255f);
    static readonly Color Pagoda = new(0xd8 / 255f, 0xd2 / 255f, 0xc4 / 255f);

    public static void Build(Transform parent) {
        var root = new GameObject("VietnamTerrainStandIn").transform;
        root.SetParent(parent, false);

        BuildBasin(root, new List<Vector2>());
        CobraRiverMeshManifest.Build(root);
        // Remaining six core submissions are byte-gated exports of the Web scene. Do not
        // substitute Unity-authored roads, scars, landmarks, hazards or bridge silhouettes.
        CobraCoreKitManifest.Build(root);
        // All seven ambient/set-piece roles use the exact Web planner output and transforms.
        CobraAssetKitManifest.Build(root);
    }

    static void BuildBasin(Transform root, List<Vector2> treeSites) {
        _ = treeSites; // Placement is rendered separately; terrain shading is the Web material.
        int segments = CobraTerrainModel.DesktopSegments;
        int columns = segments + 1;
        float eastStepM = (CobraTerrainModel.MaximumEastM - CobraTerrainModel.MinimumEastM)
            / segments;
        float northStepM = (CobraTerrainModel.MaximumNorthM - CobraTerrainModel.MinimumNorthM)
            / segments;
        var heights = new float[columns * columns];
        var vertices = new Vector3[columns * columns];
        var normals = new Vector3[columns * columns];
        var concavityUv = new Vector2[columns * columns];
        var indices = new int[segments * segments * 6];

        for (int northIndex = 0; northIndex <= segments; northIndex++) {
            float northM = CobraTerrainModel.MinimumNorthM + northIndex * northStepM;
            for (int eastIndex = 0; eastIndex <= segments; eastIndex++) {
                float eastM = CobraTerrainModel.MinimumEastM + eastIndex * eastStepM;
                int index = northIndex * columns + eastIndex;
                float elevationM = CobraTerrainModel.RenderedVertexHeight(
                    eastM, northM, eastStepM, northStepM);
                heights[index] = elevationM;
                vertices[index] = CobraTerrainModel.AuthorityToUnity(eastM, elevationM, northM);
            }
        }

        float HeightAt(int eastIndex, int northIndex) => heights[
            Mathf.Clamp(northIndex, 0, segments) * columns
            + Mathf.Clamp(eastIndex, 0, segments)];
        for (int northIndex = 0; northIndex <= segments; northIndex++) {
            for (int eastIndex = 0; eastIndex <= segments; eastIndex++) {
                int index = northIndex * columns + eastIndex;
                int eastBefore = Mathf.Max(0, eastIndex - 1);
                int eastAfter = Mathf.Min(segments, eastIndex + 1);
                int northBefore = Mathf.Max(0, northIndex - 1);
                int northAfter = Mathf.Min(segments, northIndex + 1);
                float slopeEast = (HeightAt(eastAfter, northIndex) - HeightAt(eastBefore, northIndex))
                    / Mathf.Max(eastStepM, (eastAfter - eastBefore) * eastStepM);
                float slopeNorth = (HeightAt(eastIndex, northAfter) - HeightAt(eastIndex, northBefore))
                    / Mathf.Max(northStepM, (northAfter - northBefore) * northStepM);
                normals[index] = new Vector3(-slopeEast, 1f, slopeNorth).normalized;
                float ringMeanM = (
                    HeightAt(eastIndex - 2, northIndex)
                    + HeightAt(eastIndex + 2, northIndex)
                    + HeightAt(eastIndex, northIndex - 2)
                    + HeightAt(eastIndex, northIndex + 2)) * 0.25f;
                float concavity = Mathf.Clamp01(
                    0.5f + (heights[index] - ringMeanM) / (2f * 26f));
                concavityUv[index] = new Vector2(concavity, 0f);
            }
        }

        int triangleIndex = 0;
        for (int northIndex = 0; northIndex < segments; northIndex++) {
            for (int eastIndex = 0; eastIndex < segments; eastIndex++) {
                int northWest = northIndex * columns + eastIndex;
                int northEast = northWest + 1;
                int southWest = northWest + columns;
                int southEast = southWest + 1;
                indices[triangleIndex++] = northWest;
                indices[triangleIndex++] = northEast;
                indices[triangleIndex++] = southEast;
                indices[triangleIndex++] = northWest;
                indices[triangleIndex++] = southEast;
                indices[triangleIndex++] = southWest;
            }
        }

        var mesh = new Mesh {
            name = "COBRA_CANYON_BASIN_GEOMETRY",
            indexFormat = UnityEngine.Rendering.IndexFormat.UInt32,
            vertices = vertices,
            normals = normals,
            triangles = indices,
        };
        mesh.uv2 = concavityUv;
        mesh.RecalculateBounds();

        var groundTexture = Resources.Load<Texture2D>(
            "GunsOnly/CobraVietnam/environment/textures/cobra-ground-macro-painted-v1");
        if (groundTexture == null) {
            throw new System.InvalidOperationException("Missing Cobra Canyon ground macro texture.");
        }
        var go = new GameObject("Basin");
        go.transform.SetParent(root, false);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var renderer = go.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = GunsOnlyMats.Terrain(groundTexture);
        renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        renderer.receiveShadows = false;
    }

    static void BuildRiver(Transform root) {
        // Exact Build 299 centreline resampling, deterministic harmonic meander and width field.
        const float spacingM = 85f;
        var resampled = new List<Vector3>(256);
        var distances = new List<float>(256);
        float travelledM = 0f;
        for (int pathIndex = 0; pathIndex < River.Length - 1; pathIndex++) {
            Vector3 from = River[pathIndex];
            Vector3 to = River[pathIndex + 1];
            float spanM = Vector2.Distance(new Vector2(from.x, from.z), new Vector2(to.x, to.z));
            if (spanM < 1e-3f) continue;
            int steps = Mathf.Max(1, Mathf.RoundToInt(spanM / spacingM));
            for (int step = 0; step < steps; step++) {
                float blend = step / (float)steps;
                resampled.Add(Vector3.Lerp(from, to, blend));
                distances.Add(travelledM + spanM * blend);
            }
            travelledM += spanM;
        }
        resampled.Add(River[River.Length - 1]);
        distances.Add(travelledM);

        int count = resampled.Count;
        var course = new Vector3[count];
        var widths = new float[count];
        float maximumOffsetM = CobraTerrainModel.RiverHalfWidthM
            * CobraTerrainModel.RiverFloorFraction
            - CobraTerrainModel.RiverPresentationWidthM * 1.30f * 0.5f;
        for (int index = 0; index < count; index++) {
            float distanceM = distances[index];
            float envelope = 0.46f + 0.54f * (0.5f + 0.5f * Mathf.Sin(distanceM / 2050f - 0.45f));
            float wander = Mathf.Sin(distanceM / 430f + 0.60f) * 0.62f
                + Mathf.Sin(distanceM / 270f + 2.40f) * 0.38f;
            float offsetM = Mathf.Clamp(wander * envelope, -1f, 1f) * maximumOffsetM;
            widths[index] = CobraTerrainModel.RiverPresentationWidthM
                * (1.30f - 0.48f * Mathf.Abs(wander));
            Vector3 previous = resampled[Mathf.Max(0, index - 1)];
            Vector3 next = resampled[Mathf.Min(count - 1, index + 1)];
            float tangentEast = next.x - previous.x;
            float tangentNorth = next.z - previous.z;
            float tangentLength = Mathf.Max(1e-3f, Mathf.Sqrt(
                tangentEast * tangentEast + tangentNorth * tangentNorth));
            float taper = Mathf.Clamp01(Mathf.Min(index, count - 1 - index) / 1.2f);
            offsetM *= taper;
            Vector3 point = resampled[index];
            course[index] = new Vector3(
                point.x + (tangentNorth / tangentLength) * offsetM,
                point.y,
                point.z + (-tangentEast / tangentLength) * offsetM);
        }

        var segmentNormals = new Vector2[count - 1];
        for (int index = 0; index < count - 1; index++) {
            float deltaEast = course[index + 1].x - course[index].x;
            float deltaNorth = course[index + 1].z - course[index].z;
            float lengthM = Mathf.Max(0.001f, Mathf.Sqrt(
                deltaEast * deltaEast + deltaNorth * deltaNorth));
            segmentNormals[index] = new Vector2(-deltaNorth / lengthM, deltaEast / lengthM);
        }
        var left = new Vector2[count];
        var right = new Vector2[count];
        for (int index = 0; index < count; index++) {
            Vector2 previous = segmentNormals[Mathf.Max(0, index - 1)];
            Vector2 next = segmentNormals[Mathf.Min(segmentNormals.Length - 1, index)];
            Vector2 miter = previous + next;
            if (miter.sqrMagnitude < 1e-6f) miter = next;
            miter.Normalize();
            float alignment = Mathf.Max(0.5f, Vector2.Dot(miter, next));
            float halfWidthM = Mathf.Max(0.05f, widths[index] * 0.5f);
            float distanceM = Mathf.Min(halfWidthM * 2f, halfWidthM / alignment);
            Vector2 centre = new(course[index].x, course[index].z);
            left[index] = centre + miter * distanceM;
            right[index] = centre - miter * distanceM;
        }

        int segmentCount = count - 1;
        var vertices = new Vector3[segmentCount * 4];
        var riverFrames = new List<Vector4>(segmentCount * 4);
        var indices = new int[segmentCount * 6];
        for (int segment = 0; segment < segmentCount; segment++) {
            int vertex = segment * 4;
            Vector2[] corners = { left[segment], right[segment], right[segment + 1], left[segment + 1] };
            for (int corner = 0; corner < 4; corner++) {
                float height = CobraTerrainModel.RenderedSurfaceHeight(corners[corner].x, corners[corner].y)
                    + 0.35f;
                vertices[vertex + corner] = CobraTerrainModel.AuthorityToUnity(
                    corners[corner].x, height, corners[corner].y);
            }
            float tangentEast = course[segment + 1].x - course[segment].x;
            float tangentNorth = course[segment + 1].z - course[segment].z;
            float lengthM = Mathf.Max(0.001f, Mathf.Sqrt(
                tangentEast * tangentEast + tangentNorth * tangentNorth));
            float segmentWidthM = widths[segment] * 0.5f + widths[segment + 1] * 0.5f;
            float halfWaterM = Mathf.Max(
                24f,
                segmentWidthM - 2f * CobraTerrainModel.RiverBankPresentationWidthM) * 0.5f;
            float scale = 1f / (lengthM * Mathf.Max(1f, halfWaterM));
            var frame = new Vector4(
                course[segment].x,
                course[segment].z,
                -tangentNorth * scale,
                tangentEast * scale);
            for (int corner = 0; corner < 4; corner++) riverFrames.Add(frame);
            int triangle = segment * 6;
            indices[triangle] = vertex;
            indices[triangle + 1] = vertex + 1;
            indices[triangle + 2] = vertex + 2;
            indices[triangle + 3] = vertex;
            indices[triangle + 4] = vertex + 2;
            indices[triangle + 5] = vertex + 3;
        }

        var mesh = new Mesh {
            name = "COBRA_CANYON_RIVER_GEOMETRY",
            indexFormat = UnityEngine.Rendering.IndexFormat.UInt32,
            vertices = vertices,
            triangles = indices,
        };
        mesh.SetUVs(1, riverFrames);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        var groundTexture = Resources.Load<Texture2D>(
            "GunsOnly/CobraVietnam/environment/textures/cobra-ground-macro-painted-v1");
        var body = new GameObject("River");
        body.transform.SetParent(root, false);
        body.AddComponent<MeshFilter>().sharedMesh = mesh;
        var renderer = body.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = GunsOnlyMats.River(groundTexture);
        renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        renderer.receiveShadows = false;
    }

    /// <summary>Dark wet-mud banks so the teal ribbon has an edge against the basin.</summary>
    static void BuildRiverBanks(Transform root) {
        const int segs = 180;
        const float bankHalf = 26f;
        var centres = new Vector3[segs];
        var tangents = new Vector3[segs];
        for (int s = 0; s < segs; s++) {
            SamplePathSmooth(River, s / (float)(segs - 1), out centres[s], out tangents[s]);
        }
        Vector3 prevRight = Vector3.right;
        var rights = new Vector3[segs];
        for (int s = 0; s < segs; s++) {
            Vector3 right = Vector3.Cross(Vector3.up, tangents[s]);
            if (right.sqrMagnitude < 1e-8f) right = prevRight;
            right.Normalize();
            if (Vector3.Dot(right, prevRight) < 0f) right = -right;
            rights[s] = right;
            prevRight = right;
        }

        var mat = new Material(Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color"));
        mat.color = new Color(0.14f, 0.20f, 0.12f, 1f);
        foreach (float side in new[] { -1f, 1f }) {
            var verts = new Vector3[segs * 2];
            var tris = new int[(segs - 1) * 6];
            float outer = WaterHalfWidth + bankHalf;
            float inner = WaterHalfWidth - 1f;
            for (int s = 0; s < segs; s++) {
                verts[s * 2] = centres[s] + rights[s] * (side * inner) + Vector3.up * 2.0f;
                verts[s * 2 + 1] = centres[s] + rights[s] * (side * outer) + Vector3.up * 2.4f;
            }
            int ti = 0;
            for (int s = 0; s < segs - 1; s++) {
                int i = s * 2;
                tris[ti++] = i;
                tris[ti++] = i + 2;
                tris[ti++] = i + 1;
                tris[ti++] = i + 1;
                tris[ti++] = i + 2;
                tris[ti++] = i + 3;
            }
            var mesh = new Mesh { name = side < 0 ? "BankL" : "BankR" };
            mesh.vertices = verts;
            mesh.triangles = tris;
            mesh.RecalculateNormals();
            var go = new GameObject(mesh.name);
            go.transform.SetParent(root, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }

    static void SamplePathSmooth(Vector3[] path, float t, out Vector3 unityPos, out Vector3 unityTangent) {
        float total = 0f;
        var lengths = new float[path.Length - 1];
        for (int i = 0; i < path.Length - 1; i++) {
            lengths[i] = Vector3.Distance(
                new Vector3(path[i].x, 0, path[i].z),
                new Vector3(path[i + 1].x, 0, path[i + 1].z));
            total += lengths[i];
        }
        float target = Mathf.Clamp01(t) * total;
        float acc = 0f;
        int seg = 0;
        for (; seg < lengths.Length; seg++) {
            if (acc + lengths[seg] >= target - 1e-4f) break;
            acc += lengths[seg];
        }
        seg = Mathf.Clamp(seg, 0, lengths.Length - 1);
        float localT = lengths[seg] <= 1e-6f ? 0f : (target - acc) / lengths[seg];
        int i0 = Mathf.Max(0, seg - 1);
        int i1 = seg;
        int i2 = Mathf.Min(path.Length - 1, seg + 1);
        int i3 = Mathf.Min(path.Length - 1, seg + 2);
        Vector3 p0 = path[i0], p1 = path[i1], p2 = path[i2], p3 = path[i3];
        float east = Catmull(p0.x, p1.x, p2.x, p3.x, localT);
        float north = Catmull(p0.z, p1.z, p2.z, p3.z, localT);
        float alt = Catmull(p0.y, p1.y, p2.y, p3.y, localT);
        Sample(east, north, out float h, out _);
        unityPos = new Vector3(east, Mathf.Max(alt, h) + 0.15f, -north);
        float east2 = Catmull(p0.x, p1.x, p2.x, p3.x, Mathf.Min(1f, localT + 0.02f));
        float north2 = Catmull(p0.z, p1.z, p2.z, p3.z, Mathf.Min(1f, localT + 0.02f));
        Vector3 te = new Vector3(east2 - east, 0f, -(north2 - north));
        unityTangent = te.sqrMagnitude > 1e-8f ? te.normalized : Vector3.forward;
    }

    static float Catmull(float p0, float p1, float p2, float p3, float t) {
        float t2 = t * t;
        float t3 = t2 * t;
        return 0.5f * ((2f * p1) + (-p0 + p2) * t
            + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
            + (-p0 + 3f * p1 - 3f * p2 + p3) * t3);
    }

    static void BuildRibbon(
        Transform root, string name, Vector3[] path, float halfWidth, Color color, float liftM,
        bool castShadows, float startT = 0f) {
        const int segs = 96;
        const int across = 5;
        var verts = new Vector3[segs * across];
        var tris = new int[(segs - 1) * (across - 1) * 6];

        for (int s = 0; s < segs; s++) {
            float t = Mathf.Lerp(startT, 1f, s / (float)(segs - 1));
            SamplePath(path, t, out Vector3 centre, out Vector3 tangent);
            Vector3 right = Vector3.Cross(Vector3.up, tangent).normalized;
            if (right.sqrMagnitude < 1e-6f) right = Vector3.right;
            for (int a = 0; a < across; a++) {
                float u = a / (float)(across - 1);
                float lateral = (u - 0.5f) * 2f * halfWidth;
                verts[s * across + a] = centre + right * lateral + Vector3.up * liftM;
            }
        }

        int ti = 0;
        for (int s = 0; s < segs - 1; s++) {
            for (int a = 0; a < across - 1; a++) {
                int i = s * across + a;
                tris[ti++] = i;
                tris[ti++] = i + across;
                tris[ti++] = i + 1;
                tris[ti++] = i + 1;
                tris[ti++] = i + across;
                tris[ti++] = i + across + 1;
            }
        }

        var mesh = new Mesh { name = name + "Ribbon" };
        mesh.vertices = verts;
        mesh.triangles = tris;
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        var go = new GameObject(name);
        go.transform.SetParent(root, false);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var mr = go.AddComponent<MeshRenderer>();
        // Roads role 0xb0683c + emissive 0x241008 — Unlit so the plantation cut survives fog.
        var roadMat = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        roadMat.color = Color.Lerp(color, new Color(0x24 / 255f, 0x10 / 255f, 0x08 / 255f), 0.35f);
        mr.sharedMaterial = roadMat;
        mr.shadowCastingMode = castShadows
            ? UnityEngine.Rendering.ShadowCastingMode.On
            : UnityEngine.Rendering.ShadowCastingMode.Off;
        mr.receiveShadows = false;
    }

    static void SamplePath(Vector3[] path, float t, out Vector3 unityPos, out Vector3 unityTangent) {
        float total = 0f;
        var lengths = new float[path.Length - 1];
        for (int i = 0; i < path.Length - 1; i++) {
            lengths[i] = Vector3.Distance(
                new Vector3(path[i].x, 0, path[i].z),
                new Vector3(path[i + 1].x, 0, path[i + 1].z));
            total += lengths[i];
        }
        float target = Mathf.Clamp01(t) * total;
        float acc = 0f;
        for (int i = 0; i < lengths.Length; i++) {
            if (acc + lengths[i] < target - 1e-4f) {
                acc += lengths[i];
                continue;
            }
            float localT = lengths[i] <= 1e-6f ? 0f : (target - acc) / lengths[i];
            Vector3 a = path[i];
            Vector3 b = path[i + 1];
            float east = Mathf.Lerp(a.x, b.x, localT);
            float north = Mathf.Lerp(a.z, b.z, localT);
            float alt = Mathf.Lerp(a.y, b.y, localT);
            Sample(east, north, out float h, out _);
            unityPos = new Vector3(east, Mathf.Max(alt, h), -north);
            Vector3 te = new Vector3(b.x - a.x, 0f, -(b.z - a.z));
            unityTangent = te.sqrMagnitude > 1e-6f ? te.normalized : Vector3.forward;
            return;
        }
        Vector3 last = path[path.Length - 1];
        unityPos = new Vector3(last.x, last.y, -last.z);
        unityTangent = Vector3.forward;
    }

    static void BuildLandmarks(Transform root) {
        var landmarks = new GameObject("Landmarks").transform;
        landmarks.SetParent(root, false);
        var deck = MakeLit(BridgeDeck, 0.35f);
        var pier = MakeLit(BridgePier, 0.22f);
        var tower = UnlitHex(0x8a8474);
        var karst = UnlitHex(0x8a8474);
        var pagoda = UnlitHex(0xd8d2c4);

        BuildIronBellTruss(landmarks, deck, pier);
        // Camp Ember pad — web ensureSite Cylinder(18)+14 m flag; Unlit friendly olive.
        var emberPad = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        emberPad.color = new Color(0x8f / 255f, 0xbf / 255f, 0x5a / 255f);
        PlaceBox(landmarks, "CampEmberPad", UnityOf(-6500f, 168f, -6200f),
            new Vector3(36f, 0.6f, 36f), emberPad);
        // Flag behind the pad (SW) so it never sits on the look-axis toward Iron Bell.
        PlaceBox(landmarks, "CampEmberFlag", UnityOf(-6560f, 176f, -6260f),
            new Vector3(1.2f, 14f, 1.2f), emberPad);
        // No FOB radio mast ahead of Camp Ember — previous beacon at (-6280,-5980) sat
        // on heading ~045 from the pad and painted a black stick down the gunsight.
        // Camp Ember silhouette is the pad plate; Iron Bell is the tip cue.
        // Long Fang Falls — wide white-water sheet (was a 6 m stick that read as a mast).
        var falls = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        falls.color = new Color(0xe8 / 255f, 0xf0 / 255f, 0xf4 / 255f);
        PlaceBox(landmarks, "LongFangFalls", UnityOf(-4450f, 210f, -3380f),
            new Vector3(42f, 58f, 14f), falls);
        PlaceBox(landmarks, "LongFangPool", UnityOf(-4450f, 168f, -3360f),
            new Vector3(36f, 3f, 28f), falls);
        // Split Tooth ridge gate — forked blades across the basin.
        var tooth = UnlitHex(0x6a6658);
        PlaceBox(landmarks, "SplitToothL", UnityOf(-4420f, 560f, 1530f),
            new Vector3(22f, 140f, 28f), tooth);
        PlaceBox(landmarks, "SplitToothR", UnityOf(-4340f, 540f, 1560f),
            new Vector3(20f, 120f, 26f), tooth);
        // Red Earth Quarry — rust cut into the plantation shoulder.
        var quarry = UnlitHex(0xb05a32);
        PlaceBox(landmarks, "RedEarthQuarry", UnityOf(2720f, 240f, -1740f),
            new Vector3(90f, 28f, 70f), quarry);
        // Plantation mill stack.
        var stack = UnlitHex(0x4a4640);
        PlaceBox(landmarks, "MillStack", UnityOf(4120f, 280f, -120f),
            new Vector3(10f, 90f, 10f), stack);
        PlaceBox(landmarks, "WaterTower", UnityOf(300f, 248f, -3920f),
            new Vector3(18f, 48f, 18f), tower);
        PlaceBox(landmarks, "WaterTowerTank", UnityOf(300f, 278f, -3920f),
            new Vector3(28f, 14f, 28f), tower);
        PlaceBox(landmarks, "KarstA", UnityOf(140f, 380f, 2880f), new Vector3(22f, 160f, 18f), karst);
        PlaceBox(landmarks, "KarstB", UnityOf(200f, 420f, 2920f), new Vector3(18f, 200f, 16f), karst);
        PlaceBox(landmarks, "KarstC", UnityOf(250f, 360f, 2840f), new Vector3(16f, 140f, 20f), karst);
        PlaceBox(landmarks, "WhitePagodaBase", UnityOf(-3500f, 520f, 3050f),
            new Vector3(28f, 18f, 28f), pagoda);
        PlaceBox(landmarks, "WhitePagodaTier", UnityOf(-3500f, 545f, 3050f),
            new Vector3(18f, 22f, 18f), pagoda);
        PlaceBox(landmarks, "WhitePagodaCap", UnityOf(-3500f, 568f, 3050f),
            new Vector3(10f, 16f, 10f), pagoda);
    }

    static void BuildIronBellTruss(Transform parent, Material deck, Material pier) {
        // Exact hazard AABBs from cobra-canyon.world.json + presentation bridge-deck/pier
        // hex (0xd46a48 / 0xb85a3c) with emissive baked into Unlit albedo.
        _ = deck; _ = pier;
        var deckMat = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        deckMat.color = Color.Lerp(
            new Color(0xd4 / 255f, 0x6a / 255f, 0x48 / 255f),
            new Color(0x3a / 255f, 0x10 / 255f, 0x06 / 255f),
            0.22f);
        var pierMat = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        pierMat.color = Color.Lerp(
            new Color(0xb8 / 255f, 0x5a / 255f, 0x3c / 255f),
            new Color(0x2c / 255f, 0x0c / 255f, 0x06 / 255f),
            0.18f);

        // hazard.iron-bell-deck: [-2775,142,-516]..[-2645,150,-484]
        PlaceBox(parent, "IronBellDeck", UnityOf(-2710f, 146f, -500f),
            new Vector3(130f, 8f, 32f), deckMat);
        // Light truss above deck — set-piece silhouette, not a cargo-cult billboard.
        PlaceBox(parent, "IronBellRailN", UnityOf(-2710f, 154f, -514f),
            new Vector3(130f, 3f, 2.5f), deckMat);
        PlaceBox(parent, "IronBellRailS", UnityOf(-2710f, 154f, -486f),
            new Vector3(130f, 3f, 2.5f), deckMat);
        PlaceBox(parent, "IronBellChordN", UnityOf(-2710f, 168f, -514f),
            new Vector3(130f, 3.5f, 3f), deckMat);
        PlaceBox(parent, "IronBellChordS", UnityOf(-2710f, 168f, -486f),
            new Vector3(130f, 3.5f, 3f), deckMat);
        for (int i = -3; i <= 3; i++) {
            float e = -2710f + i * 18f;
            PlaceBox(parent, $"IronBellPostN{i}", UnityOf(e, 160f, -514f),
                new Vector3(3f, 16f, 3f), deckMat);
            PlaceBox(parent, $"IronBellPostS{i}", UnityOf(e, 160f, -486f),
                new Vector3(3f, 16f, 3f), deckMat);
        }
        // hazard.iron-bell-west/east-pier AABBs
        PlaceBox(parent, "IronBellWestPier", UnityOf(-2764f, 120f, -500f),
            new Vector3(14f, 48f, 30f), pierMat);
        PlaceBox(parent, "IronBellEastPier", UnityOf(-2656f, 120f, -500f),
            new Vector3(14f, 48f, 30f), pierMat);
    }

    /// <summary>
    /// Authored corridor hazards from cobra-canyon.world.json — wires/poles/masts that the
    /// browser always draws. Bridge deck/piers and water tower already have landmark meshes.
    /// </summary>
    static void BuildAuthoredHazards(Transform root) {
        var hazards = new GameObject("AuthoredHazards").transform;
        hazards.SetParent(root, false);
        // presentation hazards role 0xe96a43 — rust cue, not neon.
        var wire = MakeLit(new Color(0xe9 / 255f, 0x6a / 255f, 0x43 / 255f), 0.18f);
        var pole = MakeLit(new Color(0x3a / 255f, 0x36 / 255f, 0x30 / 255f), 0.12f);
        var mast = MakeLit(new Color(0x55 / 255f, 0x52 / 255f, 0x4a / 255f), 0.2f);

        // power / utility / guy wires — capsuleSegment fromLocalM → toLocalM
        PlaceWire(hazards, "GorgeWireLow", new(-1660f, 139f, 795f), new(-1260f, 139f, 1115f), 0.45f, wire, pole);
        PlaceWire(hazards, "GorgeWireHigh", new(-1658f, 145f, 792f), new(-1258f, 145f, 1112f), 0.45f, wire, pole);
        PlaceWire(hazards, "SaddleWireLow", new(-3600f, 541f, 3010f), new(-3235f, 541f, 3290f), 0.4f, wire, pole);
        PlaceWire(hazards, "SaddleWireHigh", new(-3598f, 548f, 3007f), new(-3233f, 548f, 3287f), 0.4f, wire, pole);
        PlaceWire(hazards, "PlantationWire1", new(565f, 246f, -3620f), new(850f, 246f, -3270f), 0.36f, wire, pole);
        PlaceWire(hazards, "PlantationWire2", new(570f, 251f, -3624f), new(855f, 251f, -3274f), 0.36f, wire, pole);
        PlaceWire(hazards, "PlantationWire3", new(575f, 256f, -3628f), new(860f, 256f, -3278f), 0.36f, wire, pole);
        PlaceWire(hazards, "RidgeGuyWest", new(-1760f, 606f, 4980f), new(-1818f, 548f, 4938f), 0.32f, wire, null);
        PlaceWire(hazards, "RidgeGuyEast", new(-1760f, 606f, 4980f), new(-1701f, 548f, 5021f), 0.32f, wire, null);

        // Ridge radio mast — vertical capsule
        PlaceWire(hazards, "RidgeRadioMast", new(-1760f, 548f, 4980f), new(-1760f, 616f, 4980f), 1.3f, mast, null);
    }

    /// <summary>
    /// Brown earth scars from presentation.js heroCellGeometry — role color 0x6a5030.
    /// </summary>
    static void BuildHeroCellScars(Transform root) {
        var scars = new GameObject("HeroCellScars").transform;
        scars.SetParent(root, false);
        var mat = new Material(Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color"));
        mat.color = new Color(0x6a / 255f, 0x50 / 255f, 0x30 / 255f);

        // centerLocalM + radiusM from world.json heroCells
        PlaceHeroScar(scars, "LowerGorge", -3150f, -650f, 980f, mat);
        PlaceHeroScar(scars, "SplitTooth", -3850f, 2050f, 920f, mat);
        PlaceHeroScar(scars, "RedEarth", 350f, -3850f, 1050f, mat);
    }

    static void PlaceHeroScar(Transform parent, string name, float east, float north, float radius, Material mat) {
        var rng = new System.Random(name.GetHashCode());
        for (int scar = 0; scar < 3; scar++) {
            float bearing = (float)(rng.NextDouble() * Mathf.PI * 2);
            float offset = radius * (0.08f + (float)rng.NextDouble() * 0.24f);
            float ce = east + Mathf.Cos(bearing) * offset;
            float cn = north + Mathf.Sin(bearing) * offset;
            float re = radius * (0.10f + (float)rng.NextDouble() * 0.10f);
            float rn = radius * (0.06f + (float)rng.NextDouble() * 0.08f);
            Sample(ce, cn, out float h, out bool water);
            if (water) continue;
            // Elliptical disk as a flat box — readable brown patch without a full fan mesh.
            PlaceBox(parent, $"{name}Scar{scar}", UnityOf(ce, h + 0.4f, cn),
                new Vector3(re * 2f, 0.5f, rn * 2f), mat)
                .localRotation = Quaternion.Euler(0f, bearing * Mathf.Rad2Deg, 0f);
        }
    }

    /// <summary>
    /// Minimal Long Fang terrace/village read — hut boxes + paddy berms near the falls.
    /// Full ambientBatches kit is still the larger gap; this stops the bank looking empty.
    /// </summary>
    static void BuildVillageStandIns(Transform root) {
        var village = new GameObject("VillageStandIns").transform;
        village.SetParent(root, false);
        var hut = MakeLit(new Color(0x5a / 255f, 0x48 / 255f, 0x32 / 255f), 0.1f);
        var roof = MakeLit(new Color(0x3a / 255f, 0x2e / 255f, 0x20 / 255f), 0.08f);
        var berm = MakeLit(new Color(0x4a / 255f, 0x5a / 255f, 0x32 / 255f), 0.06f);
        // Around Long Fang Falls anchor (-4450, -3380)
        float[][] huts = {
            new[] { -4520f, -3420f }, new[] { -4480f, -3340f }, new[] { -4410f, -3450f },
            new[] { -4380f, -3310f }, new[] { -4550f, -3360f },
        };
        for (int i = 0; i < huts.Length; i++) {
            float e = huts[i][0], n = huts[i][1];
            Sample(e, n, out float h, out bool water);
            if (water) continue;
            PlaceBox(village, $"Hut{i}", UnityOf(e, h + 2.2f, n), new Vector3(9f, 4.2f, 7f), hut);
            PlaceBox(village, $"Roof{i}", UnityOf(e, h + 5.0f, n), new Vector3(11f, 1.6f, 9f), roof);
        }
        PlaceBox(village, "PaddyBermA", UnityOf(-4500f, 172f, -3480f), new Vector3(80f, 1.2f, 6f), berm);
        PlaceBox(village, "PaddyBermB", UnityOf(-4420f, 170f, -3520f), new Vector3(6f, 1.2f, 70f), berm);

        // Iron Bell underpass village compounds (ambient.gorge-village-compounds stand-in).
        float[][] tipHuts = {
            new[] { -2920f, -720f }, new[] { -2580f, -380f }, new[] { -2480f, -620f },
            new[] { -3010f, -420f }, new[] { -2650f, -280f }, new[] { -2850f, -850f },
        };
        for (int i = 0; i < tipHuts.Length; i++) {
            float e = tipHuts[i][0], n = tipHuts[i][1];
            Sample(e, n, out float h, out bool water);
            if (water) continue;
            PlaceBox(village, $"TipHut{i}", UnityOf(e, h + 2.2f, n), new Vector3(9f, 4.2f, 7f), hut);
            PlaceBox(village, $"TipRoof{i}", UnityOf(e, h + 5.0f, n), new Vector3(11f, 1.6f, 9f), roof);
        }

        // Paddy mirrors — flat cool strips (ambient.paddy-mirrors stand-in).
        var mirror = new Material(Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color"));
        mirror.color = new Color(0x4a / 255f, 0x6e / 255f, 0x62 / 255f, 0.85f);
        float[][] paddies = {
            new[] { -3200f, -800f, 90f, 28f },
            new[] { -2800f, -200f, 70f, 22f },
            new[] { -2400f, 200f, 85f, 24f },
            new[] { -1800f, 600f, 75f, 20f },
            new[] { -900f, 1200f, 95f, 26f },
            new[] { -200f, 1800f, 80f, 22f },
        };
        for (int i = 0; i < paddies.Length; i++) {
            float e = paddies[i][0], n = paddies[i][1], w = paddies[i][2], d = paddies[i][3];
            Sample(e, n, out float h, out bool water);
            if (water) continue;
            PlaceBox(village, $"Paddy{i}", UnityOf(e, h + 0.35f, n), new Vector3(w, 0.35f, d), mirror);
        }
    }

    /// <summary>
    /// Stand-in for ambientBatches riparian/scrub/plantation density. Not the full asset kit,
    /// but stops the corridor banks reading as bald analytic cones-only.
    /// </summary>
    static void BuildAmbientScrub(Transform root) {
        var scrubRoot = new GameObject("AmbientScrub").transform;
        scrubRoot.SetParent(root, false);
        var scrubMats = new[] {
            MakeLit(new Color(0.20f, 0.28f, 0.12f), 0.05f),
            MakeLit(new Color(0.28f, 0.32f, 0.14f), 0.05f),
            MakeLit(new Color(0.36f, 0.30f, 0.16f), 0.06f), // dry scrub
        };
        var rockMat = MakeLit(new Color(0x6a / 255f, 0x66 / 255f, 0x58 / 255f), 0.12f);
        Mesh cone = BuildConeMesh();
        var batches = new List<CombineInstance>[3];
        for (int i = 0; i < 3; i++) batches[i] = new List<CombineInstance>(1800);
        var rockBatch = new List<CombineInstance>(400);
        Mesh rock = BuildBoxMesh();

        var rng = new System.Random(19750329);
        // Riparian corridor scrub — denser, shorter than canopy cones.
        for (int i = 0; i < 2200; i++) {
            float t = (float)rng.NextDouble();
            SamplePathSmooth(River, t, out Vector3 centre, out Vector3 tangent);
            Vector3 right = Vector3.Cross(Vector3.up, tangent).normalized;
            float lateral = (float)(48.0 + rng.NextDouble() * 160.0);
            if (rng.NextDouble() < 0.5) lateral = -lateral;
            Vector3 p = centre + right * lateral;
            float east = p.x, north = -p.z;
            Sample(east, north, out float h, out bool water);
            if (water || h > 480f) continue;
            NearestPath(River, east, north, out float riverDist, out _);
            if (riverDist < 40f || riverDist > 320f) continue;
            float s = 0.35f + (float)rng.NextDouble() * 1.1f;
            var matrix = Matrix4x4.TRS(
                new Vector3(east, h, -north),
                Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f),
                new Vector3(s * 3.2f, s * 4.5f, s * 3.0f));
            batches[i % 3].Add(new CombineInstance { mesh = cone, transform = matrix });
        }
        // Plantation-row stand-ins along the road corridor (red-earth shoulder).
        for (int i = 0; i < 900; i++) {
            float t = 0.12f + (float)rng.NextDouble() * 0.76f;
            SamplePathSmooth(Road, t, out Vector3 centre, out Vector3 tangent);
            Vector3 right = Vector3.Cross(Vector3.up, tangent).normalized;
            float lateral = (float)(18.0 + rng.NextDouble() * 55.0);
            if (rng.NextDouble() < 0.5) lateral = -lateral;
            Vector3 p = centre + right * lateral;
            float east = p.x, north = -p.z;
            Sample(east, north, out float h, out bool water);
            if (water) continue;
            float s = 0.5f + (float)rng.NextDouble() * 0.9f;
            var matrix = Matrix4x4.TRS(
                new Vector3(east, h, -north),
                Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f),
                new Vector3(s * 2.4f, s * 5.5f, s * 2.4f));
            batches[2].Add(new CombineInstance { mesh = cone, transform = matrix });
        }
        // Rock scatter near Iron Bell underpass.
        for (int i = 0; i < 80; i++) {
            float east = -2710f + (float)(rng.NextDouble() * 2 - 1) * 220f;
            float north = -500f + (float)(rng.NextDouble() * 2 - 1) * 180f;
            Sample(east, north, out float h, out bool water);
            if (water) continue;
            float s = 1.2f + (float)rng.NextDouble() * 3.5f;
            var matrix = Matrix4x4.TRS(
                new Vector3(east, h + s * 0.35f, -north),
                Quaternion.Euler((float)rng.NextDouble() * 20f, (float)rng.NextDouble() * 360f, 0f),
                new Vector3(s, s * 0.7f, s * 0.85f));
            rockBatch.Add(new CombineInstance { mesh = rock, transform = matrix });
        }

        for (int b = 0; b < 3; b++) {
            if (batches[b].Count == 0) continue;
            var combined = new Mesh {
                name = $"ScrubBatch{b}",
                indexFormat = UnityEngine.Rendering.IndexFormat.UInt32,
            };
            combined.CombineMeshes(batches[b].ToArray(), true, true);
            combined.RecalculateBounds();
            var go = new GameObject($"ScrubBatch{b}");
            go.transform.SetParent(scrubRoot, false);
            go.AddComponent<MeshFilter>().sharedMesh = combined;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = scrubMats[b];
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = true;
        }
        if (rockBatch.Count > 0) {
            var combined = new Mesh {
                name = "RockScatter",
                indexFormat = UnityEngine.Rendering.IndexFormat.UInt32,
            };
            combined.CombineMeshes(rockBatch.ToArray(), true, true);
            combined.RecalculateBounds();
            var go = new GameObject("RockScatter");
            go.transform.SetParent(scrubRoot, false);
            go.AddComponent<MeshFilter>().sharedMesh = combined;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = rockMat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
        }
    }

    /// <summary>Soft olive mist cards along the gorge — ambient.river-mist stand-in.</summary>
    static void BuildRiverMist(Transform root) {
        var mistRoot = new GameObject("RiverMist").transform;
        mistRoot.SetParent(root, false);
        var mat = new Material(Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color"));
        mat.color = new Color(0xb8 / 255f, 0xb0 / 255f, 0xa0 / 255f, 0.18f);
        var rng = new System.Random(19850411);
        for (int i = 0; i < 28; i++) {
            float t = 0.08f + (float)rng.NextDouble() * 0.84f;
            SamplePathSmooth(River, t, out Vector3 centre, out Vector3 tangent);
            Vector3 right = Vector3.Cross(Vector3.up, tangent).normalized;
            float lateral = (float)((rng.NextDouble() - 0.5) * 90.0);
            Vector3 p = centre + right * lateral + Vector3.up * (8f + (float)rng.NextDouble() * 18f);
            float yaw = Mathf.Atan2(tangent.x, tangent.z) * Mathf.Rad2Deg;
            PlaceBox(mistRoot, $"Mist{i}", p,
                new Vector3(40f + (float)rng.NextDouble() * 50f, 12f + (float)rng.NextDouble() * 16f, 1.2f), mat)
                .localRotation = Quaternion.Euler(0f, yaw + 90f, 0f);
        }
    }

    /// <summary>Road-verge clutter — carts/fence posts stand-in along the plantation road.</summary>
    static void BuildRoadVerge(Transform root) {
        var verge = new GameObject("RoadVerge").transform;
        verge.SetParent(root, false);
        var wood = MakeLit(new Color(0x4a / 255f, 0x3a / 255f, 0x28 / 255f), 0.08f);
        var rust = MakeLit(new Color(0x8a / 255f, 0x5a / 255f, 0x3a / 255f), 0.1f);
        var rng = new System.Random(19910822);
        for (int i = 0; i < 48; i++) {
            float t = 0.10f + (float)rng.NextDouble() * 0.80f;
            SamplePathSmooth(Road, t, out Vector3 centre, out Vector3 tangent);
            Vector3 right = Vector3.Cross(Vector3.up, tangent).normalized;
            float side = rng.NextDouble() < 0.5 ? -1f : 1f;
            Vector3 p = centre + right * (side * (16f + (float)rng.NextDouble() * 10f));
            float east = p.x, north = -p.z;
            Sample(east, north, out float h, out bool water);
            if (water) continue;
            if (i % 3 == 0) {
                // fence post
                PlaceBox(verge, $"Post{i}", UnityOf(east, h + 1.4f, north),
                    new Vector3(0.35f, 2.8f, 0.35f), wood);
            } else if (i % 3 == 1) {
                // cart body
                PlaceBox(verge, $"Cart{i}", UnityOf(east, h + 0.9f, north),
                    new Vector3(3.2f, 1.4f, 1.8f), rust);
            } else {
                // crate stack
                PlaceBox(verge, $"Crate{i}", UnityOf(east, h + 0.7f, north),
                    new Vector3(1.6f, 1.4f, 1.6f), wood);
            }
        }
    }

    static Mesh BuildBoxMesh() {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        var mesh = go.GetComponent<MeshFilter>().sharedMesh;
        Object.Destroy(go);
        return mesh;
    }

    static void PlaceWire(
        Transform parent, string name, Vector3 fromLocal, Vector3 toLocal, float diameter,
        Material cable, Material poleMat) {
        Vector3 a = UnityOf(fromLocal.x, fromLocal.y, fromLocal.z);
        Vector3 b = UnityOf(toLocal.x, toLocal.y, toLocal.z);
        Vector3 mid = (a + b) * 0.5f;
        Vector3 dir = b - a;
        float len = dir.magnitude;
        if (len < 0.05f) return;
        var span = PlaceBox(parent, name, mid, new Vector3(diameter, diameter, len), cable);
        span.rotation = Quaternion.LookRotation(dir / len, Vector3.up);

        if (poleMat == null) return;
        // Presentation poles at endpoints (browser suppresses near route envelope — we keep
        // thin stems so the span reads as a wire crossing, not a floating stick).
        PlaceWirePole(parent, name + "PoleA", fromLocal, poleMat);
        PlaceWirePole(parent, name + "PoleB", toLocal, poleMat);
    }

    static void PlaceWirePole(Transform parent, string name, Vector3 local, Material mat) {
        Sample(local.x, local.z, out float groundY, out _);
        float topY = local.y;
        if (topY <= groundY + 2f) return;
        float h = topY - groundY;
        PlaceBox(parent, name, UnityOf(local.x, groundY + h * 0.5f, local.z),
            new Vector3(0.7f, h, 0.7f), mat);
    }

    static void ScatterJungleMerged(Transform root, List<Vector2> treeSites) {
        var trees = new GameObject("Jungle").transform;
        trees.SetParent(root, false);
        var mats = new[] {
            // Muddy olive cones — not black-forest neon.
            MakeLit(new Color(0.14f, 0.22f, 0.10f), 0.04f),
            MakeLit(new Color(0.18f, 0.26f, 0.11f), 0.05f),
            MakeLit(new Color(0.22f, 0.30f, 0.12f), 0.06f),
        };
        var batches = new List<CombineInstance>[3];
        for (int i = 0; i < 3; i++) batches[i] = new List<CombineInstance>(3200);

        Mesh cone = BuildConeMesh();
        var rng = new System.Random(19680701);
        int placed = 0;
        // Corridor-first: denser bank stands so the gorge walls read like the browser kit.
        for (int walk = 0; walk < 14000 && placed < 16000; walk++) {
            float t = (float)rng.NextDouble();
            SamplePathSmooth(River, t, out Vector3 centre, out Vector3 tangent);
            Vector3 right = Vector3.Cross(Vector3.up, tangent);
            if (right.sqrMagnitude < 1e-8f) right = Vector3.right;
            right.Normalize();
            // Prefer near bank (45–240 m), with a long tail onto the slope.
            double u = rng.NextDouble();
            float lateral = (float)((u < 0.78)
                ? 55.0 + rng.NextDouble() * 200.0
                : 250.0 + rng.NextDouble() * 380.0);
            if (rng.NextDouble() < 0.5) lateral = -lateral;
            float along = (float)((rng.NextDouble() - 0.5) * 36.0);
            // SamplePathSmooth returns Unity coords (z = -north). Offset in Unity, convert back.
            Vector3 p = centre + right * lateral + tangent * along;
            float east = p.x;
            float north = -p.z;
            if (Mathf.Abs(east) > 7200f || Mathf.Abs(north) > 7200f) continue;
            Sample(east, north, out float h, out bool water);
            if (water || h > 620f) continue;
            NearestPath(River, east, north, out float riverDist, out _);
            NearestPath(Road, east, north, out float roadDist, out _);
            if (riverDist < 95f || roadDist < 12f) continue;

            float scale = 0.50f + (float)rng.NextDouble() * 2.5f;
            float width = 5.0f * scale;
            float height = 9.0f * scale;
            float yaw = (float)rng.NextDouble() * 360f;
            int lobes = riverDist < 360f ? 3 + (placed % 3) : 2 + (placed % 2);
            for (int lobe = 0; lobe < lobes; lobe++) {
                float ox = lobe == 0 ? 0f : (float)(rng.NextDouble() * 2 - 1) * width * 0.48f;
                float oz = lobe == 0 ? 0f : (float)(rng.NextDouble() * 2 - 1) * width * 0.48f;
                float ls = lobe == 0 ? 1f : 0.50f + (float)rng.NextDouble() * 0.45f;
                var matrix = Matrix4x4.TRS(
                    new Vector3(east + ox, h, -north + oz),
                    Quaternion.Euler(0f, yaw + lobe * 37f, 0f),
                    new Vector3(width * ls, height * ls, width * 0.92f * ls));
                batches[placed % 3].Add(new CombineInstance {
                    mesh = cone,
                    transform = matrix,
                });
            }
            treeSites.Add(new Vector2(east, north));
            placed++;
        }
        // Mid/far filler so ridges aren't bald.
        for (int attempt = 0; attempt < 32000 && placed < 16000; attempt++) {
            float east = (float)(rng.NextDouble() * 2 - 1) * 7200f;
            float north = (float)(rng.NextDouble() * 2 - 1) * 7200f;
            Sample(east, north, out float h, out bool water);
            if (water || h > 620f) continue;
            NearestPath(River, east, north, out float riverDist, out _);
            NearestPath(Road, east, north, out float roadDist, out _);
            if (riverDist < 95f || roadDist < 12f) continue;
            if (riverDist < 500f) continue; // corridor already filled
            if (rng.NextDouble() > 0.22) continue;

            float scale = 0.45f + (float)rng.NextDouble() * 2.1f;
            float width = 4.6f * scale;
            float height = 8.2f * scale;
            float yaw = (float)rng.NextDouble() * 360f;
            int lobes = 1 + (placed % 3 == 0 ? 1 : 0);
            for (int lobe = 0; lobe < lobes; lobe++) {
                float ox = lobe == 0 ? 0f : (float)(rng.NextDouble() * 2 - 1) * width * 0.4f;
                float oz = lobe == 0 ? 0f : (float)(rng.NextDouble() * 2 - 1) * width * 0.4f;
                float ls = lobe == 0 ? 1f : 0.6f;
                var matrix = Matrix4x4.TRS(
                    new Vector3(east + ox, h, -north + oz),
                    Quaternion.Euler(0f, yaw + lobe * 40f, 0f),
                    new Vector3(width * ls, height * ls, width * 0.92f * ls));
                batches[placed % 3].Add(new CombineInstance {
                    mesh = cone,
                    transform = matrix,
                });
            }
            treeSites.Add(new Vector2(east, north));
            placed++;
        }

        for (int b = 0; b < 3; b++) {
            if (batches[b].Count == 0) continue;
            var combined = new Mesh {
                name = $"JungleBatch{b}",
                indexFormat = UnityEngine.Rendering.IndexFormat.UInt32,
            };
            combined.CombineMeshes(batches[b].ToArray(), true, true);
            combined.RecalculateBounds();
            var go = new GameObject($"JungleBatch{b}");
            go.transform.SetParent(trees, false);
            go.AddComponent<MeshFilter>().sharedMesh = combined;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mats[b];
            // Browser vegetation is flat-shaded without hard Mac-player shadow stamps on the river.
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = true;
        }
        Debug.Log($"[GunsOnly] jungle sites={placed} lobes≈corridor-dense banks={RiverBankRise}");
    }

    static Mesh BuildConeMesh() {
        // Unit cone: base radius 0.5 at y=0, apex at y=1 — browser jungle archetype.
        const int sides = 6;
        var verts = new List<Vector3>(sides + 2);
        var tris = new List<int>();
        verts.Add(new Vector3(0f, 1f, 0f)); // apex 0
        verts.Add(new Vector3(0f, 0f, 0f)); // base centre 1
        for (int i = 0; i < sides; i++) {
            float a = i / (float)sides * Mathf.PI * 2f;
            verts.Add(new Vector3(Mathf.Cos(a) * 0.5f, 0f, Mathf.Sin(a) * 0.5f));
        }
        for (int i = 0; i < sides; i++) {
            int cur = 2 + i;
            int next = 2 + (i + 1) % sides;
            tris.Add(0); tris.Add(next); tris.Add(cur);
            tris.Add(1); tris.Add(cur); tris.Add(next);
        }
        var mesh = new Mesh { name = "JungleCone" };
        mesh.SetVertices(verts);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    static Vector3 UnityOf(float east, float alt, float north) =>
        new(east, alt, -north);

    static Transform PlaceBox(Transform parent, string name, Vector3 unityPos, Vector3 scale, Material mat) {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.position = unityPos;
        go.transform.localScale = scale;
        Object.Destroy(go.GetComponent<Collider>());
        var mr = go.GetComponent<MeshRenderer>();
        mr.sharedMaterial = mat;
        mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        mr.receiveShadows = false;
        return go.transform;
    }

    /// <summary>
    /// Lit steel radio mast + small colored lamp. Readable at canyon range without
    /// painting the canopy solid unlit neon when the camera flies past.
    /// </summary>
    static void PlaceNavMast(Transform parent, string name, Vector3 baseUnity, Color lampColor, float heightM) {
        var steel = MakeLit(new Color(0.38f, 0.40f, 0.36f), 0.22f);
        float stemH = heightM * 0.88f;
        PlaceBox(parent, name + "Stem", baseUnity + new Vector3(0f, stemH * 0.5f, 0f),
            new Vector3(1.1f, stemH, 1.1f), steel);
        PlaceBox(parent, name + "Cross", baseUnity + new Vector3(0f, stemH * 0.78f, 0f),
            new Vector3(7.5f, 0.55f, 0.55f), steel);
        PlaceBox(parent, name + "GuyL", baseUnity + new Vector3(-2.2f, stemH * 0.45f, 0f),
            new Vector3(0.25f, stemH * 0.9f, 0.25f), steel)
            .localRotation = Quaternion.Euler(0f, 0f, 12f);
        PlaceBox(parent, name + "GuyR", baseUnity + new Vector3(2.2f, stemH * 0.45f, 0f),
            new Vector3(0.25f, stemH * 0.9f, 0.25f), steel)
            .localRotation = Quaternion.Euler(0f, 0f, -12f);
        // Small lamp only — emission so it pops without a 80 m cyan volume.
        var lamp = PlaceBox(parent, name + "Lamp", baseUnity + new Vector3(0f, stemH + 1.2f, 0f),
            new Vector3(2.4f, 2.4f, 2.4f), GunsOnlyMats.Skin(lampColor, 0.35f, lampColor * 0.55f));
        _ = lamp;
    }

    /// <summary>Public sampler for other systems (tip ring, etc.) — matches world.json.</summary>
    public static void SamplePublic(float east, float north, out float height, out bool water) =>
        Sample(east, north, out height, out water);

    static void Sample(float east, float north, out float height, out bool water) {
        height = CobraTerrainModel.Sample(east, north);
        water = CobraTerrainModel.IsWater(east, north);
    }

    static void ApplyRibbon(
        Vector3[] path, float east, float north,
        float halfWidth, float blendWidth, float bankRise, ref float height) {
        NearestPath(path, east, north, out float dist, out float pathAlt);
        float normalized = Mathf.Clamp01(dist / halfWidth);
        float target = pathAlt + bankRise * normalized * normalized;
        float blend = 1f - SmoothStep(halfWidth, halfWidth + blendWidth, dist);
        height += (target - height) * blend;
    }

    static void ApplyCellPatch(
        float east, float north,
        float centreEast, float centreElev, float centreNorth,
        float radiusM, float blendWidthM, float undulationM, ref float height) {
        float distanceM = Mathf.Sqrt(
            (east - centreEast) * (east - centreEast)
            + (north - centreNorth) * (north - centreNorth));
        float blend = 1f - SmoothStep(radiusM * 0.72f, radiusM + blendWidthM, distanceM);
        if (blend <= 0f) return;
        float localRelief = undulationM * 0.5f
            * (Mathf.Sin((east - centreEast) / 185f) + Mathf.Cos((north - centreNorth) / 225f));
        height += (centreElev + localRelief - height) * blend;
    }

    static void NearestPath(Vector3[] path, float east, float north, out float dist, out float pathAlt) {
        float best = float.MaxValue;
        pathAlt = path[0].y;
        for (int i = 1; i < path.Length; i++) {
            Vector3 a = path[i - 1];
            Vector3 b = path[i];
            float de = b.x - a.x;
            float dn = b.z - a.z;
            float lenSq = de * de + dn * dn;
            float t = lenSq <= 1e-6f
                ? 0f
                : Mathf.Clamp01(((east - a.x) * de + (north - a.z) * dn) / lenSq);
            float ne = a.x + de * t;
            float nn = a.z + dn * t;
            float d = (east - ne) * (east - ne) + (north - nn) * (north - nn);
            if (d >= best) continue;
            best = d;
            pathAlt = Mathf.Lerp(a.y, b.y, t);
        }
        dist = Mathf.Sqrt(best);
    }

    static float SmoothStep(float min, float max, float v) {
        if (max <= min) return v >= max ? 1f : 0f;
        float f = Mathf.Clamp01((v - min) / (max - min));
        return f * f * (3f - 2f * f);
    }

    static Material UnlitHex(int hex) {
        var mat = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        mat.color = new Color(((hex >> 16) & 0xff) / 255f, ((hex >> 8) & 0xff) / 255f, (hex & 0xff) / 255f);
        return mat;
    }

    static Material MakeLit(Color c, float gloss) => GunsOnlyMats.Skin(c, gloss);
}

}
