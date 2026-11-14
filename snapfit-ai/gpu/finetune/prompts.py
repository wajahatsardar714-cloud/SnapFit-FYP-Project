"""Generation specs for the synthetic clothes-parsing set (pure Python).

Each spec describes one full-body photo to generate with Stable Diffusion 1.5:
who (gender, age), what they wear (top, bottom, dupatta, colours, pattern),
where (background) and how they stand (pose). It also carries the labels the
picture should get, in the 18 ATR ids the parser already uses, so the
auto-labelling step knows what to expect:

    kameez / kurta (whole garment, long lower part and sleeves) -> 4 Upper-clothes
    shirt / t-shirt (Western controls)                          -> 4 Upper-clothes
    shalwar, trousers, jeans                                     -> 6 Pants
    dupatta                                                      -> 17 Scarf

The list is balanced by construction (exact shares per garment group and
gender), seeded (same seed -> same list) and shuffled, so any first part of
it (for example when generation stops at its time budget) is still mixed.
"""

import random
import re

UPPER_CLOTHES = 4
PANTS = 6
SCARF = 17

# (top, gender, share of all specs). Shares add up to 1.
GROUPS = [
    ("kameez", "woman", 0.20),
    ("kameez", "man", 0.15),
    ("kurta", "woman", 0.15),
    ("kurta", "man", 0.15),
    ("shirt", "woman", 0.0875),
    ("shirt", "man", 0.0875),
    ("tshirt", "woman", 0.0875),
    ("tshirt", "man", 0.0875),
]

LONG_TOPS = ("kameez", "kurta")
# Share of women's kameez / kurta specs that get a dupatta (men never do).
DUPATTA_SHARE = {"kameez": 0.7, "kurta": 0.4}

# Lowest row of the top, as a share of the person's height (head top = 0,
# feet = 1). The hip/crotch line is near 0.5, the knee near 0.72.
# Long tops must reach at least this far down to count as long ...
MIN_HEM = {"kameez": 0.55, "kurta": 0.50}
# ... and short tops must stop above this.
MAX_HEM = {"shirt": 0.60, "tshirt": 0.60}

BOTTOMS = {
    "kameez": ["shalwar"],
    "kurta": ["shalwar", "shalwar", "trousers", "jeans"],
    "shirt": ["trousers", "jeans"],
    "tshirt": ["trousers", "jeans"],
}

COLOURS = [
    "white", "black", "navy blue", "sky blue", "maroon", "red", "pink",
    "peach", "mustard yellow", "olive green", "emerald green", "teal",
    "grey", "beige", "cream", "purple", "lavender", "brown", "orange",
    "off-white",
]
PATTERNS = {
    "kameez": ["plain", "neck-embroidered", "block printed", "floral printed", "lawn printed", "lace-trimmed"],
    "kurta": ["plain", "embroidered", "chikankari", "buttoned", "printed"],
    "shirt": ["plain", "striped", "checked", "plain oxford"],
    "tshirt": ["plain", "striped", "plain crew neck"],
}
FABRICS = {
    "kameez": ["cotton", "lawn", "linen", "khaddar", "silk"],
    "kurta": ["cotton", "linen", "khaddar", "silk"],
    "shirt": ["cotton", "linen", "denim"],
    "tshirt": ["cotton", "jersey"],
}
AGES = ["young", "adult", "middle-aged"]
WESTERN_PEOPLE = ["South Asian", "Pakistani", "European", "African", "East Asian", "Middle Eastern", "Latino"]
SOUTH_ASIAN_PEOPLE = ["Pakistani", "Pakistani", "South Asian", "Indian", "Bangladeshi"]
BACKGROUNDS = [
    "plain light grey studio backdrop",
    "plain white studio wall",
    "softly lit photo studio",
    "modern living room",
    "bedroom with a wardrobe",
    "office corridor",
    "quiet city street",
    "market street",
    "park with trees",
    "courtyard with brick walls",
    "shopping mall hallway",
    "house front with a gate",
]
POSES = [
    "standing straight, arms at the sides",
    "A-pose, arms slightly away from the body",
    "standing, arms slightly out from the hips",
    "standing relaxed, arms at the sides",
    "standing upright, hands open beside the thighs",
]

FRAMING = "front view, head to toe, feet visible, one person"
QUALITY = "realistic photo, sharp focus"
NEGATIVE_PROMPT = (
    "cropped, close-up, portrait, cut off feet, cut off head, two people, multiple people, crowd, "
    "mirror, reflection, back view, side view, sitting, nsfw, nude, deformed, extra arms, extra legs, "
    "bad anatomy, blurry, lowres, text, watermark, logo, cartoon, drawing, anime, 3d render"
)

# Every 14 specs: 2 go to the held-out test set, 1 to validation (used to
# pick the best epoch), 11 to training.
SPLIT_CYCLE = 14
TEST_POSITIONS = (3, 10)
VAL_POSITIONS = (0,)


def split_for(index):
    position = index % SPLIT_CYCLE
    if position in TEST_POSITIONS:
        return "test"
    if position in VAL_POSITIONS:
        return "val"
    return "train"


def _group_counts(total):
    """Exact number of specs per group, adding up to `total` (largest
    remainder rounding, so shares are as close as possible)."""
    raw = [share * total for _, _, share in GROUPS]
    counts = [int(value) for value in raw]
    order = sorted(range(len(GROUPS)), key=lambda i: raw[i] - counts[i], reverse=True)
    for i in order[: total - sum(counts)]:
        counts[i] += 1
    return counts


def _cycle(rng, options, count):
    """`count` picks from `options`, each used as evenly as possible, in a
    seeded random order."""
    picks = [options[i % len(options)] for i in range(count)]
    rng.shuffle(picks)
    return picks


def _article(word):
    return "an" if word[:1].lower() in "aeiou" else "a"


def _garment_phrase(top, colour, pattern, fabric):
    pattern_text = "" if pattern == "plain" else pattern + " "
    kind = {
        "kameez": "knee-length kameez with long sleeves",
        "kurta": "mid-thigh kurta with long sleeves",
        "shirt": "long-sleeve shirt",
        "tshirt": "short-sleeve t-shirt",
    }[top]
    return f"{_article(colour)} {colour} {pattern_text}{fabric} {kind}"


def _bottom_phrase(bottom, colour):
    if bottom == "shalwar":
        return f"loose {colour} shalwar"
    if bottom == "jeans":
        return f"{colour} jeans"
    return f"{colour} trousers"


def _bottom_colour(rng, bottom, top_colour):
    if bottom == "jeans":
        return rng.choice(["blue", "dark blue", "light blue", "black", "grey"])
    if bottom == "shalwar":
        # A matching suit is the usual case.
        return top_colour if rng.random() < 0.6 else rng.choice(COLOURS)
    return rng.choice(["black", "grey", "navy blue", "beige", "khaki", "brown", "white"])


def expected_labels(top, bottom, dupatta):
    required = [UPPER_CLOTHES, PANTS] + ([SCARF] if dupatta else [])
    return {
        "top": UPPER_CLOTHES,
        "bottom": PANTS,
        "dupatta": SCARF if dupatta else None,
        "required": required,
    }


def build_specs(total=1200, seed=1234):
    """A balanced, seeded, shuffled list of `total` generation specs."""
    rng = random.Random(seed)
    specs = []
    for (top, gender, _), count in zip(GROUPS, _group_counts(total)):
        bottoms = _cycle(rng, BOTTOMS[top], count)
        colours = _cycle(rng, COLOURS, count)
        patterns = _cycle(rng, PATTERNS[top], count)
        fabrics = _cycle(rng, FABRICS[top], count)
        backgrounds = _cycle(rng, BACKGROUNDS, count)
        poses = _cycle(rng, POSES, count)
        ages = _cycle(rng, AGES, count)
        people = _cycle(rng, SOUTH_ASIAN_PEOPLE if top in LONG_TOPS else WESTERN_PEOPLE, count)
        dupatta_count = round(count * DUPATTA_SHARE.get(top, 0.0)) if gender == "woman" else 0
        dupattas = [True] * dupatta_count + [False] * (count - dupatta_count)
        rng.shuffle(dupattas)
        for i in range(count):
            bottom = bottoms[i]
            spec = {
                "gender": gender,
                "age": ages[i],
                "people": people[i],
                "top": top,
                "long_top": top in LONG_TOPS,
                "sleeves": "short" if top == "tshirt" else "full",
                "bottom": bottom,
                "dupatta": dupattas[i],
                "colour": colours[i],
                "bottom_colour": _bottom_colour(rng, bottom, colours[i]),
                "dupatta_colour": rng.choice(COLOURS) if dupattas[i] else None,
                "pattern": patterns[i],
                "fabric": fabrics[i],
                "background": backgrounds[i],
                "pose": poses[i],
                "min_hem": MIN_HEM.get(top),
                "max_hem": MAX_HEM.get(top),
            }
            spec["expected"] = expected_labels(top, bottom, spec["dupatta"])
            specs.append(spec)
    rng.shuffle(specs)
    for index, spec in enumerate(specs):
        spec["id"] = f"{index:05d}"
        spec["seed"] = seed * 100000 + index
        spec["split"] = split_for(index)
        spec["prompt"] = positive_prompt(spec)
        spec["negative_prompt"] = NEGATIVE_PROMPT
    return specs


def positive_prompt(spec):
    person = f"{_article(spec['age'])} {spec['age']} {spec['people']} {spec['gender']}"
    garment = _garment_phrase(spec["top"], spec["colour"], spec["pattern"], spec["fabric"])
    parts = [
        f"full body photo of {person} wearing {garment}",
        _bottom_phrase(spec["bottom"], spec["bottom_colour"]),
    ]
    if spec["dupatta"]:
        parts.append(f"{spec['dupatta_colour']} dupatta over the shoulders")
    # CLIP reads at most 77 tokens, so the important words come first.
    parts += [spec["pose"], FRAMING, spec["background"], QUALITY]
    return ", ".join(parts)


def approx_token_count(text):
    """A rough CLIP token count (a word or a punctuation mark each). Real
    BPE splits some rare words further, so keep well under 77."""
    return len(re.findall(r"[A-Za-z]+|[^\sA-Za-z]", text))


def summary(specs):
    """Counts per (top, gender), bottom, dupatta and split, for printing."""
    table = {}
    for key in ("top", "bottom", "dupatta", "split", "gender"):
        counts = {}
        for spec in specs:
            counts[str(spec[key])] = counts.get(str(spec[key]), 0) + 1
        table[key] = dict(sorted(counts.items()))
    return table
