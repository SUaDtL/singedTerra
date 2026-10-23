using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace SingedTerra.LastStand
{
    // Presentation metadata only. The progression/controller owners admit any
    // selection; browsing a locked option does not unlock or save anything.
    public sealed class LastStandSelectionOption
    {
        public string Id { get; }
        public string Name { get; }
        public string Description { get; }
        public bool Unlocked { get; }

        public LastStandSelectionOption(string id, string name, string description, bool unlocked = true)
        {
            ValidateId(id);
            if (string.IsNullOrWhiteSpace(name) || name.Length > 128)
                throw new ArgumentException("Selection name must contain 1..128 characters.", nameof(name));
            if (string.IsNullOrWhiteSpace(description) || description.Length > 1024)
                throw new ArgumentException("Selection description must contain 1..1024 characters.", nameof(description));
            Id = id; Name = name; Description = description; Unlocked = unlocked;
        }

        internal static void ValidateId(string id)
        {
            if (string.IsNullOrEmpty(id) || id.Length > 80)
                throw new ArgumentException("Selection requires a stable identifier.", nameof(id));
            for (int i = 0; i < id.Length; i++)
            {
                char value = id[i];
                bool alphanumeric = value >= 'a' && value <= 'z' || value >= '0' && value <= '9';
                if (!alphanumeric && (value != '-' || i == 0))
                    throw new ArgumentException("Selection identifiers use lowercase letters, digits and hyphens.", nameof(id));
            }
        }
    }

    // A bounded preview cursor over a captured catalog. It deliberately owns no
    // committed selection, unlock policy or persistence. Rebuild after an unlock.
    public sealed class LastStandSelection
    {
        readonly ReadOnlyCollection<LastStandSelectionOption> options;
        readonly Dictionary<string, int> indices = new Dictionary<string, int>(StringComparer.Ordinal);
        public IReadOnlyList<LastStandSelectionOption> Options => options;
        public int Count => options.Count;
        public int Index { get; private set; }
        public LastStandSelectionOption Current => options[Index];
        public bool CanPrevious => Index > 0;
        public bool CanNext => Index + 1 < Count;

        public LastStandSelection(IEnumerable<LastStandSelectionOption> catalog, string selectedId, bool firstLockedPreview)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            var visible = new List<LastStandSelectionOption>();
            var identities = new HashSet<string>(StringComparer.Ordinal);
            bool previewBoundary = false;
            foreach (var option in catalog)
            {
                if (option == null) throw new ArgumentException("Catalog contains a missing option.", nameof(catalog));
                if (!identities.Add(option.Id)) throw new ArgumentException("Catalog contains duplicate identities.", nameof(catalog));
                if (previewBoundary) continue;
                indices.Add(option.Id, visible.Count); visible.Add(option);
                if (firstLockedPreview && !option.Unlocked) previewBoundary = true;
            }
            if (visible.Count == 0) throw new ArgumentException("Selection catalog is empty.", nameof(catalog));
            options = visible.AsReadOnly();
            Reset(selectedId);
        }

        public bool Move(int direction)
        {
            if (direction != -1 && direction != 1)
                throw new ArgumentOutOfRangeException(nameof(direction), "Selection moves one choice at a time.");
            int next = Index + direction;
            if (next < 0 || next >= Count) return false;
            Index = next; return true;
        }

        public void Reset(string selectedId)
        {
            LastStandSelectionOption.ValidateId(selectedId);
            if (!indices.TryGetValue(selectedId, out int next) || !options[next].Unlocked)
                throw new ArgumentException("Selected identity must be visible and unlocked.", nameof(selectedId));
            Index = next;
        }
    }

    public static class LastStandFittingCatalog
    {
        public static IReadOnlyList<LastStandSelectionOption> Options { get; } =
            Array.AsReadOnly(new[] {
                new LastStandSelectionOption("repair", "Field Repair",
                    "Repairs hull during the run. Choose sustain alongside the automatic cannon."),
                new LastStandSelectionOption("launcher", "Auxiliary Launcher",
                    "Adds an independently firing launcher alongside the automatic cannon."),
                new LastStandSelectionOption("scattergun", "Auxiliary Scattergun",
                    "Hits up to three nearby enemies per burst alongside the automatic cannon. Unlock by clearing Tier 1 wave 100.", false)
            });
        public static string Id(LastStandFitting fitting)
        {
            switch(fitting)
            {
                case LastStandFitting.Repair: return "repair";
                case LastStandFitting.Launcher: return "launcher";
                case LastStandFitting.Scattergun: return "scattergun";
                default: throw new ArgumentOutOfRangeException(nameof(fitting));
            }
        }
        public static LastStandFitting Parse(string id)
        {
            switch(id)
            {
                case "repair": return LastStandFitting.Repair;
                case "launcher": return LastStandFitting.Launcher;
                case "scattergun": return LastStandFitting.Scattergun;
                default: throw new ArgumentException("Unknown fitting identity.",nameof(id));
            }
        }
        public static IReadOnlyList<LastStandSelectionOption> OptionsFor(Func<string,bool> isUnlocked)
        {
            if(isUnlocked==null)throw new ArgumentNullException(nameof(isUnlocked));
            var result=new List<LastStandSelectionOption>();
            foreach(var option in Options)
                result.Add(new LastStandSelectionOption(option.Id,option.Name,option.Description,option.Unlocked || isUnlocked(option.Id)));
            return result.AsReadOnly();
        }
    }
}
