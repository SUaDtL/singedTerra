using System;

namespace SingedTerra.LastStand
{
    // A cosmetic draft, not a second save owner. Unrelated research revisions
    // do not invalidate a draft; replacement profiles and changed cosmetics do.
    public sealed class LastStandAppearanceSession
    {
        LastStandTankAppearance baseline;
        long restoreGeneration;
        public LastStandTankAppearance Draft { get; private set; }
        public bool IsOpen => baseline != null;
        public bool HasChanges => IsOpen && !baseline.Equals(Draft);
        public void Begin(LastStandTankAppearance saved,long generation)
        { baseline=saved??throw new ArgumentNullException(nameof(saved));Draft=saved;restoreGeneration=generation; }
        public bool Matches(LastStandTankAppearance saved,long generation)
            => IsOpen && restoreGeneration==generation && baseline.Equals(saved);
        public void Preview(LastStandTankAppearance value)
        {
            if(!IsOpen)throw new InvalidOperationException("Appearance editor is closed.");
            Draft=value??throw new ArgumentNullException(nameof(value));
        }
        public void Confirm(LastStandTankAppearance saved,long generation)=>Begin(saved,generation);
        public void Close(){baseline=null;Draft=null;}
    }
}
