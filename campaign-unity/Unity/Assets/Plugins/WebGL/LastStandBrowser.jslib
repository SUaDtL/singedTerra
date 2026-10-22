mergeInto(LibraryManager.library, {
  LastStandBrowser_Initialize: function() {
    if (Module.lastStandBrowserInitialized) return;
    Module.lastStandBrowserInitialized = true;
    var notify = function(state) { SendMessage('LastStandBrowserBridge', 'FullscreenChanged', state); };
    var update = function() { notify(!document.fullscreenEnabled ? 'unavailable' : document.fullscreenElement ? 'on' : 'off'); };
    document.addEventListener('fullscreenchange', update);
    // A rejected exit can leave fullscreenElement present. Send actual state
    // with the refusal so the Unity control keeps the correct Enter/Exit label.
    document.addEventListener('fullscreenerror', function() { notify(document.fullscreenElement ? 'refused-on' : 'refused-off'); });
    update();
  },
  LastStandBrowser_Fullscreen: function() {
    var notify = function(state) { SendMessage('LastStandBrowserBridge', 'FullscreenChanged', state); };
    var refused = function() { notify(document.fullscreenElement ? 'refused-on' : 'refused-off'); };
    if (!document.fullscreenEnabled) { notify('unavailable'); return; }
    try {
      var pending = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (pending && pending.catch) pending.catch(refused);
    } catch (_) { refused(); }
  },
  LastStandBrowser_Navigate: function(account) {
    window.location.assign(account === 1 ? '../#account/last-stand' : '../#campaigns/last-stand');
  }
});
