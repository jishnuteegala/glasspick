import hashlib
import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTOR = json.loads((ROOT / "vectors" / "v2.json").read_text(encoding="utf-8"))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_name(value: str) -> str:
    scalars = []
    index = 0
    while index < len(value):
        codepoint = ord(value[index])
        if 0xD800 <= codepoint <= 0xDBFF:
            if index + 1 >= len(value) or not 0xDC00 <= ord(value[index + 1]) <= 0xDFFF:
                raise ValueError("unpaired surrogate")
            low = ord(value[index + 1])
            scalars.append(chr(0x10000 + ((codepoint - 0xD800) << 10) + low - 0xDC00))
            index += 2
            continue
        if 0xDC00 <= codepoint <= 0xDFFF:
            raise ValueError("unpaired surrogate")
        scalars.append(value[index])
        index += 1
    trimmed = "".join(scalars).strip(" \t\r\n")
    if trimmed.startswith("@"):
        trimmed = trimmed[1:]
    normalized = unicodedata.normalize("NFC", trimmed)
    if any(unicodedata.category(character) == "Cc" for character in normalized):
        raise ValueError("control character")
    return "".join(character.lower() if "A" <= character <= "Z" else character for character in normalized)


for unicode_vector in VECTOR["unicodeVectors"]:
    canonical_names = sorted(
        (canonical_name(name) for name in unicode_vector["input"]),
        key=lambda name: name.encode("utf-8"),
    )
    assert canonical_names == unicode_vector["canonicalNames"]

for rejected in VECTOR["rejectedNames"]:
    try:
        canonical_name(rejected)
    except ValueError:
        continue
    raise AssertionError(f"expected rejected name: {rejected!r}")


entries = VECTOR["entries"]
canonical = "\n".join(f'{entry["name"]},{entry["weight"]}' for entry in entries)
fields = [
    VECTOR["chainHash"], VECTOR["algorithm"], canonical, str(len(entries)),
    str(sum(entry["weight"] for entry in entries)), str(VECTOR["winnerCount"]),
    str(VECTOR["alternateCount"]), VECTOR["nonce"], str(VECTOR["round"]),
]
commitment = digest("glasspick-v2|" + "|".join(fields))
assert commitment == VECTOR["commitmentHash"]
seed = digest(f'glasspick-seed-v2|{commitment}|{VECTOR["randomness"]}')
assert seed == VECTOR["seed"]

pool = [dict(entry) for entry in entries]
selected = []
pick_traces = []
for pick_index in range(VECTOR["winnerCount"] + VECTOR["alternateCount"]):
    total = sum(entry["weight"] for entry in pool)
    limit = 2**256 - (2**256 % total)
    attempt = 0
    while True:
        number = int(digest(f"{seed}|{pick_index}|{attempt}"), 16)
        if number < limit:
            ticket = number % total
            accepted_digest = f"{number:064x}"
            break
        attempt += 1
    cursor = 0
    for index, entry in enumerate(pool):
        cursor += entry["weight"]
        if ticket < cursor:
            selected.append(entry["name"])
            pick_traces.append({
                "total": total, "attempt": attempt, "digest": accepted_digest,
                "ticket": ticket, "selected": entry["name"],
            })
            pool.pop(index)
            break

assert selected == VECTOR["winners"] + VECTOR["alternates"]
assert pick_traces == VECTOR["picks"]

boundary = VECTOR["rejectionBoundary"]
boundary_total = boundary["total"]
boundary_limit = 2**256 - (2**256 % boundary_total)
for candidate in boundary["candidates"]:
    number = (boundary_limit + candidate["offsetFromLimit"]
              if "offsetFromLimit" in candidate else int(candidate["value"], 16))
    accepted = 0 <= number < boundary_limit
    assert accepted == candidate["accepted"]
    if accepted:
        assert number % boundary_total == candidate["ticket"]
print("GlassPick v2 Python vectors verified")
