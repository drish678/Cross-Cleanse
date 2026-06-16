"""
Cleans productlist.csv + productReviews.csv and outputs products_full.json
for the Cross Cleanse app.
"""
import pandas as pd
import json
import re
import os

# ── Load ──────────────────────────────────────────────────────────────
products = pd.read_csv('/Users/drishyasanghavi/Downloads/archive/productlist.csv')
reviews  = pd.read_csv('/Users/drishyasanghavi/Downloads/archive/productReviews.csv')

# ── Clean prices ──────────────────────────────────────────────────────
def parse_price(p):
    try:
        return round(float(str(p).replace('$','').replace(',','').strip()), 2)
    except:
        return None

products['price_clean'] = products['price'].apply(parse_price)
products = products.dropna(subset=['price_clean'])
products['price_clean'] = products['price_clean'].astype(float)

# ── Review stats per product ──────────────────────────────────────────
review_counts = reviews['product_id'].value_counts().reset_index()
review_counts.columns = ['product_ID', 'review_count']

# Sample reviews (top 3) per product for display
def top_reviews(pid):
    r = reviews[reviews['product_id'] == pid]['review'].dropna().head(3).tolist()
    return [str(x)[:280] for x in r]

review_samples = reviews.groupby('product_id')['review'].apply(
    lambda r: [str(x)[:280] for x in r.dropna().head(3).tolist()]
).reset_index()
review_samples.columns = ['product_ID', 'sample_reviews']

products = products.merge(review_counts, on='product_ID', how='left')
products = products.merge(review_samples, on='product_ID', how='left')
products['review_count'] = products['review_count'].fillna(0).astype(int)
products['sample_reviews'] = products['sample_reviews'].apply(lambda x: x if isinstance(x, list) else [])

# ── Product type → routine step mapping ──────────────────────────────
TYPE_MAP = {
    'Cleanser':           ('Cleanser',   1),
    'Toner':              ('Toner',      2),
    'Essence':            ('Toner',      2),
    'Exfoliator':         ('Exfoliator', 2),
    'Serum':              ('Serum',      3),
    'Other/Spot Treatments': ('Serum',  3),
    'Eye Treatment':      ('Eye Care',   4),
    'Moisturizer':        ('Moisturiser',5),
    'Sun Protection':     ('SPF',        6),
    'Mask':               ('Mask',       7),
    'Sheet Mask':         ('Mask',       7),
    'Lip Treatment':      ('Lip',        8),
}

products['type_clean'] = products['product_type'].map(lambda x: TYPE_MAP.get(x, (x, 9))[0])
products['step']       = products['product_type'].map(lambda x: TYPE_MAP.get(x, (x, 9))[1])

# ── Price tier ────────────────────────────────────────────────────────
def price_tier(p):
    if p < 20:   return 'budget'
    elif p < 60: return 'mid'
    else:        return 'luxury'

products['price_tier'] = products['price_clean'].apply(price_tier)

# ── AM / PM from product type ─────────────────────────────────────────
AM_TYPES = {'Cleanser','Toner','Serum','Eye Care','Moisturiser','SPF'}
PM_TYPES = {'Cleanser','Toner','Serum','Eye Care','Moisturiser','Exfoliator'}

# ── Infer skin types from description ────────────────────────────────
SKIN_KEYWORDS = {
    'dry':         ['dry skin','dryness','dry,','dry and','moisturizing','nourishing','hydrating','deeply hydrat'],
    'oily':        ['oily skin','oily,','excess oil','oil control','mattif','excess sebum'],
    'combination': ['combination skin','combination,'],
    'sensitive':   ['sensitive skin','sensitive,','soothing','calming','gentle','redness','irritat','reactive'],
    'normal':      ['all skin types','all skin','suitable for all','every skin'],
    'acne-prone':  ['acne','breakout','blemish','comedogenic','pore-clog'],
}

def infer_skin_types(desc):
    d = str(desc).lower()
    found = [st for st, kws in SKIN_KEYWORDS.items() if any(k in d for k in kws)]
    if not found:
        found = ['normal']
    # deduplicate while preserving order
    seen = set()
    return [x for x in found if not (x in seen or seen.add(x))]

# ── Infer concerns ────────────────────────────────────────────────────
CONCERN_KEYWORDS = {
    'aging':             ['fine line','wrinkle','aging','anti-aging','firming','collagen','elasticity','sagging'],
    'hyperpigmentation': ['hyperpigmentation','dark spot','brighten','even skin tone','discolor','melanin','pigment'],
    'dryness':           ['dry','hydrat','moistur','dehydrat'],
    'redness':           ['redness','flush','rosacea','sooth','calm','irritat'],
    'acne':              ['acne','breakout','blemish','salicylic','pimple','comedone'],
    'pores':             ['pore','blackhead','sebum','oil'],
    'dullness':          ['glow','radiant','bright','luminous','dull','uneven'],
    'dark circles':      ['dark circle','under-eye','puffiness','puffy','eye area'],
}

def infer_concerns(desc):
    d = str(desc).lower()
    return [c for c, kws in CONCERN_KEYWORDS.items() if any(k in d for k in kws)]

# ── Infer key ingredients ─────────────────────────────────────────────
INGREDIENT_PATTERNS = [
    ('Retinol',          r'\bretinol\b'),
    ('Retinal',          r'\bretinal\b'),
    ('Hyaluronic Acid',  r'hyaluronic acid'),
    ('Niacinamide',      r'niacinamide'),
    ('Vitamin C',        r'vitamin c|ascorbic acid|ascorbyl'),
    ('Glycolic Acid',    r'glycolic acid'),
    ('Lactic Acid',      r'lactic acid'),
    ('Salicylic Acid',   r'salicylic acid|bha'),
    ('AHA',              r'\baha\b'),
    ('BHA',              r'\bbha\b'),
    ('Ceramides',        r'ceramide'),
    ('Peptides',         r'peptide'),
    ('Centella Asiatica',r'centella|cica|tiger grass'),
    ('Bakuchiol',        r'bakuchiol'),
    ('Azelaic Acid',     r'azelaic acid'),
    ('Kojic Acid',       r'kojic acid'),
    ('Propolis',         r'propolis'),
    ('Snail Mucin',      r'snail secret|mucin'),
    ('Green Tea',        r'green tea'),
    ('Collagen',         r'collagen'),
    ('Squalane',         r'squalane'),
    ('Rosehip Oil',      r'rosehip'),
    ('Tamanu Oil',       r'tamanu'),
    ('Aloe Vera',        r'aloe vera|aloe barbadensis'),
    ('Witch Hazel',      r'witch hazel'),
    ('Tea Tree',         r'tea tree'),
    ('Madecassoside',    r'madecassoside'),
    ('Adenosine',        r'adenosine'),
    ('Ferulic Acid',     r'ferulic acid'),
    ('Zinc',             r'\bzinc\b'),
    ('Oat Extract',      r'oat extract|colloidal oat'),
    ('Vitamin E',        r'vitamin e|tocopherol'),
    ('Glycerin',         r'glycerin'),
    ('Allantoin',        r'allantoin'),
    ('Beta-Glucan',      r'beta.glucan'),
    ('Kaolin Clay',      r'kaolin|clay'),
    ('Charcoal',         r'charcoal'),
    ('Mugwort',          r'mugwort|artemisia'),
    ('Rice Extract',     r'rice extract|rice water'),
    ('Bifida Ferment',   r'bifida ferment|lactobacillus'),
]

def extract_ingredients(desc):
    d = str(desc).lower()
    found = [name for name, pat in INGREDIENT_PATTERNS if re.search(pat, d)]
    return found[:6]  # top 6

# ── Fragrance / alcohol free ──────────────────────────────────────────
def is_fragrance_free(desc):
    d = str(desc).lower()
    return bool(re.search(r'without.{0,30}fragrance|fragrance.free|no fragrance|unscented', d))

def is_alcohol_free(desc):
    d = str(desc).lower()
    return bool(re.search(r'without.{0,30}alcohol|alcohol.free|no alcohol', d))

# ── AM / PM ───────────────────────────────────────────────────────────
def infer_am(row):
    t = row['type_clean']
    desc = str(row['product_description']).lower()
    if t in AM_TYPES:
        if t == 'Serum' and re.search(r'\bretinol\b|\bretinal\b|retinoid|retinoic', desc):
            return False  # retinoids are PM only
        return True
    return False

def infer_pm(row):
    t = row['type_clean']
    return t in PM_TYPES

# ── Apply all transformations ─────────────────────────────────────────
products['skin_types']     = products['product_description'].apply(infer_skin_types)
products['concerns']       = products['product_description'].apply(infer_concerns)
products['key_ingredients']= products['product_description'].apply(extract_ingredients)
products['fragrance_free'] = products['product_description'].apply(is_fragrance_free)
products['alcohol_free']   = products['product_description'].apply(is_alcohol_free)
products['am']             = products.apply(infer_am, axis=1)
products['pm']             = products.apply(infer_pm, axis=1)

# ── Drop lip treatments (out of scope) ───────────────────────────────
products = products[products['type_clean'] != 'Lip']

# ── Drop rows with no price or empty descriptions ─────────────────────
products = products[products['product_description'].notna()]
products = products[products['price_clean'] > 0]

# ── Build final JSON records ──────────────────────────────────────────
START_ID = 1000  # offset so IDs don't clash with existing curated products
output = []
for i, row in products.reset_index(drop=True).iterrows():
    output.append({
        'id':             START_ID + i,
        'name':           str(row['product_name']).strip(),
        'brand':          str(row['product_brand']).strip(),
        'type':           row['type_clean'],
        'step':           int(row['step']),
        'price':          row['price_clean'],
        'price_tier':     row['price_tier'],
        'skin_types':     row['skin_types'],
        'concerns':       row['concerns'],
        'key_ingredients':row['key_ingredients'],
        'ingredients':    [k.lower() for k in row['key_ingredients']],
        'description':    str(row['product_description'])[:400].strip(),
        'fragrance_free': bool(row['fragrance_free']),
        'alcohol_free':   bool(row['alcohol_free']),
        'am':             bool(row['am']),
        'pm':             bool(row['pm']),
        'url':            '#',
        'review_count':   int(row['review_count']),
        'sample_reviews': row['sample_reviews'],
        'source':         'catalog',
    })

# ── Save ──────────────────────────────────────────────────────────────
out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'products_catalog.json')
with open(out_path, 'w') as f:
    json.dump(output, f, indent=2)

print(f'✓ Saved {len(output)} products to products_catalog.json')
print(f'  Types:  { {r["type"] for r in output} }')
print(f'  Brands: {len({r["brand"] for r in output})} unique')
print(f'  Price range: ${min(r["price"] for r in output)} – ${max(r["price"] for r in output)}')
print(f'  With reviews: {sum(1 for r in output if r["review_count"] > 0)}')
print(f'  Fragrance-free: {sum(1 for r in output if r["fragrance_free"])}')
