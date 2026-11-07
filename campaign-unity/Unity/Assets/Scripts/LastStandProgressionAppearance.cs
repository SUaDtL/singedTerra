using System;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public LastStandTankAppearance Appearance=>committed?.Appearance??LastStandTankAppearance.Default;

        // Cosmetics belong to the profile, including while a resumable checkpoint
        // exists. The garage owns draft preview; only this owner persists Apply.
        public bool TryApplyAppearance(LastStandTankAppearance appearance,long expectedRevision)
        {
            if(!Ready||appearance==null||expectedRevision!=Revision)return false;
            if(!committed.Appearance.Equals(appearance))
            {var next=committed.Copy();next.Appearance=appearance;return Commit(next,null);}
            // An unchanged draft has no write/revision bump, but still cannot
            // claim success against an external writer or unreadable profile.
            if(!OwnsStorage())return false;
            try
            {
                if(storage.Read()==committedRaw)return true;
                Block("The saved record changed unexpectedly. Reload after resolving the conflict.",LastStandSaveHealth.Conflict);
            }
            catch(Exception)
            {Block("The current save could not be confirmed. Retry when local storage is available.",LastStandSaveHealth.ReadUnavailable);}
            return false;
        }
    }
}
