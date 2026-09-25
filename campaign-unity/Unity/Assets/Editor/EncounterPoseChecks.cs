using System;
using UnityEngine;
using SingedTerra.Art;

// Uses the actual imported hierarchy and runtime yaw calculation, not a substitute model.
public static class EncounterPoseChecks
{
    public static void Run()
    {
        var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        if (!art) throw new InvalidOperationException("Saved tank scene required for pose checks");
        var turret = art.turret;
        Quaternion homeLocal = turret.localRotation, homeWorld = turret.rotation;
        Vector3 localUp = turret.InverseTransformDirection(Vector3.up);
        Vector3 forward = Vector3.ProjectOnPlane(art.muzzle.position-art.barrel.position,Vector3.up).normalized;
        try
        {
            for (int lane=0; lane<8; lane++)
            {
                float radians=lane*Mathf.PI/4;
                Vector3 target=new Vector3(Mathf.Sin(radians),0,Mathf.Cos(radians));
                turret.localRotation=Quaternion.Inverse(turret.parent.rotation)*TankPresentation.EncounterWorldYaw(homeWorld,forward,target);
                Vector3 aimed=Vector3.ProjectOnPlane(art.muzzle.position-art.barrel.position,Vector3.up).normalized;
                if (Vector3.Dot(turret.TransformDirection(localUp).normalized,Vector3.up)<.9999f)
                    throw new InvalidOperationException("Encounter turret flips at lane "+lane);
                if (Vector3.Dot(aimed,target)<.9999f)
                    throw new InvalidOperationException("Encounter cannon misses heading at lane "+lane);
            }
        }
        finally { turret.localRotation=homeLocal; }
        Debug.Log("ST_ENC_POSE_PASS eight actual imported-tank headings; upright and cannon-aligned");
    }
}
