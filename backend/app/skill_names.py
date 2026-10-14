"""Authoritative skill identity. Keep NFC + whitespace + casefold semantics stable."""

import unicodedata


def normalize_skill(value: str) -> tuple[str, str]:
    if any(unicodedata.category(c) in ("Cc", "Cf", "Cs") for c in value):
        raise ValueError("Skill names cannot contain control or invisible format characters")
    display = " ".join(unicodedata.normalize("NFC", value).split())
    if not 1 <= len(display) <= 80:
        raise ValueError("Use 1 to 80 characters for a skill name")
    return display, unicodedata.normalize("NFC", display.casefold())


class SkillNormalizationCollision(RuntimeError):
    def __init__(self, ids):
        self.record_ids = sorted(str(id) for id in ids)
        super().__init__("Skill normalization collision; review conflicting record IDs")
