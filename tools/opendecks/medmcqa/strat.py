import json,random,collections
s=json.load(open('/tmp/mm_raw/survivors.json')); random.seed(7); random.shuffle(s)
q={'Medicine':170,'Surgery':160,'Pathology':160,'Anatomy':150,'Microbiology':150,'Pharmacology':150,'Biochemistry':130,'Physiology':130,'Social & Preventive Medicine':30,'Gynaecology & Obstetrics':110,'Pediatrics':100,'Psychiatry':60}
c=collections.Counter(); out=[]
for r in s:
    if c[r['subject_name']]<q[r['subject_name']]: c[r['subject_name']]+=1; out.append(r)
random.shuffle(out)
for i,r in enumerate(out): r['n']=i
json.dump(out,open('/tmp/mm_raw/sample.json','w')); print(len(out),c)
