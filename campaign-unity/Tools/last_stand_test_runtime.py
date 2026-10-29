"""Bounded execution of explicitly selected pure C# production sources.

This module owns compiler/process plumbing only. Source closure, historical
source selection, expectations and evidence ownership remain with each suite.
In particular it never fills missing legacy sources from the current tree.
"""
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import shutil
import subprocess

EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")


def discover_toolchain(environ=None, platform=None, finder=None):
    """Explicit overrides, pinned Windows Unity, then installed Mono/C# on PATH.

    Discovery never downloads tools and never turns an absent compiler into a
    skipped test. Direct executable drivers (mcs) and managed csc.exe differ.
    """
    environ = os.environ if environ is None else environ
    platform = os.name if platform is None else platform
    finder = shutil.which if finder is None else finder
    pinned_mono = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
    pinned_csc = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
    pinned = platform == "nt" and pinned_mono.is_file() and pinned_csc.is_file()
    mono = environ.get("ST_CSHARP_MONO") or (str(pinned_mono) if pinned else finder("mono"))
    compiler = environ.get("ST_CSHARP_COMPILER") or (str(pinned_csc) if pinned else finder("mcs") or finder("csc"))
    def resolve(value, label):
        if not value:
            raise RuntimeError(label + " is unavailable; install Mono/mcs or set ST_CSHARP_MONO and ST_CSHARP_COMPILER")
        path = Path(value)
        if not path.is_file():
            located = finder(str(value))
            path = Path(located) if located else path
        if not path.is_file():
            raise RuntimeError("Explicit/discovered C# tool is unavailable: " + str(value))
        return path.resolve()
    mono, compiler = resolve(mono, "Mono runtime"), resolve(compiler, "C# compiler")
    mode = environ.get("ST_CSHARP_COMPILER_MODE") or ("managed" if compiler.suffix.lower() == ".exe" else "direct")
    if mode not in ("managed", "direct"):
        raise ValueError("ST_CSHARP_COMPILER_MODE must be managed or direct")
    return mono, compiler, mode


try:
    MONO, CSC, COMPILER_MODE = discover_toolchain()
except RuntimeError:
    # Importing a caller with explicit tools must not require automatic tools.
    # Default use below repeats discovery and preserves its actionable failure.
    MONO = CSC = COMPILER_MODE = None


@dataclass(frozen=True)
class CSharpBuild:
    executable: Path
    source_sha256: dict
    argv: tuple
    stdout: str
    stderr: str


def _source_hashes(sources):
    hashes = {}
    for source in sources:
        path = Path(source)
        if not path.is_file():
            raise AssertionError(f"Declared C# source is unavailable: {path}")
        hashes[str(path.resolve())] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def compile_csharp(target, sources, *, warnings_as_errors=True,
                   timeout_seconds=60, mono=MONO, compiler=CSC, compiler_mode=None):
    """Compile only these files, rejecting source drift and stale output."""
    if timeout_seconds <= 0:
        raise ValueError("Compilation requires a positive timeout")
    target, sources = Path(target), tuple(Path(path) for path in sources)
    if not sources:
        raise ValueError("Compilation requires explicit sources")
    before = _source_hashes(sources)
    if len(before) != len(sources):
        raise ValueError("Duplicate source paths in compilation")
    if mono is None or compiler is None:
        found_mono, found_compiler, found_mode = discover_toolchain()
        mono = found_mono if mono is None else mono
        if compiler is None:
            compiler, compiler_mode = found_compiler, compiler_mode or found_mode
    for tool in (mono, compiler):
        if not Path(tool).is_file():
            raise RuntimeError(f"C# tool is unavailable: {tool}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.unlink(missing_ok=True)
    mode = compiler_mode or (COMPILER_MODE if Path(compiler) == CSC else
                             "direct" if Path(compiler).name in ("mcs", "dmcs", "gmcs", "csc") else "managed")
    if mode not in ("managed", "direct"):
        raise ValueError("Compiler mode must be managed or direct")
    argv = ([str(mono), str(compiler)] if mode == "managed" else [str(compiler)]) + ["-nologo"]
    if Path(compiler).stem in ("mcs", "dmcs", "gmcs"):
        argv.append("-langversion:latest")
    if warnings_as_errors:
        argv.append("-warnaserror+")
    argv += [f"-out:{target}", *map(str, sources)]
    result = subprocess.run(argv, capture_output=True, text=True,
                            encoding="utf-8-sig", timeout=timeout_seconds)
    if result.returncode:
        target.unlink(missing_ok=True)
        raise AssertionError("Compilation failed, not behavioral RED:\n" + result.stdout + result.stderr)
    if before != _source_hashes(sources):
        target.unlink(missing_ok=True)
        raise AssertionError("Declared C# sources changed while compiling")
    if not target.is_file():
        raise AssertionError("Compiler returned success without an executable")
    return CSharpBuild(target, before, tuple(argv), result.stdout, result.stderr)


def run_csharp(executable, args=(), *, timeout_seconds=120, mono=MONO):
    """Return actual process output; behavioral assertions belong to callers."""
    if timeout_seconds <= 0:
        raise ValueError("Execution requires a positive timeout")
    if not Path(executable).is_file():
        raise AssertionError(f"Compiled C# executable is unavailable: {executable}")
    if mono is None:
        mono = discover_toolchain()[0]
    return subprocess.run([str(mono), str(executable), *map(str, args)],
                          capture_output=True, text=True, encoding="utf-8-sig",
                          timeout=timeout_seconds)
