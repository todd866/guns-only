using System.Collections.Generic;
using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Unity port of browser <c>createDrone</c> (presentation.vehicle.f22a / su27s surrogate).
/// Three.js uses local −Z forward; we build with Unity +Z forward (z' = −z_three).
/// </summary>
public static class BrowserParityJet {
    public static Transform Build(string name, JetLivery livery) {
        var root = new GameObject(name).transform;
        var mats = MakeMaterials(livery);

        // Wing planform from scene_builders.js createDrone (x, z_three) → (x, −z).
        Vector2[] wing = {
            v(0, -3.72f), v(-0.74f, -3.36f), v(-2.05f, -2.26f), v(-5.42f, 0.18f), v(-5.18f, 0.98f),
            v(-2.05f, 0.72f), v(-1.52f, 3.48f), v(0, 3.88f), v(1.52f, 3.48f), v(2.05f, 0.72f),
            v(5.18f, 0.98f), v(5.42f, 0.18f), v(2.05f, -2.26f), v(0.74f, -3.36f),
        };
        AddPlanform(root, "Wing", wing, 0.18f, mats.skin, y: 0.03f);

        Vector2[] tail = {
            v(0, 2.62f), v(-0.7f, 2.72f), v(-3.0f, 4.04f), v(-2.86f, 4.62f), v(-0.72f, 4.23f),
            v(0, 4.52f), v(0.72f, 4.23f), v(2.86f, 4.62f), v(3.0f, 4.04f), v(0.7f, 2.72f),
        };
        AddPlanform(root, "Tailplane", tail, 0.14f, mats.edge, y: 0.17f);

        // Exact continuous Web loft; disconnected sphere stand-ins left metre-scale holes.
        AddFuselage(root, mats.skin);

        for (int side = -1; side <= 1; side += 2) {
            AddNacelle(root, side, mats);
            AddFin(root, side, mats);
        }

        var canopy = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        canopy.name = "Canopy";
        canopy.transform.SetParent(root, false);
        canopy.transform.localPosition = new Vector3(0f, 0.72f, 2.55f); // −(−2.55)
        canopy.transform.localScale = new Vector3(0.88f * 1.24f, 0.72f * 1.24f, 2.25f * 1.24f);
        Object.Destroy(canopy.GetComponent<Collider>());
        Apply(canopy, mats.canopy);

        // Canopy frame rails (browser box accents).
        var rail = GameObject.CreatePrimitive(PrimitiveType.Cube);
        rail.name = "CanopyRail";
        rail.transform.SetParent(root, false);
        rail.transform.localPosition = new Vector3(0f, 1.11f, 2.35f);
        rail.transform.localScale = new Vector3(0.075f, 0.055f, 2.45f);
        Object.Destroy(rail.GetComponent<Collider>());
        Apply(rail, mats.edge);
        var cross = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cross.name = "CanopyCross";
        cross.transform.SetParent(root, false);
        cross.transform.localPosition = new Vector3(0f, 1.08f, 1.55f);
        cross.transform.localScale = new Vector3(1.02f, 0.055f, 0.075f);
        Object.Destroy(cross.GetComponent<Collider>());
        Apply(cross, mats.edge);

        // Nav lights
        AddLight(root, new Vector3(-5.28f, 0.21f, -0.55f), new Color(1f, 0.3f, 0.35f));
        AddLight(root, new Vector3(5.28f, 0.21f, -0.55f), new Color(0.38f, 1f, 0.75f));

        // Exhaust glow
        for (int side = -1; side <= 1; side += 2) {
            var ex = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            ex.name = "Exhaust";
            ex.transform.SetParent(root, false);
            ex.transform.localPosition = new Vector3(side * 1.08f, 0f, -4.67f);
            ex.transform.localScale = new Vector3(0.7f, 0.55f, 0.25f);
            Object.Destroy(ex.GetComponent<Collider>());
            Apply(ex, mats.exhaust);
        }

        return root;
    }

    public enum JetLivery { F22, Bandit }

    struct Mats {
        public Material skin, edge, canopy, exhaust, intake, underside;
    }

    static Mats MakeMaterials(JetLivery livery) {
        // Browser: skin 0x667276 / navy 0x405a68; bandit uses same createDrone — tint warmer.
        // Bandit warmer/brighter than F-22 so merge-range padlock/chase can tell them apart.
        Color skin = livery == JetLivery.F22
            ? Hex(0x667276)
            : Hex(0xb87440);
        Color edge = livery == JetLivery.F22 ? Hex(0x171f23) : Hex(0x3a2010);
        Color underside = livery == JetLivery.F22 ? Hex(0x303a3f) : Hex(0x6a4030);
        return new Mats {
            skin = Mat(skin),
            edge = Mat(edge),
            underside = Mat(underside, metal: 0.62f, smooth: 0.45f),
            canopy = Mat(Hex(0x102e3a), metal: 0.2f, smooth: 0.85f),
            exhaust = Unlit(new Color(0.87f, 0.44f, 0.16f, 0.9f)),
            intake = Mat(Hex(0x080d0f)),
        };
    }

    static Color Hex(int rgb) {
        LinearRgb linear = LinearRgb.FromSrgbHex(rgb);
        return new Color(linear.R, linear.G, linear.B, 1f);
    }

    static Vector2 v(float x, float zThree) => new(x, -zThree);

    static void AddFuselage(Transform root, Material skin) {
        AddLoft(
            root,
            "FuselageLoft",
            F22PresentationContract.BuildLoft(
                F22PresentationContract.CreateFuselageStations(),
                F22PresentationContract.FuselageRadialSegments),
            skin,
            Vector3.zero);
    }

    static void AddNacelle(Transform root, int side, Mats mats) {
        AddLoft(
            root,
            "NacelleLoft",
            F22PresentationContract.BuildLoft(
                F22PresentationContract.CreateNacelleStations(),
                F22PresentationContract.NacelleRadialSegments),
            mats.underside,
            new Vector3(side * 1.08f, 0f, 0f));

        var intake = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        intake.name = "Intake";
        intake.transform.SetParent(root, false);
        intake.transform.localPosition = new Vector3(side * 1.08f, -0.12f, 2.765f);
        intake.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
        intake.transform.localScale = new Vector3(0.86f, 0.06f, 0.66f);
        Object.Destroy(intake.GetComponent<Collider>());
        Apply(intake, mats.intake);

        var ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        ring.name = "ExhaustRing";
        ring.transform.SetParent(root, false);
        ring.transform.localPosition = new Vector3(side * 1.08f, 0f, -4.67f);
        ring.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
        ring.transform.localScale = new Vector3(0.78f, 0.04f, 0.78f);
        Object.Destroy(ring.GetComponent<Collider>());
        Apply(ring, mats.edge);
    }

    static void AddLoft(
        Transform root,
        string name,
        LoftData data,
        Material material,
        Vector3 localPosition) {
        var go = new GameObject(name);
        go.transform.SetParent(root, false);
        go.transform.localPosition = localPosition;
        var filter = go.AddComponent<MeshFilter>();
        var renderer = go.AddComponent<MeshRenderer>();
        var vertices = new Vector3[data.Vertices.Length];
        for (int index = 0; index < vertices.Length; index++) {
            F22Vector3 value = data.Vertices[index];
            vertices[index] = new Vector3(value.X, value.Y, value.Z);
        }
        var mesh = new Mesh { name = name };
        mesh.vertices = vertices;
        mesh.triangles = data.Indices;
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        filter.sharedMesh = mesh;
        renderer.sharedMaterial = material;
    }

    static void AddFin(Transform root, int side, Mats mats) {
        // Browser createFinGeometry (z_three, y) → Unity (x thickness, y, z=-z_three).
        Vector2[] fin = {
            new(1.72f, 0.0f), new(4.62f, 0.0f), new(4.1f, 2.55f), new(3.38f, 3.04f), new(2.45f, 0.3f),
        };
        var go = new GameObject("Fin");
        go.transform.SetParent(root, false);
        go.transform.localPosition = new Vector3(side * 1.04f, 0.24f, 0f);
        go.transform.localRotation = Quaternion.Euler(0f, 0f, side * -11.5f);
        var mf = go.AddComponent<MeshFilter>();
        var mr = go.AddComponent<MeshRenderer>();
        mf.sharedMesh = BuildFinMesh(fin, 0.12f);
        mr.sharedMaterial = mats.edge;
    }

    static Mesh BuildFinMesh(Vector2[] zY, float thickness) {
        int n = zY.Length;
        var verts = new List<Vector3>(n * 2);
        var tris = new List<int>();
        float h = thickness * 0.5f;
        for (int i = 0; i < n; i++) {
            float z = -zY[i].x;
            float y = zY[i].y;
            verts.Add(new Vector3(h, y, z));
            verts.Add(new Vector3(-h, y, z));
        }
        for (int i = 1; i < n - 1; i++) {
            tris.Add(0); tris.Add(i * 2); tris.Add((i + 1) * 2);
            tris.Add(1); tris.Add((i + 1) * 2 + 1); tris.Add(i * 2 + 1);
        }
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            int it = i * 2, ib = i * 2 + 1, jt = j * 2, jb = j * 2 + 1;
            tris.Add(it); tris.Add(jt); tris.Add(jb);
            tris.Add(it); tris.Add(jb); tris.Add(ib);
        }
        var mesh = new Mesh { name = "Fin" };
        mesh.SetVertices(verts);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    static void AddLight(Transform root, Vector3 localPos, Color color) {
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = "NavLight";
        go.transform.SetParent(root, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = Vector3.one * 0.18f;
        Object.Destroy(go.GetComponent<Collider>());
        Apply(go, Unlit(color));
    }

    static void AddPlanform(Transform root, string name, Vector2[] xz, float thickness, Material mat, float y) {
        var go = new GameObject(name);
        go.transform.SetParent(root, false);
        go.transform.localPosition = new Vector3(0f, y, 0f);
        var mf = go.AddComponent<MeshFilter>();
        var mr = go.AddComponent<MeshRenderer>();
        mf.sharedMesh = BuildPlanformMesh(xz, thickness);
        mr.sharedMaterial = mat;
    }

    static Mesh BuildPlanformMesh(Vector2[] ring, float thickness) {
        // ring is (x, z_unity). Extrude ±y.
        int n = ring.Length;
        var verts = new List<Vector3>(n * 2);
        var tris = new List<int>();
        float h = thickness * 0.5f;
        for (int i = 0; i < n; i++) {
            verts.Add(new Vector3(ring[i].x, h, ring[i].y));
            verts.Add(new Vector3(ring[i].x, -h, ring[i].y));
        }
        // Top / bottom fans
        for (int i = 1; i < n - 1; i++) {
            tris.Add(0); tris.Add(i * 2); tris.Add((i + 1) * 2);
            tris.Add(1); tris.Add((i + 1) * 2 + 1); tris.Add(i * 2 + 1);
        }
        // Sides
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            int it = i * 2, ib = i * 2 + 1, jt = j * 2, jb = j * 2 + 1;
            tris.Add(it); tris.Add(jt); tris.Add(jb);
            tris.Add(it); tris.Add(jb); tris.Add(ib);
        }
        var mesh = new Mesh { name = "Planform" };
        mesh.SetVertices(verts);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    static Material Mat(Color c, float metal = 0.45f, float smooth = 0.55f) {
        Shader s = Shader.Find("Standard") ?? Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default");
        var m = new Material(s);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metal);
        if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smooth);
        m.color = c;
        return m;
    }

    static Material Unlit(Color c) {
        Shader s = Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default") ?? Shader.Find("UI/Default");
        var m = new Material(s);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        m.color = c;
        return m;
    }

    static void Apply(GameObject go, Material mat) {
        var r = go.GetComponent<Renderer>();
        if (r != null) r.sharedMaterial = mat;
    }
}

}
