#!/usr/bin/env python3
"""Keyword classifier: app subject (system) + source discipline, used for stratified sampling and as default subj."""
import re
SYS = [
 ('Neurology', r"nerve|neuro|brain|cerebr|cranial|spinal|stroke|seizure|epilep|parkinson|alzheimer|myasthen|multiple sclerosis|cortex|ganglia|thalam|cerebell|meningi|dementia|neuropath|plexus|dermatome|reflex|aphasia"),
 ('Cardiology', r"cardi|heart|myocard|aort|ventric|atrial|atrium|coronary|murmur|valve|hypertens|arrhythm|ecg|qrs|infarct|angina|endocard|pericard|statin|antiarrhythm"),
 ('Nephrology', r"renal|kidney|nephr|glomerul|urinary|diuretic|tubul|bladder|ureter|proteinuria|hematuria|uric|acidosis|alkalosis|sodium|potassium|hyperkal|hypokal|hyponat"),
 ('Psychiatry', r"psychi|depress|schizo|bipolar|anxiety|ssri|antipsychotic|adhd|autism|personality|ptsd|panic|ocd|delirium|lithium|benzodiazepine|addiction|withdrawal|suicid|mania|eating disorder|anorexia nervosa"),
 ('Gastroenterology', r"gastr|bowel|colon|liver|hepat|biliary|bile|pancrea|esophag|intestin|crohn|colitis|celiac|stomach|duoden|ileum|jejun|cirrhosis|gallbladder|rectum|anal |diarrhea|cholest"),
 ('Pulmonology', r"lung|pulmon|respirat|asthma|copd|bronch|pneumo|pleur|alveol|airway|emphysema|ventilat|tracheal|larynx|sarcoid"),
 ('Infectious Disease', r"bacteri|virus|viral|fung|parasit|infection|antibiotic|antimicrob|antivir|antifung|staphyl|strepto|e\. coli|salmonella|tubercul|hiv|hepatitis|herpes|malaria|candida|vaccine|sepsis|gram|plasmodium|mycobacter|clostrid|helminth|protozoa|pseudomonas|syphilis|chlamydia|toxoplasm"),
 ('Endocrinology', r"thyroid|insulin|diabet|adrenal|cortisol|pituitary|hormone|parathyroid|calcium|glucagon|growth hormone|cushing|addison|acth|pcos|hyperthyroid|hypothyroid|osteopor|vitamin d|thyrox"),
 ('Hematology/Oncology', r"anemi|leukem|lymphom|cancer|carcinoma|tumor|neoplas|oncogen|platelet|coagul|hemoglobin|thrombo|sickle|myeloma|chemotherap|metasta|heparin|warfarin|erythro|neutrophil|bleeding|iron|hemophilia|blood|sarcoma|tumour"),
 ('Rheumatology', r"arthritis|lupus|rheumat|gout|vasculitis|sjogren|scleroderma|myositis|spondyl|autoimmune|osteoarth|collagen|bone|joint|muscle|tendon|ligament|fracture|osteo"),
 ('Obstetrics/Gynecology', r"pregnan|uter|ovar|menstr|cervi|placent|fetal|fetus|gestation|labor|obstet|gynec|breast|vagin|contracept|estrogen|progesterone|preeclampsia|testis|testic|prostat|sperm|puberty|menopause|embryo"),
 ('Pediatrics', r"infant|child|neonat|pediatr|congenital|newborn|developmental|down syndrome|turner|klinefelter|trisomy|genetic|inherit|autosomal|x-linked|chromosom|mutation|gene "),
 ('Surgery', r"surg|incision|hernia|abdominal wall|appendic|trauma|wound|graft|suture|anesthe|resect|laparoscop|transplant|burn|inguinal|femoral|arter(y|ies) of|anatom|muscle of|ligament of|lymph node"),
 ('Emergency Medicine', r"poison|overdose|antidote|toxic|shock|resuscitat|cpr|emergency|anaphyl|hypotherm|hyperthermia|intoxicat|envenom|snake|carbon monoxide|cyanide"),
]
DISC = [
 ('pharmacology', r"drug|mechanism of action|inhibit|agonist|antagonist|blocker|medication|therapy|treat|dose|side effect|adverse|toxicity|antidote|prophylaxis|first-line|-mab|-pril|-sartan|-olol|-statin|-azole|-cillin|antibiotic"),
 ('microbiology', r"bacteri|virus|viral|fung|parasit|staph|strepto|e\. coli|candida|plasmodium|mycobact|clostrid|helminth|protozoa|pseudomonas|gram|organism|spirochete|vaccine"),
 ('immunology', r"immun|antibod|ig[gmaed]\b|t cell|b cell|cytokine|interleukin|complement|mhc|hla|hypersensitivity|lymphocyte|nk cell|macrophage"),
 ('biochemistry', r"enzyme|metabol|glycoly|gluconeo|cycle|vitamin|amino acid|lipid|cholesterol|dna|rna|protein|gene|synthesis|deficien|atp|nad|coenzyme|glycogen|fatty acid|nucleotide|chromosom|mutation|inherit"),
 ('anatomy', r"nerve|artery|vein|muscle|ligament|foramen|bone|anatom|plexus|innervat|branch of|supplied|lobe|fossa|canal|duct|sinus|origin|insertion|embryo|derived from|pharyngeal|arch|dermatome"),
 ('physiology', r"physiolog|secret|pressure|flow|volume|rate|receptor|hormone|potential|reflex|ph\b|clearance|filtration|release|stimulat|regulat|cardiac output|resistance|compliance|oxygen|\bco2\b"),
 ('pathology', r"patholog|histolog|biopsy|lesion|tumor|carcinoma|syndrome|disease|diagnos|finding|characteriz|cause|etiolog|cells|inflammat|necrosis|marker|stain|associated with|risk factor|presents|sign\b"),
]
def classify(text):
    t = text.lower()
    best, bs = 'Multisystem / Mixed', 0
    for name, pat in SYS:
        n = len(re.findall(pat, t))
        if n > bs: best, bs = name, n
    disc = 'clinical_medicine'
    for name, pat in DISC:
        if re.search(pat, t): disc = name; break
    return best, disc
