using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Shared preview lifecycle for immutable values. Persistence remains with
    // the progression transaction owner, never with a screen or its draft.
    public class LastStandValueDraft<T> where T : class
    {
        T baseline;
        long restoreGeneration;
        public T Draft { get; private set; }
        public bool IsOpen => baseline != null;
        public bool HasChanges => IsOpen && !EqualityComparer<T>.Default.Equals(baseline,Draft);
        public void Begin(T saved,long generation)
        { baseline=saved??throw new ArgumentNullException(nameof(saved));Draft=saved;restoreGeneration=generation; }
        public bool Matches(T saved,long generation)
            => IsOpen && restoreGeneration==generation && EqualityComparer<T>.Default.Equals(baseline,saved);
        public void Preview(T value)
        {
            if(!IsOpen)throw new InvalidOperationException("The editor is closed.");
            Draft=value??throw new ArgumentNullException(nameof(value));
        }
        public void Confirm(T saved,long generation)=>Begin(saved,generation);
        public void Close(){baseline=null;Draft=null;}
    }
}
