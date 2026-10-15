"""Fail if a captured Unity WebGL console reports any unsupported shader."""

import json
import sys
from pathlib import Path


def unsupported_shaders(console):
    entries = json.loads(Path(console).read_text(encoding="utf-8"))
    messages = [str(entry.get("text", "")).strip() for entry in entries]
    return [message for index, message in enumerate(messages)
            if "shader is not supported on this GPU" in message
            and index > 0 and messages[index - 1].startswith("ERROR: Shader")]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: check_shader_console.py <console.json>")
    errors = unsupported_shaders(sys.argv[1])
    if errors:
        raise SystemExit("Unsupported Unity WebGL shaders:\n" + "\n".join(errors))
    print("ST_LS_WEBGL_SHADERS_PASS")
