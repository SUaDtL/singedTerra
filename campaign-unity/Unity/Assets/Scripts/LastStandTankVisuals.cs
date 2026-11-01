using System;
using System.Collections.Generic;
using UnityEngine;
using SingedTerra.LastStand;

namespace SingedTerra.Art
{
    // Appearance owns only render geometry. The existing rig remains the sole
    // yaw/recoil/muzzle owner; model import conversion stays inside each prefab.
    public sealed class LastStandTankVisuals : MonoBehaviour
    {
        // Family-major order: Foundry, Ranger, Bulwark, Jackal; then enum slots.
        public GameObject[] parts = new GameObject[16];
        public Material armor, steel, edge, rubber, brass, optic;
        static readonly string[] Families = { "foundry", "ranger", "bulwark", "jackal" };
        readonly GameObject[] instances = new GameObject[16];
        readonly Renderer[][] renderers = new Renderer[16][];
        readonly List<Transform> roots = new List<Transform>();
        Renderer[] originalRenderers;
        bool[] originalEnabled;
        TankPresentation owner;
        MaterialPropertyBlock paintBlock;
        public LastStandTankAppearance Current { get; private set; }
        public Transform FittingSocket { get; private set; }
        public event Action GeometryChanged;

        public void Initialize(TankPresentation presentation)
        {
            if (owner)
            {
                if (owner != presentation) throw new InvalidOperationException("Tank visuals cannot change rig owner");
                return;
            }
            if (!presentation || !presentation.tank || !presentation.turret || !presentation.barrel || !presentation.muzzle ||
                !presentation.repairModule || !presentation.launcherModule)
                throw new InvalidOperationException("Tank visual rig references are incomplete");
            if (parts == null || parts.Length != 16 || !armor || !steel || !edge || !rubber || !brass || !optic)
                throw new InvalidOperationException("Tank visual asset bindings are incomplete");
            for (int i = 0; i < parts.Length; i++)
                if (!parts[i] || parts[i].GetComponentsInChildren<Renderer>(true).Length == 0)
                    throw new InvalidOperationException("Missing visible tank part " + i);
            var forward = Vector3.ProjectOnPlane(presentation.muzzle.position - presentation.barrel.position, Vector3.up).normalized;
            if (forward.sqrMagnitude < .5f) throw new InvalidOperationException("Tank visual forward axis is undefined");
            // Capture legacy core before creating new renderers. Fitting renderers
            // remain independently owned even though they live below TurretYaw.
            var core = new List<Renderer>();
            foreach (var renderer in presentation.tank.GetComponentsInChildren<Renderer>(true))
                if (!renderer.transform.IsChildOf(presentation.repairModule.transform) &&
                    !renderer.transform.IsChildOf(presentation.launcherModule.transform) &&
                    (!presentation.flash || !renderer.transform.IsChildOf(presentation.flash.transform)))
                    core.Add(renderer);
            Renderer foot = null;
            foreach (var renderer in presentation.launcherModule.GetComponentsInChildren<Renderer>(true))
                if (renderer.name == "Attachment_Launcher_Steel") { foot = renderer; break; }
            if (!foot) throw new InvalidOperationException("Existing fitting saddle geometry is missing");
            owner = presentation;
            originalRenderers = core.ToArray(); originalEnabled = new bool[core.Count];
            var rotation = Quaternion.LookRotation(-forward, Vector3.up);
            FittingSocket = CreateRoot("Tank fitting socket", owner.turret, foot.bounds.center, Quaternion.LookRotation(forward, Vector3.up));
            var chassis = CreateRoot("Tank core visuals", owner.tank, owner.tank.position, rotation);
            var turretRoot = CreateRoot("Tank turret visuals", owner.turret, owner.turret.position, rotation);
            var barrelRoot = CreateRoot("Tank barrel visuals", owner.barrel, owner.barrel.position, rotation);
            for (int i = 0; i < parts.Length; i++)
            {
                int slot = i % 4;
                instances[i] = Instantiate(parts[i], slot < 2 ? chassis : slot == 2 ? turretRoot : barrelRoot, false);
                instances[i].name = Families[i / 4] + "-" + ((LastStandTankPartSlot)slot).ToString().ToLowerInvariant();
                renderers[i] = instances[i].GetComponentsInChildren<Renderer>(true);
                instances[i].SetActive(false);
            }
            for (int i = 0; i < core.Count; i++) { originalEnabled[i] = core[i].enabled; core[i].enabled = false; }
            paintBlock = new MaterialPropertyBlock();
            Apply(LastStandTankAppearance.Default);
        }

        Transform CreateRoot(string identity, Transform parent, Vector3 position, Quaternion rotation)
        {
            var root = new GameObject(identity).transform;
            root.SetPositionAndRotation(position, rotation);
            root.SetParent(parent, true); // Preserve world metre scale through imported 100x/-90 degree transforms.
            roots.Add(root);
            return root;
        }

        public bool Apply(LastStandTankAppearance appearance)
        {
            if (!owner) throw new InvalidOperationException("Initialize the tank visual rig before applying appearance");
            if (appearance == null) throw new ArgumentNullException(nameof(appearance));
            if (appearance.Equals(Current)) return false;
            if (!ColorUtility.TryParseHtmlString(LastStandTankAppearanceCatalog.GetPaint(appearance.Paint).Hex, out var color))
                throw new InvalidOperationException("Invalid authored tank paint");
            // Pigmented armor; keep dark rubber, exposed metal and optics readable.
            var pigment = Color.Lerp(new Color(.67f, .64f, .55f), color, .78f);
            paintBlock.Clear(); paintBlock.SetColor("_BaseColor", pigment);
            for (int i = 0; i < instances.Length; i++)
            {
                instances[i].SetActive(appearance.Part((LastStandTankPartSlot)(i % 4)) == Families[i / 4]);
                foreach (var renderer in renderers[i])
                {
                    var shared = renderer.sharedMaterials;
                    for (int material = 0; material < shared.Length; material++)
                        if (shared[material] == armor) renderer.SetPropertyBlock(paintBlock, material);
                }
            }
            Current = appearance;
            GeometryChanged?.Invoke();
            return true;
        }

        public IReadOnlyList<Renderer> PartRenderers(LastStandTankPartSlot slot)
        {
            if (!owner || Current == null) return Array.Empty<Renderer>();
            int family = Array.IndexOf(Families, Current.Part(slot));
            if (family < 0 || (int)slot < 0 || (int)slot > 3) throw new ArgumentOutOfRangeException(nameof(slot));
            return renderers[family * 4 + (int)slot];
        }

        public Material ModuleMaterial(string identity)
        {
            switch (identity)
            {
                case "Armor": return armor;
                case "Steel": return steel;
                case "Edge": return edge;
                case "Rubber": return rubber;
                case "Brass": return brass;
                case "Optic": return optic;
                default: throw new ArgumentException("Unknown tank material: " + identity, nameof(identity));
            }
        }

        void OnDestroy()
        {
            if (originalRenderers != null)
                for (int i = 0; i < originalRenderers.Length; i++)
                    if (originalRenderers[i]) originalRenderers[i].enabled = originalEnabled[i];
            foreach (var root in roots)
                if (root) { if (Application.isPlaying) Destroy(root.gameObject); else DestroyImmediate(root.gameObject); }
        }
    }
}
