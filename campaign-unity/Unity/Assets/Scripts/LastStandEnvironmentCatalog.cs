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

        internal LastStandEnvironmentDefinition(LastStandEnvironmentIdentity identity,
            int treatmentIndex, float cameraPitch, Color sunColor, float sunIntensity,
            float sunPitch, Color ambientSky, Color ambientEquator, Color ambientGround)
        {
            if(identity==null)throw new ArgumentNullException(nameof(identity));
            Id=identity.Id; Name=identity.Name; Description=identity.Description; TreatmentIndex=treatmentIndex;
            CameraPitch=cameraPitch; SunColor=sunColor; SunIntensity=sunIntensity;
            SunPitch=sunPitch; AmbientSky=ambientSky; AmbientEquator=ambientEquator;
            AmbientGround=ambientGround;
        }
    }

    public static class LastStandEnvironmentCatalog
    {
        static readonly LastStandEnvironmentDefinition[] definitions = {
            new LastStandEnvironmentDefinition(LastStandContentCatalog.Environment("sunlit-ash"), 0, 58f,
                new Color(1f,.86f,.66f), 1.65f, 42f,
                new Color(.55f,.59f,.64f), new Color(.39f,.34f,.28f), new Color(.16f,.16f,.14f)),
            new LastStandEnvironmentDefinition(LastStandContentCatalog.Environment("iron-perimeter"), 1, 70f,
                new Color(.78f,.87f,1f), 1.35f, 53f,
                new Color(.49f,.59f,.68f), new Color(.32f,.38f,.40f), new Color(.16f,.16f,.14f)),
            new LastStandEnvironmentDefinition(LastStandContentCatalog.Environment("cinder-basin"), 2, 62f,
                new Color(1f,.67f,.40f), 1.5f, 38f,
                new Color(.59f,.40f,.32f), new Color(.40f,.26f,.20f), new Color(.18f,.12f,.11f)),
            new LastStandEnvironmentDefinition(LastStandContentCatalog.Environment("storm-foundry"), 3, 66f,
                new Color(.65f,.81f,1f), 1.3f, 58f,
                new Color(.35f,.48f,.63f), new Color(.26f,.34f,.43f), new Color(.12f,.16f,.21f))
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
