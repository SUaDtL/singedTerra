"""Classify Unity shader compiler diagnostics in a WebGL export log."""

import re


SHADER_DIAGNOSTIC = re.compile(r"(?m)^Shader (?:error|warning) in '[^\r\n]+")


def shader_diagnostics(log):
    return SHADER_DIAGNOSTIC.findall(log)


def accepts_log(log, marker):
    return marker in log and not shader_diagnostics(log)
