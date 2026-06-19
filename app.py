from flask import Flask, render_template, request, jsonify
import json
import numpy as np
import os

app = Flask(__name__)

def load_products():
    base_path = os.path.dirname(__file__)
    with open(os.path.join(base_path, 'data', 'products.json')) as f:
        curated = json.load(f)
    catalog_path = os.path.join(base_path, 'data', 'products_catalog.json')
    catalog = json.load(open(catalog_path)) if os.path.exists(catalog_path) else []
    return curated + catalog

PRODUCTS = load_products()

# Known ingredient conflicts
CONFLICT_RULES = [
    {
        "group_a": ["retinol", "retinoic acid", "tretinoin", "retinaldehyde", "retinyl propionate", "hydroxypinacolone retinoate"],
        "group_b": ["glycolic acid", "lactic acid", "mandelic acid", "salicylic acid", "betaine salicylate", "alpha hydroxy acid", "aha", "bha", "gluconolactone", "lactobionic acid"],
        "severity": "high",
        "message": "Retinoids + AHA/BHA in the same routine can over-exfoliate and damage your skin barrier.",
        "tip": "Use your AHA/BHA on alternate nights or in the AM, and keep retinoids for PM-only nights."
    },
    {
        "group_a": ["retinol", "retinoic acid", "tretinoin", "retinaldehyde", "retinyl propionate"],
        "group_b": ["ascorbic acid", "vitamin c", "3-o-ethyl ascorbic acid", "ascorbyl glucoside"],
        "severity": "medium",
        "message": "Retinol and Vitamin C together can cause irritation and reduce each other's stability.",
        "tip": "Use Vitamin C in the AM and retinoids in the PM — they complement each other across routines."
    },
    {
        "group_a": ["benzoyl peroxide"],
        "group_b": ["retinol", "retinoic acid", "ascorbic acid", "vitamin c"],
        "severity": "high",
        "message": "Benzoyl peroxide oxidizes and deactivates retinol and Vitamin C.",
        "tip": "Use benzoyl peroxide in AM and your retinol or Vitamin C in PM — or on alternate days."
    },
    {
        "group_a": ["niacinamide"],
        "group_b": ["ascorbic acid"],
        "severity": "low",
        "message": "Pure Vitamin C (ascorbic acid) and niacinamide can cause flushing in some people.",
        "tip": "Consider using them at different times, or choose a Vitamin C derivative like ascorbyl glucoside which is stable with niacinamide."
    }
]


def detect_conflicts(product_ids):
    selected = [p for p in PRODUCTS if p['id'] in product_ids]
    all_ingredients = {}
    for p in selected:
        for ing in p['ingredients']:
            all_ingredients.setdefault(ing.lower(), []).append(p['name'])

    found_conflicts = []
    for rule in CONFLICT_RULES:
        a_hits = [(ing, all_ingredients[ing]) for ing in rule['group_a'] if ing in all_ingredients]
        b_hits = [(ing, all_ingredients[ing]) for ing in rule['group_b'] if ing in all_ingredients]
        if a_hits and b_hits:
            a_products = list({p for _, ps in a_hits for p in ps})
            b_products = list({p for _, ps in b_hits for p in ps})
            found_conflicts.append({
                'severity': rule['severity'],
                'message': rule['message'],
                'tip': rule['tip'],
                'products_a': a_products,
                'products_b': b_products
            })
    return found_conflicts


def score_product(product, profile):
    score = 0
    skin_types = profile.get('skin_types') or ([profile.get('skin_type')] if profile.get('skin_type') else [])
    concerns = profile.get('concerns', [])
    budget = profile.get('budget', 'mid')
    sensitivities = profile.get('sensitivities', [])

    # Skin type match — score for each matching type
    product_skin = product.get('skin_types', [])
    if 'all' in product_skin:
        score += 20
    else:
        matches = sum(1 for s in skin_types if s in product_skin)
        score += matches * 20

    # Concern match
    for concern in concerns:
        if concern in product['concerns']:
            score += 20

    # Budget match
    tiers = {'budget': 0, 'mid': 1, 'luxury': 2}
    product_tier = tiers.get(product['price_tier'], 1)
    budget_tier = tiers.get(budget, 1)
    score -= abs(product_tier - budget_tier) * 15

    # Sensitivity filters
    if 'fragrance_free' in sensitivities and not product['fragrance_free']:
        score -= 40
    if 'alcohol_free' in sensitivities and not product['alcohol_free']:
        score -= 30

    return score


def build_routine(profile):
    skin_type = profile.get('skin_type', '')
    concerns = profile.get('concerns', [])

    # Step slots: cleanser, toner/exfoliant, serum, eye, moisturiser, spf, mask(weekly)
    step_types = {
        1: 'Cleanser',
        2: 'Toner',
        3: 'Serum',
        4: 'Eye Care',
        5: 'Moisturiser',
        6: 'SPF'
    }

    routine = {}
    used_brands = set()

    # Pick max 2 serums based on top concerns
    serum_slots = 2 if len(concerns) >= 2 else 1

    for step, ptype in step_types.items():
        candidates = [p for p in PRODUCTS if p['type'] == ptype]
        if not candidates:
            continue

        scored = sorted(candidates, key=lambda p: score_product(p, profile), reverse=True)

        if ptype == 'Serum':
            picked = []
            for p in scored:
                if len(picked) >= serum_slots:
                    break
                if p['brand'] not in used_brands:
                    picked.append(p)
                    used_brands.add(p['brand'])
            routine[step] = picked
        else:
            for p in scored:
                if p['brand'] not in used_brands or ptype in ('SPF', 'Eye Care'):
                    routine[step] = [p]
                    used_brands.add(p['brand'])
                    break

    # Split AM / PM
    am_routine = []
    pm_routine = []
    step_order = sorted(routine.keys())

    for step in step_order:
        for p in routine.get(step, []):
            entry = {**p, 'why': build_why(p, profile)}
            if p.get('am') and step != 6:
                am_routine.append(entry)
            if p.get('pm') and step != 6:
                pm_routine.append(entry)

    # SPF is AM only
    for p in routine.get(6, []):
        am_routine.append({**p, 'why': build_why(p, profile)})

    # Sort by step
    am_routine.sort(key=lambda x: x['step'])
    pm_routine.sort(key=lambda x: x['step'])

    # Conflict detection
    all_ids = [p['id'] for step in routine.values() for p in step]
    conflicts = detect_conflicts(all_ids)

    # Bonus: weekly mask recommendation
    mask_candidates = [p for p in PRODUCTS if p['type'] == 'Mask']
    mask_scored = sorted(mask_candidates, key=lambda p: score_product(p, profile), reverse=True)
    weekly_mask = mask_scored[0] if mask_scored else None

    return {
        'am': am_routine,
        'pm': pm_routine,
        'conflicts': conflicts,
        'weekly_mask': weekly_mask
    }


def build_why(product, profile):
    skin_types = profile.get('skin_types') or ([profile.get('skin_type')] if profile.get('skin_type') else [])
    concerns = profile.get('concerns', [])
    matched_concerns = [c for c in concerns if c in product.get('concerns', [])]
    skin_label = ' + '.join(skin_types[:2]) if skin_types else 'your'

    if matched_concerns:
        concern_str = ' and '.join(matched_concerns[:2])
        return f"Chosen because your skin is {skin_label} and you're targeting {concern_str}."
    elif any(s in product.get('skin_types', []) for s in skin_types):
        return f"A great match for {skin_label} skin — gentle, effective, and well-tolerated."
    elif 'all' in product.get('skin_types', []):
        return f"Works for all skin types and fits your {profile.get('budget', 'mid')}-range budget."
    return "A solid, well-reviewed pick for your routine."


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/routine', methods=['POST'])
def get_routine():
    profile = request.json
    routine = build_routine(profile)
    return jsonify(routine)


@app.route('/api/conflicts', methods=['POST'])
def check_conflicts():
    product_ids = request.json.get('product_ids', [])
    conflicts = detect_conflicts(product_ids)
    return jsonify({'conflicts': conflicts})


@app.route('/api/products', methods=['GET'])
def get_products():
    return jsonify(PRODUCTS)


@app.route('/api/order', methods=['POST'])
def place_order():
    data = request.json
    order_id = 'XC-' + __import__('random').randint(100000, 999999).__str__()
    return jsonify({'success': True, 'order_id': order_id, 'message': 'Order placed successfully'})


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=False, host='0.0.0.0', port=port)
