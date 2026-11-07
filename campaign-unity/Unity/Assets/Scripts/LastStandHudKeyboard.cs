using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace SingedTerra.LastStand
{
    // The dedicated Canvas has one transient focus owner. Availability and
    // visual order come from the actual Buttons after the shared layout; only
    // the existing StandaloneInputModule submits their original callbacks.
    public sealed class LastStandHudKeyboard : MonoBehaviour
    {
        public bool TrapFocus { get; set; }
        public Action Escape { get; set; }
        public Action<string> ScrollContent { get; set; }
        public Func<bool> CanScrollContent { get; set; }
        bool ScrollAvailable=>TrapFocus||CanScrollContent?.Invoke()==true;
        Button[] actions;
        GameObject priorSelection;
        bool phaseChanged;
        Action<Button> revealSelection;
        readonly List<Button> ordered = new List<Button>();
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void JS_Eval_EvalJS(string script);
#endif
        public void Initialize(Button[] controls, Action<Button> reveal = null)
        { actions = controls; revealSelection = reveal; }
        public void Focus(Button button)
        {
            if (EventSystem.current && button && button.IsActive() && button.IsInteractable())
                EventSystem.current.SetSelectedGameObject(button.gameObject);
        }
        public void Selected(Button button)
        { if (button && button.IsActive() && button.IsInteractable()) revealSelection?.Invoke(button); }
        Vector3 LayoutPosition(Button button)
        {
            var point = transform.InverseTransformPoint(button.transform.position);
            var scroll = button.GetComponentInParent<ScrollRect>();
            if (scroll && button.transform.IsChildOf(scroll.content))
                // Native scrolling reveals a selected card without changing
                // the shared Canvas traversal halfway through Tab.
                point -= transform.InverseTransformVector(scroll.content.parent.TransformVector(
                    new Vector3(0,scroll.content.anchoredPosition.y,0)));
            return point;
        }
        public void BeforeRefresh(bool changed)
        {
            priorSelection = null; phaseChanged = changed; var events = EventSystem.current; if (!events) return;
            foreach (var button in actions) if (events.currentSelectedGameObject == button.gameObject)
            { priorSelection = button.gameObject; break; }
        }
        public void Refresh()
        {
            ordered.Clear();
            foreach (var button in actions)
            {
                button.navigation = new Navigation { mode = Navigation.Mode.None };
                if (button.IsActive() && button.IsInteractable()) ordered.Add(button);
            }
            ordered.Sort((a,b) =>
            {
                var x = LayoutPosition(a); var y = LayoutPosition(b);
                return Mathf.Abs(x.y-y.y) > .01f ? y.y.CompareTo(x.y) : x.x.CompareTo(y.x);
            });
            for (int i = 0; i < ordered.Count; i++)
            {
                var previous = ordered[Math.Max(0,i-1)]; var next = ordered[Math.Min(ordered.Count-1,i+1)];
                ordered[i].navigation = new Navigation { mode = Navigation.Mode.Explicit,
                    selectOnUp = previous, selectOnLeft = previous, selectOnDown = next, selectOnRight = next };
            }
            var events = EventSystem.current; var prior = priorSelection; priorSelection = null;
            if (!events) return;
            if (prior)
            {
                bool current = ordered.Exists(button=>button.gameObject == prior);
                if (phaseChanged || !current)
                    events.SetSelectedGameObject(ordered.Count > 0 ? ordered[0].gameObject : null);
                else if (!events.currentSelectedGameObject) events.SetSelectedGameObject(prior);
            }
            phaseChanged = false;
            if (!events.currentSelectedGameObject) return;
            foreach (var button in actions)
                if (events.currentSelectedGameObject == button.gameObject && !ordered.Contains(button))
                { events.SetSelectedGameObject(ordered.Count > 0 ? ordered[0].gameObject : null); break; }
        }
        [UnityEngine.Scripting.Preserve] // WebGL shell calls this by SendMessage name.
        public void NavigateKeyboard(string direction)
        {
            var events = EventSystem.current; if (!events || actions == null) return;
            if(direction=="scroll-up" || direction=="scroll-down" || direction=="scroll-start" || direction=="scroll-end")
            { if(ScrollAvailable)ScrollContent?.Invoke(direction);return; }
            Refresh();
            if (direction == "leave") { events.SetSelectedGameObject(null); return; }
            int index = ordered.FindIndex(button => button.gameObject == events.currentSelectedGameObject);
            bool backwards = direction == "previous" || direction == "enter-last";
            int next = direction == "enter-first" ? 0 : direction == "enter-last" ? ordered.Count-1 :
                index < 0 ? backwards ? ordered.Count-1 : 0 : index + (backwards ? -1 : 1);
            if (next >= 0 && next < ordered.Count) { events.SetSelectedGameObject(ordered[next].gameObject); return; }
            if (TrapFocus && ordered.Count > 0) { events.SetSelectedGameObject(ordered[backwards ? ordered.Count-1 : 0].gameObject); return; }
            events.SetSelectedGameObject(null);
#if UNITY_WEBGL && !UNITY_EDITOR
            // Constant DOM focus notification only. No player/state input is
            // interpolated and native Return keeps its existing href/action.
            JS_Eval_EvalJS("window.dispatchEvent(new Event('st-last-stand-keyboard-exit'));");
#endif
        }
        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape)) Escape?.Invoke();
            if(ScrollAvailable)
            {
                if(Input.GetKeyDown(KeyCode.PageUp))NavigateKeyboard("scroll-up");
                if(Input.GetKeyDown(KeyCode.PageDown))NavigateKeyboard("scroll-down");
                if(Input.GetKeyDown(KeyCode.Home))NavigateKeyboard("scroll-start");
                if(Input.GetKeyDown(KeyCode.End))NavigateKeyboard("scroll-end");
            }
#if !UNITY_WEBGL || UNITY_EDITOR
            // WebGL Tab is delivered once by the native navigation shell.
            if (Input.GetKeyDown(KeyCode.Tab)) NavigateKeyboard(Input.GetKey(KeyCode.LeftShift) ||
                Input.GetKey(KeyCode.RightShift) ? "previous" : "next");
#endif
        }
    }
}
