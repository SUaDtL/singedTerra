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

    public sealed class LastStandFittingDefinition
    {
        readonly string description;
        public LastStandFitting Mechanic { get; }
        public string Id { get; }
        public string Name { get; }
        public string Description => description+(InitiallyUnlocked?"":" Unlock by clearing Tier "+UnlockTier+" wave "+UnlockWave+".");
        public int UnlockTier { get; }
        public int UnlockWave { get; }
        public bool InitiallyUnlocked => UnlockTier==0;
        public LastStandFittingDefinition(LastStandFitting mechanic,string id,string name,string description,int unlockTier=0,int unlockWave=0)
        {
            // Validate exactly the text and identity consumed by selectors.
            new LastStandSelectionOption(id,name,description);
            if(!Enum.IsDefined(typeof(LastStandFitting),mechanic)||unlockTier<0||unlockWave<0||(unlockTier==0)!=(unlockWave==0))
                throw new ArgumentException("Invalid fitting mechanic or unlock.");
            Mechanic=mechanic;Id=id;Name=name;this.description=description;UnlockTier=unlockTier;UnlockWave=unlockWave;
            new LastStandSelectionOption(id,name,Description);
        }
        public LastStandSelectionOption Option(bool unlocked)=>new LastStandSelectionOption(Id,Name,Description,InitiallyUnlocked||unlocked);
    }

    public static class LastStandFittingCatalog
    {
        public static IReadOnlyList<LastStandFittingDefinition> Definitions { get; } = Array.AsReadOnly(new[] {
            new LastStandFittingDefinition(LastStandFitting.Repair,"repair","Field Repair",
                "Repairs hull during the run. Choose sustain alongside the automatic cannon."),
            new LastStandFittingDefinition(LastStandFitting.Launcher,"launcher","Auxiliary Launcher",
                "Adds an independently firing launcher alongside the automatic cannon."),
            new LastStandFittingDefinition(LastStandFitting.Scattergun,"scattergun","Auxiliary Scattergun",
                "Hits up to three nearby enemies per burst alongside the automatic cannon.",1,100)
        });
        public static IReadOnlyList<LastStandSelectionOption> Options { get; } = OptionsFor(_=>false);
        public static string Id(LastStandFitting fitting)
        {
            foreach(var definition in Definitions)if(definition.Mechanic==fitting)return definition.Id;
            throw new ArgumentOutOfRangeException(nameof(fitting));
        }
        public static LastStandFitting Parse(string id)
        {
            foreach(var definition in Definitions)if(String.Equals(definition.Id,id,StringComparison.Ordinal))return definition.Mechanic;
            throw new ArgumentException("Unknown fitting identity.",nameof(id));
        }
        public static IReadOnlyList<LastStandSelectionOption> OptionsFor(Func<string,bool> isUnlocked)
        {
            if(isUnlocked==null)throw new ArgumentNullException(nameof(isUnlocked));
            var result=new List<LastStandSelectionOption>();
            foreach(var definition in Definitions)result.Add(definition.Option(isUnlocked(definition.Id)));
            return result.AsReadOnly();
        }
    }
}
