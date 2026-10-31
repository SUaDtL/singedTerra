import assert from 'node:assert/strict';
import { uptime, tmpdir } from 'node:os';
import { powershell, delay } from './lastStandJourneyHost.mjs';
import { ownedProcessIdentity, stopOwnedProcessTree, removeOwnedProfile } from './lastStandProcessOwnership.mjs';
import { resolve, join } from 'node:path';
import { writeFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { startOwnedSupervisor } from './lastStandProcessSupervisor.mjs';

// Explicit host adapters keep tests on the same implementation used by journeys.
const defaultHost={uptime,powershell,ownedProcessIdentity,resolve,writeFileSync,join,existsSync,mkdtempSync,tmpdir,spawn,delay,stopOwnedProcessTree,removeOwnedProfile,startOwnedSupervisor,readFileSync,process,Date,Buffer};
export function createLastStandNativeDriver(overrides={}) {
  const {uptime,powershell,ownedProcessIdentity,resolve,writeFileSync,join,existsSync,mkdtempSync,tmpdir,spawn,delay,stopOwnedProcessTree,removeOwnedProfile,startOwnedSupervisor,readFileSync,process,Date,Buffer}={...defaultHost,...overrides};

const ownedBrowsers = overrides.ownedBrowsers??new Set();

const ownedBrowserWindows = overrides.ownedBrowserWindows??new WeakMap();

async function implementation_closeLastStandOwnedBrowsers() {
  const errors=[];for (const close of [...ownedBrowsers])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Owned browser cleanup failed');
}


function implementation_nativeChromeArgs(profile, mode='native') {
  assert.ok(['native','shop-headless'].includes(mode),'Only the explicit Shop headless option is admitted');
  return [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost;[::1]',
    '--window-size=1616,988', ...(process.platform==='win32' && mode==='native'?[]:['--headless=new']), 'about:blank'];
}

const windowError=error=>({name:String(error?.name??'Error').slice(0,100),
  message:String(error?.message??error).slice(0,1000),stack:String(error?.stack??'').slice(0,4000)});

function implementation_retainWindowFailure(report,key,value) {
  const records=report[key]??=[];records.push(value);
  if(records.length>8){records.shift();report[key+'_dropped']=(report[key+'_dropped']??0)+1;}
}

function implementation_ownedNativeWindowSnapshot(owner, activation=null) {
  assert.equal(process.platform,'win32','Native HWND observation is unavailable on this host');
  const startedUptimeMs=Math.floor(uptime())*1000;
  assert.ok(Number.isSafeInteger(startedUptimeMs) && startedUptimeMs>0,'Native subprocess monotonic origin unavailable');
  const encoded=Buffer.from(JSON.stringify({root:owner.root,profile:owner.profile,activation,startedUptimeMs})).toString('base64');
  return JSON.parse(powershell(`$owner=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class LastStandAwayWindowProbe {

  // One noninheritable kernel object stays pinned across full CIM admission.
  // Later checks never reacquire a PID or invoke a provider while input is held.
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint GetProcessId(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", EntryPoint="QueryFullProcessImageNameW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder image, ref int size);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
  [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
  public sealed class ProcessPin : IDisposable {
    IntPtr handle; readonly uint pid; readonly string exe; long created;
    ProcessPin(IntPtr value, uint processId, string executable) { handle=value;pid=processId;exe=executable; }
    public static ProcessPin Open(uint pid, string exe) {
      if (pid == 0 || String.IsNullOrEmpty(exe)) throw new InvalidOperationException("Missing owned kernel identity");
      var handle=OpenProcess(0x101000, false, pid); // QUERY_LIMITED_INFORMATION | SYNCHRONIZE
      if (handle == IntPtr.Zero) throw new InvalidOperationException("Owned process handle unavailable");
      var pin=new ProcessPin(handle,pid,exe);
      try {
        long exited, kernel, user;
        if (!GetProcessTimes(handle,out pin.created,out exited,out kernel,out user) || !pin.Check())
          throw new InvalidOperationException("Owned kernel identity mismatch");
        return pin;
      } catch { pin.Dispose(); throw; }
    }
    public bool Check() {
      long fresh, exited, kernel, user; var image=new StringBuilder(32768); int size=image.Capacity;
      return handle != IntPtr.Zero && WaitForSingleObject(handle,0) == 258 && GetProcessId(handle) == pid &&
        GetProcessTimes(handle,out fresh,out exited,out kernel,out user) && fresh == created &&
        QueryFullProcessImageName(handle,0,image,ref size) && String.Equals(image.ToString(),exe,StringComparison.OrdinalIgnoreCase);
    }
    public void Dispose() {
      if (handle == IntPtr.Zero) return;
      if (!CloseHandle(handle)) throw new InvalidOperationException("Owned process handle release failed");
      handle=IntPtr.Zero;
    }
  }
  public static bool CanBeginInput(ulong startedUptimeMs) {
    ulong now=GetTickCount64();
    // Node/libuv uptime and this clock share GetTickCount64 on Windows.
    // Floor at the parent is conservative and includes spawn/Add-Type/admission.
    // Reserve at least two seconds of the unchanged ten-second subprocess bound.
    return startedUptimeMs > 0 && now >= startedUptimeMs && now-startedUptimeMs < 8000;
  }
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GuiInfo {
    public uint Size, Flags; public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret; public Rect CaretRect;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MouseInput {
    public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KeyboardInput {
    public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct HardwareInput { public uint Message; public ushort Low, High; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
    [FieldOffset(0)] public MouseInput Mouse;
    [FieldOffset(0)] public KeyboardInput Keyboard;
    [FieldOffset(0)] public HardwareInput Hardware;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint Type; public InputUnion Data; }
  public class CaptionProof {
    public string status, hwnd, rootHwnd, capture; public uint pid, rootPid;
    public int x, y, hitTest; public bool keysClear, rechecked;
    public string stage; public bool cursorMeasured, contextVerified, desktopUnchanged, geometryUnchanged;
  }
  public class Geometry { public int left, top, width, height; }
  public class Mapping { public int x, y; }
  public class OwnedPresentationProof {
    public string method = "owned-HWND_TOPMOST/HWND_NOTOPMOST/SWP_NOACTIVATE/NOMOVE/NOSIZE/NOOWNERZORDER";
    public bool attempted, applied, restored, normalBefore, normalAfter, ownerTreeVerified;
    public string restoreError; public CaptionProof[] normalProbes;
  }
  public class ActivationOutcome {
    public string status, reason; public bool attempted, accepted;
    public object placement, inputState, input, snapshot;
    public CaptionProof caption; public CaptionProof[] probes; public PhysicalProof physical;
  }
  public class PhysicalProof {
    public string context = "PER_MONITOR_AWARE_V2";
    public bool entered, verified, restored; public Geometry geometry, desktop; public Mapping mapping;
    public uint moveSent, downSent, upSent; public CaptionProof beforeDown, beforeUp;
    public OwnedPresentationProof presentation;
  }
  public delegate bool MonitorProc(IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorProc callback, IntPtr parameter);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
  [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPhysicalPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr64(IntPtr window, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong32(IntPtr window, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] input, int size);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetPhysicalCursorPos(out Point point);
  static bool PhysicalContext() {
    return AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), new IntPtr(-4));
  }
  static Geometry PhysicalDesktop() {
    int count = 0, left = Int32.MaxValue, top = Int32.MaxValue, right = Int32.MinValue, bottom = Int32.MinValue;
    bool invalid = false;
    bool observed = EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr parameter) => {
      if (++count > 16 || rect.Right <= rect.Left || rect.Bottom <= rect.Top) { invalid = true; return false; }
      left = Math.Min(left, rect.Left); top = Math.Min(top, rect.Top);
      right = Math.Max(right, rect.Right); bottom = Math.Max(bottom, rect.Bottom); return true;
    }, IntPtr.Zero);
    long width = (long)right-left, height = (long)bottom-top;
    if (!observed || invalid || count == 0 || width <= 1 || height <= 1 || width > 65536 || height > 65536) return null;
    return new Geometry { left = left, top = top, width = (int)width, height = (int)height };
  }
  static bool SameGeometry(Geometry first, Geometry second) {
    return first != null && second != null && first.left == second.left && first.top == second.top &&
      first.width == second.width && first.height == second.height;
  }
  public static Mapping MapPhysicalPoint(Geometry desktop, int x, int y) {
    // Normalized virtual-desktop endpoints; subtract signed origins before scaling.
    // Ambiguous subpixel desktops refuse. Actual GetPhysicalCursorPos is still required after the move.
    if (desktop == null || desktop.width <= 1 || desktop.height <= 1 || desktop.width > 65536 || desktop.height > 65536 ||
        x < desktop.left || y < desktop.top || (long)x >= (long)desktop.left+desktop.width || (long)y >= (long)desktop.top+desktop.height) return null;
    return new Mapping { x = (int)Math.Round(((long)x-desktop.left)*65535.0/(desktop.width-1), MidpointRounding.AwayFromZero),
      y = (int)Math.Round(((long)y-desktop.top)*65535.0/(desktop.height-1), MidpointRounding.AwayFromZero) };
  }
  static bool ValidWindow(uint owner, IntPtr window, int left, int top, int width, int height, bool temporaryTopmost = false) {
    uint pid; GetWindowThreadProcessId(window, out pid); Rect rect;
    var kind = new StringBuilder(128); GetClassName(window, kind, kind.Capacity);
    long style = IntPtr.Size == 8 ? GetWindowLongPtr64(window, -20).ToInt64() : GetWindowLong32(window, -20);
    return pid == owner && IsWindowVisible(window) && !IsIconic(window) && (style & 8) == (temporaryTopmost ? 8 : 0) &&
      kind.ToString() == "Chrome_WidgetWin_1" && GetWindowRect(window, out rect) &&
      rect.Left == left && rect.Top == top && rect.Right-rect.Left == width && rect.Bottom-rect.Top == height;
  }
  static bool InputStateClear(out string capture, out int[] pressed) {
    var info = new GuiInfo { Size = (uint)Marshal.SizeOf(typeof(GuiInfo)) };
    capture = "unavailable"; var keys = new List<int>();
    if (!GetGUIThreadInfo(0, ref info)) { pressed = keys.ToArray(); return false; }
    capture = info.Capture.ToInt64().ToString();
    foreach (int key in new int[] { 1, 2, 4, 5, 6, 16, 17, 18, 91, 92 })
      if ((GetAsyncKeyState(key) & 0x8000) != 0) keys.Add(key);
    pressed = keys.ToArray(); return info.Capture == IntPtr.Zero && keys.Count == 0;
  }
  static CaptionProof ProbeCaption(uint owner, IntPtr window, int x, int y) {
    var proof = new CaptionProof { status = "covered", hwnd = window.ToInt64().ToString(), pid = owner,
      x = x, y = y, capture = "unchecked", hitTest = 0 };
    var root = GetAncestor(WindowFromPhysicalPoint(new Point { X = x, Y = y }), 2); uint pid;
    GetWindowThreadProcessId(root, out pid); proof.rootHwnd = root.ToInt64().ToString(); proof.rootPid = pid;
    if (root != window || pid != owner) return proof;
    proof.status = "noncaption";
    if (x < Int16.MinValue || x > Int16.MaxValue || y < Int16.MinValue || y > Int16.MaxValue) {
      proof.status = "coordinate-unavailable"; return proof;
    }
    UIntPtr hit;
    var packed = new IntPtr(unchecked((int)(((uint)(ushort)y << 16) | (ushort)x)));
    // WM_NCHITTEST, exact HWND, SMTO_ABORTIFHUNG|SMTO_ERRORONEXIT; never broadcast.
    if (SendMessageTimeoutW(window, 0x84, UIntPtr.Zero, packed, 0x22, 200, out hit) == IntPtr.Zero) {
      proof.status = "hit-test-unavailable"; return proof;
    }
    proof.hitTest = unchecked((int)hit.ToUInt64());
    if (proof.hitTest == 2) proof.status = "proved"; // HTCAPTION only.
    return proof;
  }
  public static object Activate(uint owner, string handle, int left, int top, int width, int height, Func<bool> identity, Func<bool> inputBudget = null) {
    var physical = new PhysicalProof(); IntPtr previous = IntPtr.Zero;
    try { previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) {
      return new { status = "refused", reason = "physical-API-unavailable", attempted = false, accepted = false, physical = physical };
    }
    try {
      // Microsoft documents PMv2 raw pixels and reversible thread-only context. CDP bounds remain a separate documentary binding.
      physical.entered = previous != IntPtr.Zero;
      physical.verified = physical.entered && PhysicalContext();
      if (!physical.verified) return new { status = "refused", reason = "physical-DPI-context-unavailable", attempted = false, accepted = false, physical = physical };
      Rect rect;
      if (GetWindowRect(new IntPtr(Int64.Parse(handle)), out rect)) physical.geometry = new Geometry {
        left = rect.Left, top = rect.Top, width = rect.Right-rect.Left, height = rect.Bottom-rect.Top };
      physical.desktop = PhysicalDesktop();
      return ActivatePhysical(owner, handle, left, top, width, height, identity, physical, inputBudget);
    } finally {
      if (previous != IntPtr.Zero) physical.restored = SetThreadDpiAwarenessContext(previous) != IntPtr.Zero &&
        AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), previous);
      if (physical.entered && !physical.restored) throw new InvalidOperationException("Previous thread DPI context restoration failed");
    }
  }
  static CaptionProof ReprovePhysical(uint owner, IntPtr window, Geometry geometry, PhysicalProof physical, int x, int y, Func<bool> identity, bool release, string stage) {
    Point cursor;
    bool prepared = physical.presentation != null && physical.presentation.applied && !physical.presentation.restored;
    if (!identity() || !PhysicalContext() || !ValidWindow(owner, window, geometry.left, geometry.top, geometry.width, geometry.height, prepared) ||
        !SameGeometry(physical.desktop, PhysicalDesktop()) || !GetPhysicalCursorPos(out cursor) || cursor.X != x || cursor.Y != y) return null;
    var proof = ProbeCaption(owner, window, cursor.X, cursor.Y);
    if (proof.status != "proved") return null;
    string capture; int[] pressed;
    if (!release) {
      proof.keysClear = InputStateClear(out capture, out pressed); proof.capture = capture;
      if (!proof.keysClear) return null;
    } else {
      var info = new GuiInfo { Size = (uint)Marshal.SizeOf(typeof(GuiInfo)) };
      if (!GetGUIThreadInfo(0, ref info) || (info.Capture != IntPtr.Zero && info.Capture != window)) return null;
      foreach (int key in new int[] { 2, 4, 5, 6, 16, 17, 18, 91, 92 })
        if ((GetAsyncKeyState(key) & 0x8000) != 0) return null;
      proof.capture = info.Capture.ToInt64().ToString(); proof.keysClear = true;
    }
    proof.rechecked = true; proof.cursorMeasured = true; proof.contextVerified = true;
    proof.geometryUnchanged = true; proof.desktopUnchanged = true; proof.stage = stage; return proof;
  }
  static bool OwnedPresentationTree(uint owner, IntPtr window) {
    if (GetAncestor(window, 3) != window) return false;
    bool owned = true;
    bool observed = EnumWindows((candidate, parameter) => {
      if (GetAncestor(candidate, 3) == window) {
        uint pid; GetWindowThreadProcessId(candidate, out pid);
        if (pid != owner) { owned = false; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return observed && owned;
  }
  static object ActivatePhysical(uint owner, string handle, int left, int top, int width, int height, Func<bool> identity, PhysicalProof physical, Func<bool> inputBudget) {
    var result = ActivateCaption(owner, handle, left, top, width, height, identity, physical, false, inputBudget);
    if (result.reason != "no-uncovered-owned-caption" || result.attempted) return result;
    var window = new IntPtr(Int64.Parse(handle));
    var preparation = new OwnedPresentationProof { normalProbes = result.probes };
    physical.presentation = preparation;
    preparation.normalBefore = identity() && PhysicalContext() &&
      ValidWindow(owner, window, left, top, width, height) && SameGeometry(physical.desktop, PhysicalDesktop());
    preparation.ownerTreeVerified = preparation.normalBefore && OwnedPresentationTree(owner, window);
    if (!preparation.ownerTreeVerified) { result.reason = "owned-presentation-precondition-rejected"; return result; }
    try {
      // Synchronous, owned-only exposure; no foreground authority and no geometry change.
      // A successful API return is insufficient: the actual temporary style must be observed.
      preparation.attempted = true;
      bool placed = SetWindowPos(window, new IntPtr(-1), 0, 0, 0, 0, 0x213);
      preparation.applied = placed && identity() && PhysicalContext() && OwnedPresentationTree(owner, window) &&
        ValidWindow(owner, window, left, top, width, height, true) && SameGeometry(physical.desktop, PhysicalDesktop());
      if (!preparation.applied) result.reason = "owned-presentation-preparation-rejected";
      else result = ActivateCaption(owner, handle, left, top, width, height, identity, physical, true, inputBudget);
    } finally {
      // Restore only the same still-owned HWND. A refusal/error cannot become accepted activation.
      bool restoreAccepted = false;
      try {
        if (preparation.attempted && identity() && OwnedPresentationTree(owner, window) &&
            (ValidWindow(owner, window, left, top, width, height) || ValidWindow(owner, window, left, top, width, height, true)))
          restoreAccepted = SetWindowPos(window, new IntPtr(-2), 0, 0, 0, 0, 0x213);
      } catch (Exception error) { preparation.restoreError = error.Message; }
      preparation.normalAfter = identity() && PhysicalContext() && OwnedPresentationTree(owner, window) &&
        ValidWindow(owner, window, left, top, width, height) && SameGeometry(physical.desktop, PhysicalDesktop());
      preparation.restored = restoreAccepted && preparation.normalAfter;
      if (!preparation.restored) {
        result.accepted = false; result.status = result.attempted ? "rejected" : "refused";
        result.reason = "owned-presentation-restoration-rejected";
      }
      result.snapshot = Read(owner);
    }
    if (result.accepted) {
      uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
      if (GetForegroundWindow() != window || foregroundPid != owner) {
        result.accepted = false; result.status = "rejected"; result.reason = "native-foreground-after-restoration-rejected";
      }
    }
    return result;
  }
  static ActivationOutcome ActivateCaption(uint owner, string handle, int left, int top, int width, int height, Func<bool> identity, PhysicalProof physical, bool prepared, Func<bool> inputBudget) {
    var window = new IntPtr(Int64.Parse(handle)); var probes = new List<CaptionProof>();
    CaptionProof caption = null; bool placed = false, placementAttempted = false, attempted = false, balanced = true;
    uint sent = 0, cleanupSent = 0; int size = Marshal.SizeOf(typeof(Input)), expectedSize = IntPtr.Size == 8 ? 40 : 28;
    string capture = "unchecked"; int[] pressed = new int[0];
    Func<string, bool, ActivationOutcome> finish = (reason, accepted) => new ActivationOutcome { status = accepted ? "accepted" : (attempted ? "rejected" : "refused"),
      reason = reason, attempted = attempted, accepted = accepted,
      placement = new { attempted = placementAttempted, accepted = placed, method = prepared ? "tracked-owned-temporary-presentation" : "HWND_TOP/SWP_NOACTIVATE/NOMOVE/NOSIZE/NOOWNERZORDER/ASYNCWINDOWPOS" },
      caption = caption, probes = probes.ToArray(), physical = physical,
      inputState = new { capture = capture, pressed = pressed },
      input = new { size = size, expectedSize = expectedSize, count = 3, sent = sent, balanced = balanced, cleanupSent = cleanupSent }, snapshot = Read(owner) };
    if (!identity() || !ValidWindow(owner, window, left, top, width, height, prepared)) return finish("stale-owned-window", false);
    // Refuse different coordinate descriptions; never scale CDP or DWM bounds heuristically.
    if (!SameGeometry(physical.geometry, new Geometry { left = left, top = top, width = width, height = height }) || physical.desktop == null)
      return finish("physical-geometry-or-desktop-unavailable", false);
    if (!InputStateClear(out capture, out pressed)) return finish("capture-or-held-input-state", false);
    if (size != expectedSize) return finish("native-INPUT-layout-unavailable", false);
    // This bounded normal placement preserves geometry and never grants foreground authority.
    placementAttempted = true;
    placed = prepared || SetWindowPos(window, IntPtr.Zero, 0, 0, 0, 0, 0x4213);
    if (!placed) return finish("normal-owned-placement-rejected", false);
    System.Threading.Thread.Sleep(100);
    if (!identity() || !ValidWindow(owner, window, left, top, width, height, prepared)) return finish("stale-after-placement", false);
    foreach (int yOffset in new int[] { 16, 24, 36, 48 }) {
      foreach (int percent in new int[] { 50, 65, 80 }) {
        int x = left + width * percent / 100, y = top + yOffset;
        if (y >= top + height) continue;
        var probe = ProbeCaption(owner, window, x, y); probes.Add(probe);
        if (probe.status == "proved") { caption = probe; break; }
      }
      if (caption != null) break;
    }
    if (caption == null) return finish("no-uncovered-owned-caption", false);
    physical.mapping = MapPhysicalPoint(physical.desktop, caption.x, caption.y);
    if (physical.mapping == null)
      return finish("caption-screen-coordinate-unavailable", false);
    var move = new Input[1];
    move[0].Data.Mouse = new MouseInput { X = physical.mapping.x, Y = physical.mapping.y, Flags = 0xC001 };
    // Recheck process/profile, exact geometry, point/root/HTCAPTION and global input state immediately before input.
    if (!identity() || !PhysicalContext() || !SameGeometry(physical.desktop, PhysicalDesktop()) ||
        !ValidWindow(owner, window, left, top, width, height, prepared)) return finish("stale-before-input", false);
    caption = ProbeCaption(owner, window, caption.x, caption.y);
    if (caption.status != "proved") return finish("caption-changed-before-input", false);
    caption.keysClear = InputStateClear(out capture, out pressed); caption.capture = capture;
    if (!caption.keysClear) return finish("capture-or-held-input-before-input", false);
    if (inputBudget != null && !inputBudget()) return finish("native-input-budget-exhausted", false);
    caption.rechecked = true; attempted = true;
    physical.moveSent = SendInput(1, move, size); sent = physical.moveSent;
    if (physical.moveSent != 1) return finish("native-move-count-rejected", false);
    // No button event is possible until the actual physical cursor and exact owned caption are re-proven after moving.
    physical.beforeDown = ReprovePhysical(owner, window, physical.geometry, physical, caption.x, caption.y, identity, false, "before-down");
    if (physical.beforeDown == null) return finish("post-move-physical-proof-rejected", false);
    if (inputBudget != null && !inputBudget()) return finish("native-input-budget-exhausted", false);
    var down = new Input[1]; down[0].Data.Mouse.Flags = 2;
    physical.downSent = SendInput(1, down, size); sent += physical.downSent; balanced = physical.downSent == 0;
    if (physical.downSent != 1) return finish("native-down-count-rejected", false);
    try {
      physical.beforeUp = ReprovePhysical(owner, window, physical.geometry, physical, caption.x, caption.y, identity, true, "before-up");
      if (physical.beforeUp != null) {
        var up = new Input[1]; up[0].Data.Mouse.Flags = 4;
        physical.upSent = SendInput(1, up, size); sent += physical.upSent; balanced = physical.upSent == 1;
      }
    } finally {
      // Release only this call's inserted down and only after the same physical ownership/caption/capture proof.
      if (!balanced && ReprovePhysical(owner, window, physical.geometry, physical, caption.x, caption.y, identity, true, "cleanup-up") != null) {
        var release = new Input[1]; release[0].Data.Mouse.Flags = 4;
        cleanupSent = SendInput(1, release, size); balanced = cleanupSent == 1;
      }
    }
    if (sent != 3) return finish("native-input-count-rejected", false);
    for (int wait = 0; wait < 50 && GetForegroundWindow() != window; wait++) System.Threading.Thread.Sleep(10);
    uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
    bool verified = GetForegroundWindow() == window && foregroundPid == owner;
    return finish(verified ? "exact-owned-caption-foreground" : "native-foreground-verification-rejected", verified);
  }
  public static object Read(uint owner) {
    var windows = new List<object>(); int dropped = 0;
    EnumWindows((window, parameter) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == owner) {
        if (windows.Count == 12) { dropped++; return true; }
        Rect rect; bool measured = GetWindowRect(window, out rect);
        var kind = new StringBuilder(128); GetClassName(window, kind, kind.Capacity);
        windows.Add(new { hwnd = window.ToInt64().ToString(), pid = pid,
          visible = IsWindowVisible(window), minimized = IsIconic(window), measured = measured,
          kind = kind.ToString(), left = rect.Left, top = rect.Top,
          width = rect.Right - rect.Left, height = rect.Bottom - rect.Top });
      }
      return true;
    }, IntPtr.Zero);
    var foreground = GetForegroundWindow(); uint foregroundPid;
    GetWindowThreadProcessId(foreground, out foregroundPid);
    return new { windows = windows.ToArray(), dropped = dropped,
      foreground = new { hwnd = foreground.ToInt64().ToString(), pid = foregroundPid } };
  }
}
'@
    $pin=[LastStandAwayWindowProbe+ProcessPin]::Open($owner.root.pid,$owner.root.exe)
    try {
      # The same live kernel object spans this exact start/exe/profile admission.
    $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owner.root.pid)
    if(-not $current -or $current.CreationDate.ToUniversalTime().ToString('o') -ne $owner.root.start -or $current.ExecutablePath -ne $owner.root.exe){throw 'Owned native process identity mismatch'}
    $argument='--user-data-dir='+$owner.profile
    if(-not ($current.CommandLine.Contains('"'+$argument+'"') -or $current.CommandLine.Split(' ').Contains($argument))){throw 'Owned native profile mismatch'}
      if(-not $pin.Check()){throw 'Owned process exited or changed during admission'}
      if($owner.activation){
        $a=$owner.activation
        $identityCheck={return $pin.Check()}
        $inputBudget={return [LastStandAwayWindowProbe]::CanBeginInput($owner.startedUptimeMs)}
        [LastStandAwayWindowProbe]::Activate($owner.root.pid,$a.hwnd,$a.left,$a.top,$a.width,$a.height,[Func[bool]]$identityCheck,[Func[bool]]$inputBudget)|ConvertTo-Json -Depth 8 -Compress
      } else {[LastStandAwayWindowProbe]::Read($owner.root.pid)|ConvertTo-Json -Depth 5 -Compress}
    } finally {$pin.Dispose()}`));
}

// Passive observations precede auxiliary cleanup. Each document is sampled in
// sequence; native foreground is not an inference about document focus.
async function implementation_retainAwayFailure({native,page,other,kind,report,output,error,capture=null}) {
  const record={stage:'before-aux-cleanup',kind,observed_at_utc:new Date().toISOString(),
    primary_error:windowError(error),capture,ownership:{status:'refused'},native:{status:'unavailable'},
    original:{status:'unavailable'},auxiliary:{status:'unavailable'},diagnostic_errors:[]};
  retainWindowFailure(report,'window_failures',record);
  let owner;
  try {
    owner=ownedBrowserWindows.get(native?.browser);
    assert.ok(owner && owner.context===native.context,'Task-created browser ownership mismatch');
    assert.equal(page.context(),owner.context,'Original page ownership mismatch');
    assert.equal(other.context(),owner.context,'Auxiliary page ownership mismatch');
    assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
    if(output)assert.equal(resolve(output),resolve(owner.output),'Owned diagnostic output mismatch');
    record.ownership={status:'bound',root:owner.root,profile:owner.profile,executable:owner.executable};
  } catch(failure){record.diagnostic_errors.push({scope:'ownership',...windowError(failure)});return record;}
  let browserSession;
  try {
    browserSession=await native.browser.newBrowserCDPSession();
    for(const [name,target]of [['original',page],['auxiliary',other]]) {
      let session;
      try {
        session=await native.context.newCDPSession(target);
        const {targetInfo}=await session.send('Target.getTargetInfo');
        const window=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
        const document=await target.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
          visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin,
          url:location.href.slice(0,500),title:document.title.slice(0,200)}));
        record[name]={status:'observed',target:{targetId:targetInfo.targetId,type:targetInfo.type,
          browserContextId:targetInfo.browserContextId??null,url:targetInfo.url.slice(0,500)},
          window,document:{...document,closed:target.isClosed()}};
      } catch(failure){record.diagnostic_errors.push({scope:name,...windowError(failure)});}
      finally {if(session)await session.detach().catch(failure=>record.diagnostic_errors.push({scope:name+'-detach',...windowError(failure)}));}
    }
  } catch(failure){record.diagnostic_errors.push({scope:'browser-session',...windowError(failure)});}
  finally {if(browserSession)await browserSession.detach().catch(failure=>record.diagnostic_errors.push({scope:'browser-session-detach',...windowError(failure)}));}
  try {
    record.native={status:'observed',...ownedNativeWindowSnapshot(owner)};
    for(const name of ['original','auxiliary']) {
      const item=record[name],bounds=item.window?.bounds;
      const matches=record.native.windows.filter(candidate=>bounds && candidate.kind==='Chrome_WidgetWin_1' && candidate.measured &&
        candidate.left===bounds.left && candidate.top===bounds.top && candidate.width===bounds.width && candidate.height===bounds.height);
      item.native_window=matches.length===1?{status:'bound',window:matches[0]}:
        {status:'unavailable',reason:'No unique owned HWND matches observed CDP bounds',matches:matches.length};
    }
  } catch(failure){record.diagnostic_errors.push({scope:'native-window',...windowError(failure)});}
  writeFileSync(join(owner.output,'window-failure-before-cleanup.json'),JSON.stringify({window_failures:report.window_failures},null,2));
  return record;
}

async function implementation_cleanupAwayAuxiliary({other,session,report,kind,primaryError}) {
  let first;
  for(const [stage,close]of [['auxiliary-close',()=>other.close()],['away-session-detach',()=>session?.detach()]]) {
    try {await close();}
    catch(error){first??=error;retainWindowFailure(report,'auxiliary_cleanup_failures',{kind,stage,...windowError(error)});}
  }
  if(first && !primaryError)throw first;
}


function implementation_bindOwnedNativeWindow(snapshot,bounds,pid) {
  assert.ok(snapshot && snapshot.dropped===0 && Array.isArray(snapshot.windows),'Complete native ownership observation required');
  assert.ok(Number.isInteger(pid) && pid>0 && bounds && bounds.windowState==='normal','Owned normal native window required');
  assert.ok(['left','top','width','height'].every(key=>Number.isInteger(bounds[key])) && bounds.width>0 && bounds.height>0,
    'Complete CDP window bounds required');
  const matches=snapshot.windows.filter(item=>item.pid===pid && item.kind==='Chrome_WidgetWin_1' &&
    item.measured && item.visible && !item.minimized && ['left','top','width','height'].every(key=>item[key]===bounds[key]));
  assert.equal(matches.length,1,'No unique visible owned HWND matches the selected CDP window');
  assert.match(matches[0].hwnd,/^[1-9][0-9]*$/,'Invalid observed owned HWND');
  return matches[0];
}

function implementation_assertOwnedNativeActivation(result,window,pid) {
  assert.ok(result?.attempted && result.accepted && result.status==='accepted',
    `Owned native foreground capability rejected: ${result?.reason??result?.status??'unavailable'}`);
  const proof=result.caption,input=result.input;
  assert.ok(proof?.status==='proved' && proof.rechecked && proof.keysClear && proof.capture==='0',
    'Owned caption proof or clear native input state unavailable');
  assert.equal(proof.hitTest,2,'Actual native point must be HTCAPTION');
  assert.equal(proof.hwnd,window.hwnd,'Caption HWND is not the selected owned window');
  assert.equal(proof.pid,pid,'Caption PID ownership mismatch');
  assert.equal(proof.rootHwnd,window.hwnd,'Actual WindowFromPoint/GetAncestor is covered or unowned');
  assert.equal(proof.rootPid,pid,'Actual point root PID ownership mismatch');
  assert.ok(Number.isInteger(proof.x) && Number.isInteger(proof.y) && proof.x>=window.left &&
    proof.y>=window.top && proof.x<window.left+window.width && proof.y<window.top+window.height,
    'Observed caption point is outside the exact owned geometry');
  assert.ok(input && [28,40].includes(input.size) && input.size===input.expectedSize &&
    input.count===3 && input.sent===3 && input.balanced,'Exact balanced native INPUT layout/count required');
  const physical=result.physical;
  assert.ok(physical?.context==='PER_MONITOR_AWARE_V2' && physical.entered && physical.verified && physical.restored,
    'Verified and restored physical thread DPI context required');
  if(physical.presentation) {
    assert.ok(physical.presentation.attempted && physical.presentation.normalBefore &&
      physical.presentation.ownerTreeVerified && physical.presentation.applied &&
      physical.presentation.restored && physical.presentation.normalAfter && !physical.presentation.restoreError,
    'Tracked owned presentation must start normal, expose only owned windows and restore normal before acceptance');
  }
  assert.ok(physical.geometry && ['left','top','width','height'].every(key=>
    Number.isInteger(physical.geometry[key]) && physical.geometry[key]===window[key]),
  'Physical window geometry must match the separately bound owned window');
  const desktop=physical.desktop,mapping=physical.mapping;
  assert.ok(desktop && ['left','top','width','height'].every(key=>Number.isInteger(desktop[key])) &&
    desktop.width>1 && desktop.height>1 && desktop.width<=65536 && desktop.height<=65536 &&
    proof.x>=desktop.left && proof.y>=desktop.top && proof.x<desktop.left+desktop.width && proof.y<desktop.top+desktop.height,
  'Unambiguous physical virtual desktop and contained point required');
  assert.ok(mapping && Number.isInteger(mapping.x) && Number.isInteger(mapping.y) &&
    mapping.x===Math.round((proof.x-desktop.left)*65535/(desktop.width-1)) &&
    mapping.y===Math.round((proof.y-desktop.top)*65535/(desktop.height-1)),
  'Physical absolute mapping must include signed virtual desktop origins');
  assert.ok(physical.moveSent===1 && physical.downSent===1 && physical.upSent===1,
    'Separately verified physical move/down/up counts required');
  for(const [key,stage]of [['beforeDown','before-down'],['beforeUp','before-up']]) {
    const point=physical[key];
    assert.ok(point?.status==='proved' && point.stage===stage && point.cursorMeasured && point.contextVerified &&
      point.desktopUnchanged && point.geometryUnchanged && point.keysClear && point.rechecked,
    'Fresh actual physical cursor proof required immediately '+stage);
    assert.ok(point.x===proof.x && point.y===proof.y && point.hwnd===window.hwnd && point.pid===pid &&
      point.rootHwnd===window.hwnd && point.rootPid===pid && point.hitTest===2 &&
      (point.capture==='0' || (key==='beforeUp' && point.capture===window.hwnd)),
    'Physical cursor must remain at the exact owned HTCAPTION with only owned release capture');
  }
  const observed=bindOwnedNativeWindow(result.snapshot,{...window,windowState:'normal'},pid);
  assert.equal(observed.hwnd,window.hwnd,'Owned HWND changed during native activation');
  assert.equal(result.snapshot.foreground?.pid,pid,'Owned native foreground PID verification failed');
  assert.equal(result.snapshot.foreground?.hwnd,window.hwnd,'Owned native foreground HWND verification failed');
}

async function implementation_waitForOwnedNativeForeground({owner,page,session,browserSession,record}) {
  record.documentBefore=await page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
    visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin}));
  assert.ok(Number.isFinite(record.documentBefore.timeOrigin) && record.documentBefore.timeOrigin>0 &&
    Number.isFinite(record.documentBefore.t) && record.documentBefore.t>=0,'Owned document clock required');
  // Native activation can precede Chrome's real visibilitychange. Observe the
  // same document within the existing action bound; do not reactivate it.
  await page.waitForFunction(origin=>performance.timeOrigin===origin && !document.hidden &&
    document.visibilityState==='visible' && document.hasFocus(),record.documentBefore.timeOrigin,{timeout:10_000});
  record.document=await page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
    visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin}));
  assert.equal(record.document.timeOrigin,record.documentBefore.timeOrigin,'Owned document changed during foreground admission');
  assert.ok(Number.isFinite(record.document.t) && record.document.t>=record.documentBefore.t,'Owned document clock regressed');
  assert.ok(!record.document.hidden && record.document.visibility==='visible' && record.document.focused,
    'Owned original document must be visible and focused');
  assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
  const {targetInfo}=await session.send('Target.getTargetInfo');
  assert.equal(targetInfo.type,'page','Owned foreground target type changed');
  assert.equal(targetInfo.targetId,record.target.targetId,'Owned foreground target changed');
  assert.equal(targetInfo.browserContextId,record.target.browserContextId,'Owned foreground browser context changed');
  const currentWindow=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
  assert.deepEqual(currentWindow,record.cdp_window,'Owned foreground CDP window binding changed');
  record.after=ownedNativeWindowSnapshot(owner);
  const observed=bindOwnedNativeWindow(record.after,currentWindow.bounds,owner.root.pid);
  assert.equal(observed.hwnd,record.window.hwnd,'Owned foreground HWND binding changed');
  assert.equal(record.after.foreground?.pid,owner.root.pid,'Owned native foreground PID verification failed');
  assert.equal(record.after.foreground?.hwnd,record.window.hwnd,'Owned native foreground HWND verification failed');
}


async function implementation_ensureOwnedNativeForeground({native,page,report,kind,role}) {
  const record={kind,role,utc:new Date().toISOString(),status:'refused',activationNeeded:false};
  retainWindowFailure(report,'native_foreground_preconditions',record);
  let session,browserSession;
  try {
    assert.equal(process.platform,'win32','Owned native foreground capability unavailable');
    const owner=ownedBrowserWindows.get(native?.browser);
    assert.ok(owner && owner.context===native.context,'Task-created browser ownership mismatch');
    assert.equal(page.context(),owner.context,'Selected page ownership mismatch');
    assert.ok(!page.isClosed(),'Selected owned page is closed');
    assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
    record.owner={root:owner.root,profile:owner.profile,executable:owner.executable};
    session=await owner.context.newCDPSession(page);browserSession=await native.browser.newBrowserCDPSession();
    const {targetInfo}=await session.send('Target.getTargetInfo');
    assert.ok(targetInfo.type==='page' && targetInfo.targetId && targetInfo.browserContextId,'Owned page target binding unavailable');
    record.target={targetId:targetInfo.targetId,browserContextId:targetInfo.browserContextId};
    record.cdp_window=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
    assert.ok(Number.isInteger(record.cdp_window.windowId),'Actual CDP window identity required');
    record.before=ownedNativeWindowSnapshot(owner);
    record.window=bindOwnedNativeWindow(record.before,record.cdp_window.bounds,owner.root.pid);
    record.activationNeeded=record.before.foreground?.pid!==owner.root.pid || record.before.foreground?.hwnd!==record.window.hwnd;
    if(record.activationNeeded)await activateOwnedNativeWindow({native,page,report,kind,role});
    await waitForOwnedNativeForeground({owner,page,session,browserSession,record});
    record.status='verified';return record;
  } catch(error){record.error=windowError(error);throw error;}
  finally {
    for(const [scope,value]of [['foreground-page-detach',session],['foreground-browser-detach',browserSession]])
      if(value)await value.detach().catch(error=>retainWindowFailure(report,'native_activation_cleanup_failures',{scope,...windowError(error)}));
  }
}


async function implementation_activateOwnedNativeWindow({native,page,report,kind,role}) {
  const record={kind,role,utc:new Date().toISOString(),status:'refused',method:'owned-caption-SendInput',attempts:0};
  retainWindowFailure(report,'native_activations',record);
  let session,browserSession;
  try {
    assert.equal(process.platform,'win32','Owned native foreground capability unavailable');
    const owner=ownedBrowserWindows.get(native?.browser);
    assert.ok(owner && owner.context===native.context,'Task-created browser ownership mismatch');
    assert.equal(page.context(),owner.context,'Selected page ownership mismatch');
    assert.ok(!page.isClosed(),'Selected owned page is closed');
    assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
    record.owner={root:owner.root,profile:owner.profile,executable:owner.executable};
    session=await owner.context.newCDPSession(page);browserSession=await native.browser.newBrowserCDPSession();
    const {targetInfo}=await session.send('Target.getTargetInfo');
    assert.ok(targetInfo.type==='page' && targetInfo.targetId && targetInfo.browserContextId,'Owned page target binding unavailable');
    record.target={targetId:targetInfo.targetId,browserContextId:targetInfo.browserContextId};
    record.cdp_window=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
    assert.ok(Number.isInteger(record.cdp_window.windowId),'Actual CDP window identity required');
    record.before=ownedNativeWindowSnapshot(owner);
    record.window=bindOwnedNativeWindow(record.before,record.cdp_window.bounds,owner.root.pid);
    record.activation=ownedNativeWindowSnapshot(owner,record.window);
    record.attempts=record.activation.attempted?1:0;
    assertOwnedNativeActivation(record.activation,record.window,owner.root.pid);
    await waitForOwnedNativeForeground({owner,page,session,browserSession,record});
    record.status='verified';
    return record;
  } catch(error){record.error=windowError(error);throw error;}
  finally {
    for(const [scope,value]of [['selected-page-detach',session],['activation-browser-detach',browserSession]])
      if(value)await value.detach().catch(error=>retainWindowFailure(report,'native_activation_cleanup_failures',{scope,...windowError(error)}));
  }
}


async function readOwnedDevToolsPort(profile,child) {
    const active = join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 20_000;
    let port;
    while (true) {
      assert.ok(child.exitCode === null && Date.now() < deadline, 'Owned Chrome did not expose loopback CDP');
      if(existsSync(active)){
        const contents=readFileSync(active,'utf8');
        if(contents.includes('\n')){
          port=Number(contents.split('\n')[0]);
          assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid owned CDP port');
          break;
        }
      }
      await delay(50);
    }
    return port;
}

async function implementation_ownedChrome(chromium, output, mode='native', lifetimeMs=640_000) {
  const executable = process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')
    : chromium.executablePath();
  assert.ok(existsSync(executable), `Native Chromium prerequisite absent: ${executable}`);
  const profile = mkdtempSync(join(tmpdir(), 'st-ls-chrome-'));
  const args = nativeChromeArgs(profile,mode);
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: process.platform !== 'win32' });
  let log = '', browser, closed = false, supervisor, ownedRoot;
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  child.on('error', error => { log += String(error); });
  const receipt = status => writeFileSync(join(output, 'browser-profile.json'), JSON.stringify({
    profile, status, pid: child.pid, root:supervisor?.root??ownedRoot, executable, args, launch_mode:mode,
    focus: mode==='shop-headless'?'headless actual document, noDefaults:true':'native default context, noDefaults:true',
    ownership: 'task-created process and temporary profile' }, null, 2));
  const close = async () => {
    if (closed) return;
    try {
      if(browser)await Promise.race([browser.newBrowserCDPSession().then(session=>session.send('Browser.close')).catch(()=>{}),delay(2000)]);
      if(supervisor) {
        const cleanup=await supervisor.stop();writeFileSync(join(output,'browser-cleanup.json'),JSON.stringify(cleanup,null,2));
      } else {
        assert.ok(ownedRoot,'Owned startup child identity was not admitted');
        await stopOwnedProcessTree([{...ownedRoot,depth:0}]);
        removeOwnedProfile(profile);
      }
      if(browser)await Promise.race([browser.close().catch(()=>{}),delay(2000)]);
      receipt('removed');closed=true;ownedBrowsers.delete(close);if(browser)ownedBrowserWindows.delete(browser);
    } catch(error){receipt('cleanup-failed');throw error;}
    finally{writeFileSync(join(output,'native-chrome.log'),log);}
  };
  try {
    const candidate=ownedProcessIdentity(child.pid);
    assert.equal(candidate.ppid,process.pid,'Owned child ancestry mismatch');
    assert.ok(typeof candidate.exe==='string' && candidate.exe.length>0,'Owned executable identity absent');
    ownedRoot=candidate;
    receipt('active');
    supervisor=startOwnedSupervisor(child,output,profile,lifetimeMs,ownedRoot);
    receipt('active');
    ownedBrowsers.add(close);
    const port=await readOwnedDevToolsPort(profile,child);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 20_000 });
    assert.equal(browser.contexts().length, 1, 'One native default context required');
    const context=browser.contexts()[0];
    // CDP can become available before Chromium publishes its original tab.
    // Wait for that tab so every caller retains the same native page and focus.
    if(context.pages().length===0)await context.waitForEvent('page',{timeout:20_000});
    ownedBrowserWindows.set(browser,{root:supervisor.root,profile,executable,context,output});
    return { browser, context, close };
  } catch (error) {try{await close();}catch(cleanup){error.cleanup_error=String(cleanup);}throw error;}
}
  const closeLastStandOwnedBrowsers=overrides.closeLastStandOwnedBrowsers??implementation_closeLastStandOwnedBrowsers;
  const nativeChromeArgs=overrides.nativeChromeArgs??implementation_nativeChromeArgs;
  const retainWindowFailure=overrides.retainWindowFailure??implementation_retainWindowFailure;
  const ownedNativeWindowSnapshot=overrides.ownedNativeWindowSnapshot??implementation_ownedNativeWindowSnapshot;
  const retainAwayFailure=overrides.retainAwayFailure??implementation_retainAwayFailure;
  const cleanupAwayAuxiliary=overrides.cleanupAwayAuxiliary??implementation_cleanupAwayAuxiliary;
  const bindOwnedNativeWindow=overrides.bindOwnedNativeWindow??implementation_bindOwnedNativeWindow;
  const assertOwnedNativeActivation=overrides.assertOwnedNativeActivation??implementation_assertOwnedNativeActivation;
  const waitForOwnedNativeForeground=overrides.waitForOwnedNativeForeground??implementation_waitForOwnedNativeForeground;
  const ensureOwnedNativeForeground=overrides.ensureOwnedNativeForeground??implementation_ensureOwnedNativeForeground;
  const activateOwnedNativeWindow=overrides.activateOwnedNativeWindow??implementation_activateOwnedNativeWindow;
  const ownedChrome=overrides.ownedChrome??implementation_ownedChrome;
  return {readOwnedDevToolsPort,ownedBrowsers,ownedBrowserWindows,closeLastStandOwnedBrowsers,nativeChromeArgs,windowError,retainWindowFailure,ownedNativeWindowSnapshot,retainAwayFailure,cleanupAwayAuxiliary,bindOwnedNativeWindow,assertOwnedNativeActivation,waitForOwnedNativeForeground,ensureOwnedNativeForeground,activateOwnedNativeWindow,ownedChrome};
}
const defaultOwner=createLastStandNativeDriver();
export const {closeLastStandOwnedBrowsers,nativeChromeArgs,retainAwayFailure,cleanupAwayAuxiliary,bindOwnedNativeWindow,assertOwnedNativeActivation,ensureOwnedNativeForeground,activateOwnedNativeWindow,ownedChrome}=defaultOwner;
