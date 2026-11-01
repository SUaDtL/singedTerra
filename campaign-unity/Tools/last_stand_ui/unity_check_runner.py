"""One pinned Editor launch for actual imported HUD checks; no player save access."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity" / "Unity"
UNITY = Path(r"C:\Program Files\Unity 6000.3.27f2\Editor\Unity.exe")
EVIDENCE = Path(os.environ.get("ST_LS_UI_EVIDENCE", str(ROOT / "campaign-unity/Evidence/last-stand-ui")))

HASH_SCRIPT = """const fs=require('node:fs'),crypto=require('node:crypto');
const files=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))));"""


def source_hashes(paths):
    result = subprocess.run(["node", "-e", HASH_SCRIPT], input=json.dumps([str(p) for p in paths]),
                            capture_output=True, text=True, cwd=ROOT, timeout=30, check=True)
    values = json.loads(result.stdout)
    return {p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p): values[str(p)] for p in paths}


def run_checks(method, extra_inputs=()):
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
    def input_paths():
        return sorted(set((PROJECT / "Assets" / "Scripts").rglob("*.cs")) | set((PROJECT / "Assets" / "Editor").rglob("*.cs")) | set(extra_inputs))
    inputs = input_paths()
    source = source_hashes(inputs)
    unity_sha256 = source_hashes([UNITY])[str(UNITY)]
    process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8", errors="replace")
    (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT), "pid": process.pid,
        "source_sha256": source, "unity_sha256": unity_sha256}, indent=2))
    try:
        stdout, stderr = process.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        process.kill()  # Only the Editor launched here.
        stdout, stderr = process.communicate()
        (evidence / "timeout.txt").write_text(stdout + "\n" + stderr)
        raise
    content = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    after = source_hashes(input_paths())
    (evidence / "result.json").write_text(json.dumps({"exit": process.returncode, "stdout": stdout,
        "stderr": stderr, "source_unchanged": source == after,
        "log_sha256": source_hashes([log]).get(log.relative_to(ROOT).as_posix() if log.is_relative_to(ROOT) else str(log)) if log.exists() else None}, indent=2))
    if source != after:
        raise RuntimeError("HUD check source changed during the owned Editor launch")
    print("Unity evidence:", evidence)
    return process.returncode, content
