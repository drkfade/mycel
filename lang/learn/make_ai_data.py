# Writes the generated training sets for the AI track's data page (site/public/mycel/learn/ai/data/).
#   weather.txt  - weather sentences from templates, seeded so the file is reproducible
#   recipes.txt  - short recipes from templates, seeded
#   mycel_code.txt - the Mycel programs in lang/examples and lang/learn/samples, joined in sorted order, with
#                    identical files kept once (the solution files repeat their examples)
# Run from anywhere: python3 lang/learn/make_ai_data.py
import hashlib
import os
import random
import glob

here = os.path.dirname(os.path.abspath(__file__))
lang = os.path.abspath(os.path.join(here, ".."))
out_dir = os.path.join(lang, "..", "site", "public", "mycel", "learn", "ai", "data")
os.makedirs(out_dir, exist_ok=True)


def write(name, lines):
    with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


# weather.txt -----------------------------------------------------------------
rnd = random.Random(21)
places = ["the coast", "the hills", "the city", "the valley", "the north", "the south", "the harbour", "the moor",
          "the lake district", "the old town", "the river plain", "the island"]
sky = ["clear skies", "high cloud", "thin cloud", "heavy cloud", "fog", "light drizzle", "steady rain",
       "heavy rain", "sleet", "snow showers", "hail", "a thunderstorm", "bright sunshine", "sea mist"]
wind = ["a light breeze", "a gentle wind", "a strong wind", "gusts from the west", "a cold wind from the north",
        "a warm wind from the south", "still air", "gusts from the east"]
days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
when = ["in the morning", "by noon", "in the afternoon", "after dark", "overnight", "all day", "later in the week"]
openers = ["The forecast for {p} says {s}.", "Expect {s} over {p}.", "{d} brings {s} to {p}.",
           "{p} will see {s} {w}.", "Today in {p}: {s} and {wd}.", "It is {t} degrees in {p}, with {s}."]
weather = set()
while len(weather) < 1000:
    p = rnd.choice(places)
    s = rnd.choice(sky)
    line = rnd.choice(openers).format(p=p, s=s, d=rnd.choice(days), w=rnd.choice(when), wd=rnd.choice(wind),
                                       t=rnd.randint(-4, 27))
    line = line[0].upper() + line[1:]
    if rnd.random() < 0.5:
        line += f" {rnd.choice(wind).capitalize()}, and the high is {rnd.randint(-2, 30)} degrees."
    weather.add(line)
weather = sorted(weather)
rnd.shuffle(weather)
write("weather.txt", weather)

# recipes.txt -----------------------------------------------------------------
rnd = random.Random(33)
dishes = ["Lentil soup", "Garlic bread", "Pea risotto", "Tomato salad", "Apple crumble", "Bean chilli", "Mushroom pie",
          "Carrot cake", "Leek tart", "Oat porridge", "Potato hash", "Lemon pasta", "Chickpea stew", "Spinach omelette",
          "Banana bread", "Onion soup", "Rice pudding", "Cabbage slaw", "Herb flatbread", "Plum jam", "Pumpkin soup",
          "Fried rice", "Cheese scones", "Beetroot dip", "Corn fritters"]
items = ["onion", "garlic", "carrot", "leek", "tomato", "potato", "lentils", "chickpeas", "rice", "flour", "butter",
         "milk", "eggs", "cheese", "spinach", "apples", "oats", "sugar", "lemon", "thyme", "parsley", "cumin",
         "black pepper", "olive oil", "stock", "cabbage", "beans", "mushrooms", "pumpkin", "honey", "yoghurt"]
steps = ["Chop the {a} and cook it gently in {b} for ten minutes.", "Add the {a} and {b}, then stir for two minutes.",
         "Simmer everything for {n} minutes until soft.", "Bake at 180 degrees for {n} minutes.",
         "Season with salt and {a}, then serve warm.", "Mix the {a} with {b} and rest for {n} minutes.",
         "Fry the {a} until golden, about {n} minutes."]
recipes = set()
while len(recipes) < 500:
    name = rnd.choice(dishes)
    ing = rnd.sample(items, rnd.randint(3, 5))
    lines = [f"{name}: {', '.join(ing)}."]
    for _ in range(rnd.randint(2, 3)):
        a, b = rnd.sample(items, 2)
        lines.append(rnd.choice(steps).format(a=a, b=b, n=rnd.choice([5, 8, 10, 12, 15, 20, 25, 30, 40])))
    recipes.add(" ".join(lines))
recipes = sorted(recipes)
rnd.shuffle(recipes)
write("recipes.txt", recipes)

# mycel_code.txt --------------------------------------------------------------
files = sorted(
    glob.glob(os.path.join(lang, "examples", "**", "*.myc"), recursive=True)
    + glob.glob(os.path.join(lang, "learn", "samples", "*.myc"))
    + glob.glob(os.path.join(lang, "learn", "samples", "ai", "*.myc"))
)
seen = set()
chunks = []
for f in files:
    if "node_modules" in f or "ply_modules" in f:
        continue
    text = open(f, encoding="utf-8").read().strip("\n")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if digest in seen:
        continue
    seen.add(digest)
    chunks.append(text)
open(os.path.join(out_dir, "mycel_code.txt"), "w", encoding="utf-8", newline="\n").write("\n\n".join(chunks) + "\n")
print("wrote", out_dir)
