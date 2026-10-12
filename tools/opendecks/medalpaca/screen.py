#!/usr/bin/env python3
"""Stage 1: programmatic screen of medalpaca/medical_meadow_medical_flashcards.
usage: python3 -I screen.py RAW_JSON OUT_DIR   -> OUT_DIR/survivors.json, OUT_DIR/screen_counts.json"""
import json, re, sys, collections
raw, out = sys.argv[1], sys.argv[2]
rows = json.load(open(raw))
STOP = set("the a an of in is are was were to for and or by with on as at from that this which what how does do did its it be can may used use called name known refer referred term following known most common than into has have had their there these those when where who whom whose type types".split())
def toks(s): return [w for w in re.findall(r"[a-z0-9\+\-']+", s.lower()) if w not in STOP]
def stem(w): return w[:6]
counts = collections.Counter(); survivors = []
seen_exact = set(); drops = {}
img = re.compile(r"\b(image|picture|pictured|figure|photo|photograph|shown|diagram|radiograph|x-ray shows|pictorial|illustrat|slide)\b", re.I)
boiler = re.compile(r"(i'm sorry|as an ai|consult (with )?(a|your) (healthcare|doctor|physician)|it is important to|not medical advice|it depends|may vary|can vary)", re.I)
mnem = re.compile(r"mnemonic|acronym|remember", re.I)
yn = re.compile(r"^(is|are|does|do|did|can|could|will|would|should|has|have|was|were)\b", re.I)
listq = re.compile(r"\b(list|enumerate|what are the (various|different|main|types|causes|symptoms|signs|features|components|steps|stages|functions|layers|branches)|name (the|all|four|five|six|three)|which (three|four|five|six|seven)|how many (types|ways))\b", re.I)
vague = re.compile(r"^(what is|what are|define|describe|explain|how does|how do|why)\b", re.I)
def sent_count(s): return len([x for x in re.split(r"(?<=[.!?])\s+(?=[A-Z])", s.strip()) if x])
def list_items(s):
    s2 = re.sub(r"\([^)]*\)", "", s)
    return s2.count(",") + s2.count(";") + len(re.findall(r"\b(and|or)\b", s2))
cands = []
for i, r in enumerate(rows):
    q, a = r["input"].strip(), r["output"].strip()
    def drop(rule):
        counts[rule] += 1
    if len(q) < 15 or len(a) < 8: drop("empty_or_too_short"); continue
    key = re.sub(r"\W+", " ", q.lower()).strip()
    if key in seen_exact: drop("exact_duplicate_question"); continue
    seen_exact.add(key)
    if img.search(q) or img.search(a): drop("needs_image_or_figure"); continue
    if boiler.search(a): drop("boilerplate_or_hedging"); continue
    if mnem.search(q) or mnem.search(a): drop("mnemonic"); continue
    if yn.match(q) or re.search(r"\b(or)\b.*\?$", q) and re.match(r"^(is|are|does|do|which of)", q, re.I): drop("yes_no_or_either_or_question"); continue
    if len(a) > 260 or sent_count(a) > 2: drop("paragraph_answer"); continue
    if listq.search(q) or re.search(r"^\s*(\d\.|\(?[a-d]\))", a) or list_items(a) >= 4 and not re.search(r"\b\d+[,.]\d+\b", a) and list_items(a) >= 4: drop("list_style_4plus"); continue
    if vague.match(q) and not re.match(r"^(what is|what are) (the )?(name|drug|term|best|first|most|treatment|mechanism|cause|diagnosis|gene|enzyme|antidote|next|screening|risk|likely|appropriate|preferred|characteristic|classic|typical|associated|inheritance|chromosome|genetic|vitamin|organism|bacteria|virus|nerve|artery|muscle|receptor|hormone|marker|test|medication|class|effect|side|complication)", q, re.I) and len(a) > 150: drop("vague_definition_or_explain"); continue
    qt, at = set(map(stem, toks(q))), set(map(stem, toks(a)))
    novel = at - qt
    if len(novel) < 1: drop("answer_restates_question"); continue
    if len(a.split()) > 38: drop("answer_too_long_for_short_extraction"); continue
    cands.append((i, q, a, qt, at, novel))
# near-duplicate: Jaccard on question stems >= .6 OR same novel-answer core with q-jaccard >= .45
inv = collections.defaultdict(list); keep = []; dropped_near = 0
for c in cands:
    i, q, a, qt, at, novel = c
    dup = False; seen = collections.Counter()
    for w in qt:
        for j in inv[w][-400:]: seen[j] += 1
    for j, n in seen.items():
        k = keep[j]; u = len(qt | k[3]); jac = n / u if u else 0
        nj = len(novel & k[5]) / max(1, len(novel | k[5]))
        if jac >= 0.6 or (jac >= 0.4 and nj >= 0.6) or (jac >= 0.25 and nj >= 0.8 and len(novel) >= 1):
            dup = True; break
    if dup: dropped_near += 1; continue
    idx = len(keep); keep.append(c)
    for w in qt: inv[w].append(idx)
counts["near_duplicate_of_earlier_row"] = dropped_near
surv = [{"row": c[0], "q": c[1], "a": c[2]} for c in keep]
json.dump(surv, open(out + "/survivors.json", "w"))
tot = {"raw_rows": len(rows), "drops": dict(counts), "survivors": len(surv)}
json.dump(tot, open(out + "/screen_counts.json", "w"), indent=1)
print(json.dumps(tot, indent=1))
