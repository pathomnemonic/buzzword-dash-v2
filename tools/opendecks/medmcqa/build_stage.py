# Parse hand-converted batch lines, attach source row, choose a verbatim evidence sentence from the dataset explanation.
# Usage: python3 -I build_stage.py   (reads batches/*.txt and /tmp/mm_raw/sample.json; writes stage.json + source/<id>.txt)
import json,re,glob,os,html
S={r['n']:r for r in json.load(open('/tmp/mm_raw/sample.json'))}
STOP=set('the a an of and or to in on by for with from is are it its at as that this be than'.split())
def stems(s):
    out=[]
    for w in re.split(r'[^a-z0-9]+',s.lower()):
        if not w or w in STOP: continue
        if w.isdigit(): out.append(w); continue
        if len(w)>3 and w.endswith('s'): w=w[:-1]
        out.append(w[:6])
    return out
def alts(a):
    m=re.match(r'^(.*?)\s*\(([^)]+)\)\s*$',a); return [m.group(1).strip(),m.group(2).strip()] if m and m.group(1).strip() else [a]
def support(ans,ev):
    have=set(stems(ev)); best=0
    for a in alts(ans):
        st=stems(a)
        if st: best=max(best,sum(w in have for w in st)/len(st))
    return best
def clean(t):
    t=html.unescape(t or ''); t=re.sub(r'<[^>]*>',' ',t); t=t.replace('&;',"'")
    return re.sub(r'\s+',' ',t).strip()
def sentences(t):
    parts=re.split(r'(?<=[.!?])\s+(?=[A-Z0-9(])',t)
    return [p.strip() for p in parts if p.strip()]
SUBJ={'NEU':'Neurology','CAR':'Cardiology','NEP':'Nephrology','PSY':'Psychiatry','GI':'Gastroenterology','PUL':'Pulmonology','ID':'Infectious Disease','END':'Endocrinology','HEM':'Hematology/Oncology','RHE':'Rheumatology','OB':'Obstetrics/Gynecology','PED':'Pediatrics','SUR':'Surgery','EM':'Emergency Medicine','MIX':'Multisystem / Mixed'}
QT={'dx':'buzzword_dx','mg':'management','lab':'lab_dx','mech':'mechanism','ph':'pharm','se':'side_effect','prev':'prevention','wk':'dx_to_workup','tx':'dx_to_tx'}
SRC={'Anatomy':'anatomy','Physiology':'physiology','Biochemistry':'biochemistry','Pathology':'pathology','Pharmacology':'pharmacology','Microbiology':'microbiology','Surgery':'surgery_principles'}
EX={'Anatomy':['step1','comlex1'],'Physiology':['step1','comlex1'],'Biochemistry':['step1','comlex1'],'Pathology':['step1','comlex1'],'Pharmacology':['step1','comlex1'],'Microbiology':['step1','comlex1'],'Medicine':['step2','comlex2','shelf_im'],'Surgery':['step2','comlex2','shelf_surg'],'Gynaecology & Obstetrics':['step2','comlex2','shelf_obgyn'],'Pediatrics':['step2','comlex2','shelf_peds'],'Psychiatry':['step2','comlex2','shelf_psych'],'Social & Preventive Medicine':['step2','step3']}
cards=[];seen=set()
for f in sorted(glob.glob('batches/*.txt')):
    for line in open(f):
        line=line.rstrip('\n')
        if not line.strip(): continue
        p=line.split('|')
        if len(p)!=8: print('BAD LINE',line[:60],len(p)); continue
        n,sj,qt,hint,ans,d1,d2,tp=p; n=int(n)
        if n in seen: print('dup n',n); continue
        seen.add(n); r=S[n]
        exp=clean(r['exp']); 
        best=None
        for s in sentences(exp):
            if len(s)<25 or len(s)>400: continue
            if re.search(r'\bRef\b|REF|page|pg\b',s) and len(s)<60: continue
            sc=support(ans,s)
            if best is None or sc>best[0]: best=(sc,s)
        cards.append(dict(n=n,id=r['id'],subj=SUBJ[sj],qt=QT[qt],hint=hint,ans=ans,d=[d1,d2],tp=tp,ds=r['subject_name'],topic=r['topic_name'],ev=best[1] if best else '',evsup=best[0] if best else 0,exp=exp))
print(len(cards),'cards;', sum(c['evsup']>=0.5 for c in cards),'with evidence support>=0.5')
json.dump(cards,open('/tmp/mm_raw/stage.json','w'))
