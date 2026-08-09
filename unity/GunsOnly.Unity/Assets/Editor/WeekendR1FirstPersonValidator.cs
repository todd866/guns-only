using System;
using GunsOnly.UnityClient;
using UnityEngine;

namespace GunsOnly.UnityEditorTools {

/// <summary>Headless semantic/material/geometry acceptance for the isolated Weekend R1 rig.</summary>
public static class WeekendR1FirstPersonValidator {
    const float Tolerance = 0.00001f;

    public static void ValidateBatch() {
        WeekendR1FirstPersonContract contract = WeekendR1FirstPersonContract.LoadOrThrow();
        Require(contract.Schema == WeekendR1FirstPersonContract.ExpectedSchema, "schema mismatch");
        Require(
            contract.SemanticSha256 == WeekendR1FirstPersonContract.ExpectedSemanticSha256,
            "semantic hash mismatch");
        Require(contract.Parts.Count == 24, "part count mismatch");

        var cameraObject = new GameObject("WEEKEND_R1_VALIDATION_CAMERA");
        cameraObject.AddComponent<Camera>();
        try {
            WeekendR1FirstPersonRig rig = WeekendR1FirstPersonRig.AttachTo(
                cameraObject.transform, contract);
            Require(rig.IsBuilt, "rig was not built");
            Require(rig.ContractPartCount == 24, "rig contract count mismatch");
            Require(rig.transform.parent == cameraObject.transform, "rig is not camera-local");
            Require(rig.transform.localPosition == Vector3.zero, "rig root position drifted");
            Require(rig.transform.localRotation == Quaternion.identity, "rig root rotation drifted");
            Require(rig.transform.localScale == Vector3.one, "rig root scale drifted");
            Require(rig.transform.childCount == contract.Parts.Count, "built part count mismatch");
            Require(
                ReferenceEquals(WeekendR1FirstPersonRig.AttachTo(cameraObject.transform, contract), rig),
                "AttachTo is not idempotent");

            for (int index = 0; index < contract.Parts.Count; index++) {
                WeekendR1FirstPersonContract.PartSpec spec = contract.Parts[index];
                Transform built = rig.transform.GetChild(index);
                Require(built.name == spec.Name, "part order/name mismatch at " + index);
                Require(
                    Vector3.Distance(built.localPosition, new Vector3(
                        spec.PositionM[0], spec.PositionM[1], -spec.PositionM[2])) < Tolerance,
                    "coordinate reflection mismatch for " + spec.Name);
                MeshFilter filter = built.GetComponent<MeshFilter>();
                MeshRenderer renderer = built.GetComponent<MeshRenderer>();
                Require(filter != null && filter.sharedMesh != null, "missing mesh for " + spec.Name);
                Require(renderer != null && renderer.sharedMaterial != null,
                    "missing material for " + spec.Name);
                Require(renderer.sharedMaterial.shader.name == "GunsOnly/WeekendR1NearField",
                    "wrong shader for " + spec.Name);
                Require(renderer.shadowCastingMode == UnityEngine.Rendering.ShadowCastingMode.Off,
                    "unexpected shadows for " + spec.Name);
                Require(!renderer.receiveShadows, "unexpected received shadows for " + spec.Name);
                Require(renderer.sortingOrder == contract.Render.RenderOrder,
                    "render order mismatch for " + spec.Name);
                Require(filter.sharedMesh.bounds.size.x >= 99f,
                    "non-culled bounds were not retained for " + spec.Name);
            }

            foreach (string anchor in contract.RequiredAnchors) {
                Require(rig.transform.Find(anchor) != null, "missing required anchor " + anchor);
            }

            ValidateWindscreen(contract, rig);
            ValidateTachometer(contract, rig, contract.Tachometer.RedlineRpm,
                contract.Tachometer.ActiveEmissiveIntensity);
            ValidateTachometer(contract, rig, float.NaN,
                contract.Tachometer.InactiveEmissiveIntensity);
            Debug.Log(
                "[GunsOnly] WEEKEND_R1_CONTRACT_OK semantic=" + contract.SemanticSha256
                + " parts=" + contract.Parts.Count);
        } finally {
            UnityEngine.Object.DestroyImmediate(cameraObject);
        }
    }

    static void ValidateWindscreen(
        WeekendR1FirstPersonContract contract,
        WeekendR1FirstPersonRig rig
    ) {
        Material material = rig.transform.Find("r1-windscreen")
            .GetComponent<MeshRenderer>().sharedMaterial;
        WeekendR1FirstPersonContract.MaterialSpec spec = contract.MaterialOrThrow("windscreen");
        Require(Mathf.Abs(material.GetColor("_Color").a - spec.Opacity) < Tolerance,
            "windscreen opacity mismatch");
        Require(material.GetInt("_ZWrite") == 0, "windscreen depth-write mismatch");
        Require(material.GetInt("_Cull") == 0, "windscreen double-side mismatch");
        Require(material.renderQueue == (int)UnityEngine.Rendering.RenderQueue.Transparent,
            "windscreen render queue mismatch");
    }

    static void ValidateTachometer(
        WeekendR1FirstPersonContract contract,
        WeekendR1FirstPersonRig rig,
        float rpm,
        float expectedIntensity
    ) {
        rig.SetEngineRpm(rpm);
        for (int index = 0; index < 7; index++) {
            Transform light = rig.transform.Find("r1-tach-light-" + index);
            Material material = light.GetComponent<MeshRenderer>().sharedMaterial;
            WeekendR1FirstPersonContract.PartSpec part = contract.Parts[10 + index];
            WeekendR1FirstPersonContract.MaterialSpec spec =
                contract.MaterialOrThrow(part.MaterialName);
            Color color = contract.LinearColorOrThrow(spec.EmissiveColorName);
            Color expected = new(
                color.r * expectedIntensity,
                color.g * expectedIntensity,
                color.b * expectedIntensity,
                1f);
            Require(ColorDistance(material.GetColor("_Emission"), expected) < Tolerance,
                "tach emission mismatch at " + index + " for RPM " + rpm);
        }
    }

    static float ColorDistance(Color left, Color right) {
        return Mathf.Max(
            Mathf.Abs(left.r - right.r),
            Mathf.Abs(left.g - right.g),
            Mathf.Abs(left.b - right.b),
            Mathf.Abs(left.a - right.a));
    }

    static void Require(bool condition, string message) {
        if (!condition) throw new InvalidOperationException("Weekend R1 validation: " + message + ".");
    }
}

}
