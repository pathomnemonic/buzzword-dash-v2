# Stage 1: programmatic screen of MedMCQA train rows. Usage: python3 -I screen.py /tmp/mm_raw/train.json /tmp/mm_raw/survivors.json
import json,random,re,sys,collections
rows=json.load(open(sys.argv[1])); random.seed(150); random.shuffle(rows); rows=rows[:20000]
stats=collections.OrderedDict(); stats['sample']=len(rows)
KEEP_SUBJ={'Anatomy','Physiology','Biochemistry','Pathology','Pharmacology','Microbiology','Medicine','Surgery','Pediatrics','Gynaecology & Obstetrics','Psychiatry','Social & Preventive Medicine'}
def has(p): 
    r=re.compile(p,re.I); return lambda q,o,e: bool(r.search(q))
def optany(p):
    r=re.compile(p,re.I); return lambda q,o,e: any(r.search(x) for x in o)
rules=[
 ('choice_type single',None),
 ('subject relevant',None),
 ('image/figure stem',has(r'\b(image|figure|fig\.|picture|photograph|shown|seen (above|below)|given (below|above)|diagram|x-?ray shown|marked|arrow|xray|ecg shown|slide|illustrat)')),
 ('all/none of the above / both',optany(r'\b(all|none|both|any) of the (above|these|following)|all the above|none of these|^all of|^both|\ball of the\b|^(a|b|c|d)\s*(and|&)\s*(a|b|c|d)\b|^1 and|^1,|\b(a|b|c|d) (and|&) (a|b|c|d)$')),
 ('except/not negation',has(r'\b(except|not true|not a|not seen|not found|not associated|not feature|not used|not true|false|incorrect|least|never|exception|true statement|true about|true regarding|not cause|not present|not include|not typically|not an|not the|not involved|not part|not recommended|not given|not correct)\b|\bnot\b')),
 ('which-of-following list/dependent',has(r'which of the following|following (is|are|statements?|drugs?|features?)|all (are|of)\b|true (about|regarding|statement)|statement')),
 ('calculation/numbers',has(r'\b(calculate|how many|what is the (dose|number|percentage|value)|ratio|incidence|prevalence|rate of|per 1000|per 100|\d+\s*%|mg/kg|score|formula|number of)\b')),
 ('year/guideline/dated',has(r'\b(19|20)\d\d\b|\b(guideline|latest|recent|newer|current(ly)?|as per|according to|who|nacp|rntcp|icmr|national|programme|program|act\b|ipc|crpc|mci|nhm|ncert|govt|government|india|indian|schedule|law|legal|court|section \d|case study|survey)\b')),
 ('obsolete practice',has(r'\b(treatment of choice in (the )?past|old|formerly|previously|earlier|traditional|classic(al)? treatment|trade name|brand)\b')),
 ('too long stem (>160ch) or too short (<12)',lambda q,o,e: len(q)>160 or len(q)<12),
 ('options too long/odd (>60ch or numeric)',lambda q,o,e: any(len(x)>60 or len(x.strip())<2 or re.fullmatch(r'[\d\W]+',x.strip()) for x in o)),
 ('no usable explanation (<40ch)',lambda q,o,e: len((e or '').strip())<40),
 ('eponym-numbered/obscure ref (type/grade/stage/number in answer-set)',optany(r'\b(type|grade|stage|class|group|cn|nerve)\s*[ivx\d]+\b|\bT\d|\bL\d|\bC\d|^\d')),
]
cur=rows
for name,fn in rules:
    if name=='choice_type single': nxt=[r for r in cur if r['choice_type']=='single']
    elif name=='subject relevant': nxt=[r for r in cur if r['subject_name'] in KEEP_SUBJ]
    else:
        nxt=[]
        for r in cur:
            o=[r['opa'],r['opb'],r['opc'],r['opd']]
            if not fn(r['question'],o,r['exp']): nxt.append(r)
    stats[name]=(len(cur)-len(nxt),len(nxt)); cur=nxt
for k,v in stats.items(): print(k,v)
for r in cur: r['correct']=[r['opa'],r['opb'],r['opc'],r['opd']][r['cop']]
json.dump(cur,open(sys.argv[2],'w'))
print(collections.Counter(r['subject_name'] for r in cur))
