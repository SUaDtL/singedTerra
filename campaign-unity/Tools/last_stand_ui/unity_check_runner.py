"""One pinned Editor launch for actual imported HUD checks; no player save access."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity" / "Unity"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")
EVIDENCE = Path(r"C:\Users\brenn\codearbiter-review-integration-20261006\ui-t05-garage-system-20261007")


def run_checks(method):
    evidence = EVIDENCE / ("editor-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    evidence.mkdir(parents=True, exist_ok=False)
    env = os.environ.copy()
    if os.name == "nt":
        common = Path(env.get("ProgramData", "C:/ProgramData"))
        if not common.is_dir():
            raise RuntimeError("ProgramData unavailable")
        env.setdefault("ProgramData", str(common))
        env.setdefault("ALLUSERSPROFILE", str(common))
        env["ST_LS_PROJECT_CHECK"] = str(PROJECT)
        check = "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
        ownership = subprocess.run(["powershell.exe", "-NoProfile", "-Command", check], env=env,
                                   capture_output=True, text=True, timeout=30)
        if ownership.returncode:
            raise RuntimeError("Unity Editor already owns this project")
    log = evidence / "unity-editor.log"
    argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
            "-executeMethod", method, "-logFile", str(log)]
    inputs = list((PROJECT / "Assets" / "Scripts").glob("*.cs")) + [PROJECT / "Assets" / "Editor" / "LastStandHudChecks.cs"]
    source = {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8", errors="replace")
    (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT), "pid": process.pid,
        "source_sha256": source, "unity_sha256": hashlib.sha256(UNITY.read_bytes()).hexdigest()}, indent=2))
    try:
        stdout, stderr = process.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        process.kill()  # Only the Editor launched here.
        stdout, stderr = process.communicate()
        (evidence / "timeout.txt").write_text(stdout + "\n" + stderr)
        raise
    content = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    after = {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    (evidence / "result.json").write_text(json.dumps({"exit": process.returncode, "stdout": stdout,
        "stderr": stderr, "source_unchanged": source == after,
        "log_sha256": hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None}, indent=2))
    if source != after:
        raise RuntimeError("HUD check source changed during the owned Editor launch")
    print("Unity evidence:", evidence)
    return process.returncode, content
