"""Canonical Markdown for model reports before SSE delivery and persistence."""

import re


_BREAK = r"(?:\\+\[(?:n|换行)\\*\]|\\*\[(?:n|换行)\]|\\+r\\+n|\\+n|<br\s*/?>)"
_CODE = re.compile(r"(?P<fence>`{3,}|~{3,})[\s\S]*?(?P=fence)|(?P<inline>`+)[^\n]*?(?P=inline)")
_PATH = re.compile(r"""(?<![\\A-Za-z0-9_])(?:[A-Za-z]:\\|\\\\(?![nr]\\)[A-Za-z0-9_.-]+\\)(?:[^\\\s<>"'`|#*，。；、（）【】]|\\(?![nr](?:\\|[#*\s]|$)))*""")
_STRING = re.compile(r'''(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')''')
_TITLE = re.compile(r"^[ \t]*#{1,6}[ \t]+(故障诊断报告|诊断报告|(?:Fault )?Diagnosis Report|Diagnostic Report)[ \t]*$", re.MULTILINE | re.IGNORECASE)
_TIME = re.compile(r"^[ \t]*(?:\*\*)?(?:生成时间|Generated at)(?:\*\*)?[ \t]*[:：][^\n]*$", re.MULTILINE | re.IGNORECASE)


def _decode_breaks(text: str, *, code: bool = False) -> str:
    protected: list[str] = []

    def save(match: re.Match[str]) -> str:
        protected.append(match.group(0))
        return f"\x00REPORT_LITERAL_{len(protected) - 1}\x00"

    if code:
        text = _STRING.sub(save, text)
    text = _PATH.sub(save, text)
    text = re.sub(_BREAK, "\n", text, flags=re.IGNORECASE)
    for index, literal in enumerate(protected):
        text = text.replace(f"\x00REPORT_LITERAL_{index}\x00", literal)
    return text


def _protect_code(text: str) -> tuple[str, list[str]]:
    blocks: list[str] = []

    def save(match: re.Match[str]) -> str:
        block = match.group(0)
        # Legacy reports can encode even the opening/closing code-fence lines.
        # Repair those separators while retaining escapes inside code strings.
        if match.group("fence") and re.match(r"(?:`{3,}|~{3,})[\w.+-]*[ \t]*" + _BREAK, block, re.IGNORECASE):
            block = _decode_breaks(block, code=True)
        blocks.append(block)
        return f"\x00REPORT_CODE_{len(blocks) - 1}\x00"

    return _CODE.sub(save, text), blocks


def _restore_code(text: str, blocks: list[str]) -> str:
    for index, block in enumerate(blocks):
        text = text.replace(f"\x00REPORT_CODE_{index}\x00", block)
    return text


def normalize_report_markdown(report: str) -> str:
    """Repair legacy newline encodings without rewriting evidence or code."""
    text = str(report or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    wrapper = re.fullmatch(r"```(?:markdown|md)?[ \t]*(?:\n|" + _BREAK + r")([\s\S]*?)(?:\n|" + _BREAK + r")```", text, re.IGNORECASE)
    if wrapper:
        text = wrapper.group(1)
    text, blocks = _protect_code(text)
    text = _decode_breaks(text)
    text = re.sub(
        r"^[ \t]*\\*\[((?:[一二三四五六七八九十]+|\d+)[、.．][^\]\n]+?)\\*\][ \t]*$",
        r"## \1", text, flags=re.MULTILINE,
    )
    seen_title = False

    def keep_first_title(match: re.Match[str]) -> str:
        nonlocal seen_title
        if seen_title:
            return ""
        seen_title = True
        return f"# {match.group(1)}"

    text = _TITLE.sub(keep_first_title, text)
    seen_time = False

    def keep_first_time(match: re.Match[str]) -> str:
        nonlocal seen_time
        if seen_time:
            return ""
        seen_time = True
        return match.group(0).strip()

    text = _TIME.sub(keep_first_time, text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return _restore_code(text, blocks)


def ensure_report_time(report: str, current_time: str) -> str:
    text, blocks = _protect_code(normalize_report_markdown(report))
    text = _TIME.sub("", text).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    line = f"**生成时间**: {current_time}"
    lines = text.split("\n", 1)
    if re.match(r"^#\s+", lines[0]):
        body = lines[1].lstrip() if len(lines) > 1 else ""
        text = f"{lines[0]}\n{line}\n\n{body}".rstrip()
    else:
        text = f"# 故障诊断报告\n{line}\n\n{text}".rstrip()
    return _restore_code(text, blocks)
