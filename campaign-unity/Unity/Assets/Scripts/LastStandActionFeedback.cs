using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace SingedTerra.LastStand
{
    // One action-state treatment. Stroke and type accompany color for pointer
    // and selected/pressed feedback; disabled availability stays owner-derived.
    sealed class LastStandActionFeedback : MonoBehaviour, ISelectHandler, IDeselectHandler,
        IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler, ISubmitHandler
    {
        Button button;
        Text label;
        Outline outline;
        LastStandConsoleFrame frame;
        bool selected, hovered, pressed;
        float submitUntil = -1;
        public void Initialize(Button owner, Text text, Outline stroke, LastStandConsoleFrame material)
        { button = owner; label = text; outline = stroke; frame = material; }
        public void Refresh()
        {
            if (!button || !label || !outline) return;
            bool available = button.IsInteractable();
            outline.enabled = available && (selected || hovered || pressed);
            label.fontStyle = !available ? FontStyle.Italic : pressed ? FontStyle.BoldAndItalic :
                selected || hovered ? FontStyle.Bold : FontStyle.Normal;
            if (frame) frame.SetInteraction(available && (selected || hovered),available && pressed);
        }
        void OnDisable() { selected = hovered = pressed = false; submitUntil = -1; Refresh(); }
        void Update()
        { if (submitUntil >= 0 && Time.unscaledTime >= submitUntil) { submitUntil = -1; pressed = false; Refresh(); } }
        public void OnSubmit(BaseEventData value)
        {
            if (!button.IsActive() || !button.IsInteractable()) return;
            // Passive feedback only; Button/StandaloneInputModule keep the
            // sole Submit callback and its existing supported input bindings.
            pressed = true; submitUntil = Time.unscaledTime + button.colors.fadeDuration; Refresh();
        }
        public void OnSelect(BaseEventData value)
        {
            selected = true; Refresh();
            GetComponentInParent<LastStandHudKeyboard>()?.Selected(button);
        }
        public void OnDeselect(BaseEventData value) { selected = pressed = false; submitUntil = -1; Refresh(); }
        public void OnPointerEnter(PointerEventData value) { hovered = true; Refresh(); }
        public void OnPointerExit(PointerEventData value) { hovered = pressed = false; Refresh(); }
        public void OnPointerDown(PointerEventData value)
        { if (value.button == PointerEventData.InputButton.Left) { pressed = true; Refresh(); } }
        public void OnPointerUp(PointerEventData value) { pressed = false; Refresh(); }
    }
}
