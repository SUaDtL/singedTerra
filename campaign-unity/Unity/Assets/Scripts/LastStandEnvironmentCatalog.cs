using System;
using System.Collections.Generic;
using UnityEngine;

namespace SingedTerra.LastStand
{
    // Environment identities belong to authored presentation, independently of
    // tier number, unlock order and encounter rules. Several tiers can reuse one.
    public sealed class LastStandEnvironmentDefinition
    {
        public string Id { get; }
        public string Name { get; }
        public string Description { get; }
        public int TreatmentIndex { get; }
        public float CameraPitch { get; }
        public Color SunColor { get; }
        public float SunIntensity { get; }
        public float SunPitch { get; }
        public Color AmbientSky { get; }
        public Color AmbientEquator { get; }
        public Color AmbientGround { get; }

        internal LastStandEnvironmentDefinition(string id, string name, string description,
            int treatmentIndex, float cameraPitch, Color sunColor, float sunIntensity,
            float sunPitch, Color ambientSky, Color ambientEquator, Color ambientGround)
        {
            Id=id; Name=name; Description=description; TreatmentIndex=treatmentIndex;
            CameraPitch=cameraPitch; SunColor=sunColor; SunIntensity=sunIntensity;
            SunPitch=sunPitch; AmbientSky=ambientSky; AmbientEquator=ambientEquator;
            AmbientGround=ambientGround;
        }
    }

    public static class LastStandEnvironmentCatalog
    {
        static readonly LastStandEnvironmentDefinition[] definitions = {
            new LastStandEnvironmentDefinition("sunlit-ash", "Sunlit Ash",
                "Warm ash flats, broken rock and long sunlit approaches.", 0, 58f,
                new Color(1f,.86f,.66f), 1.65f, 42f,
                new Color(.55f,.59f,.64f), new Color(.39f,.34f,.28f), new Color(.16f,.16f,.14f)),
            new LastStandEnvironmentDefinition("iron-perimeter", "Iron Perimeter",
                "A cold industrial perimeter with hard cover and steel-grey ground.", 1, 70f,
                new Color(.78f,.87f,1f), 1.35f, 53f,
                new Color(.49f,.59f,.68f), new Color(.32f,.38f,.40f), new Color(.16f,.16f,.14f))
        };
        public static IReadOnlyList<LastStandEnvironmentDefinition> All { get; } = Array.AsReadOnly(definitions);

        public static bool TryGet(string id, out LastStandEnvironmentDefinition definition)
        {
            foreach(var candidate in definitions)
                if(string.Equals(candidate.Id,id,StringComparison.Ordinal))
                { definition=candidate; return true; }
            definition=null; return false;
        }

        public static LastStandEnvironmentDefinition Get(string id)
        {
            if(!TryGet(id,out var definition)) throw new ArgumentOutOfRangeException(nameof(id),id,"Unknown Last Stand environment.");
            return definition;
        }
    }
}
