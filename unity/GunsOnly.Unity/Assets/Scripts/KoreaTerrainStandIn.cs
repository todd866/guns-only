using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Korea-ish rolling heightfield stand-in. Its presentation material is the same generated
/// highland pigment, projection and luma treatment as Web; geometry remains non-authoritative.
/// </summary>
public static class KoreaTerrainStandIn {
    public static Material Build(
        Transform parent,
        KoreaHighlandSurface.Presentation presentation =
            KoreaHighlandSurface.Presentation.KoreaModern) {
        var root = new GameObject("KoreaTerrainStandIn").transform;
        root.SetParent(parent, false);

        const int res = 128;
        const float extent = 70000f;
        var mesh = new Mesh { name = "KoreaHeightfield", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
        var verts = new Vector3[res * res];
        var surfaceData = new Color32[res * res];
        var tris = new int[(res - 1) * (res - 1) * 6];

        for (int z = 0; z < res; z++) {
            for (int x = 0; x < res; x++) {
                float u = x / (float)(res - 1);
                float v = z / (float)(res - 1);
                float wx = (u - 0.5f) * 2f * extent;
                float wz = (v - 0.5f) * 2f * extent;
                float n1 = Mathf.PerlinNoise(u * 7.4f + 2.1f, v * 7.4f + 0.7f);
                float n2 = Mathf.PerlinNoise(u * 22f + 9f, v * 22f + 3f);
                float n3 = Mathf.PerlinNoise(u * 2.4f, v * 2.4f);
                float h = n1 * 420f + n2 * 110f + n3 * 640f;
                float lake = Mathf.PerlinNoise(u * 4.2f + 40f, v * 4.2f + 11f);
                bool isLake = lake < 0.30f && h < 480f;
                if (isLake) h = Mathf.Min(h, 12f + lake * 25f);

                int i = z * res + x;
                verts[i] = new Vector3(wx, h, wz);
                // Web's Ukraine worker supplies two normalized land-cover bytes. The stand-in has
                // no sourced ecology, so deterministic continuous noise fills those presentation
                // channels while alpha remains the established analytic-water mask.
                byte succession = ToByte(Mathf.PerlinNoise(u * 5.1f + 17.3f, v * 5.1f + 9.7f));
                byte fieldHistory = ToByte(Mathf.PerlinNoise(u * 11.7f + 3.4f, v * 11.7f + 29.1f));
                surfaceData[i] = new Color32(
                    succession,
                    fieldHistory,
                    128,
                    isLake ? (byte)255 : (byte)0);
            }
        }

        int ti = 0;
        for (int z = 0; z < res - 1; z++) {
            for (int x = 0; x < res - 1; x++) {
                int i = z * res + x;
                tris[ti++] = i;
                tris[ti++] = i + res;
                tris[ti++] = i + 1;
                tris[ti++] = i + 1;
                tris[ti++] = i + res;
                tris[ti++] = i + res + 1;
            }
        }

        mesh.vertices = verts;
        mesh.colors32 = surfaceData;
        mesh.triangles = tris;
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        var go = new GameObject("Heightfield");
        go.transform.SetParent(root, false);
        var mf = go.AddComponent<MeshFilter>();
        var mr = go.AddComponent<MeshRenderer>();
        mf.sharedMesh = mesh;

        Material material;
        switch (presentation) {
            case KoreaHighlandSurface.Presentation.KoreaModern:
                // Keep the historical/default route on its established no-argument seam.
                material = KoreaHighlandSurface.CreateMaterial();
                break;
            case KoreaHighlandSurface.Presentation.F22UkraineCombat:
                material = KoreaHighlandSurface.CreateMaterial(presentation);
                break;
            default:
                throw new System.ArgumentOutOfRangeException(
                    nameof(presentation), presentation, null);
        }
        mr.sharedMaterial = material;
        mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
        return material;
    }

    static byte ToByte(float value) => (byte)Mathf.RoundToInt(Mathf.Clamp01(value) * 255f);
}

}
