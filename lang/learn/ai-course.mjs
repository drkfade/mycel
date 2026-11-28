// The "AI development in Mycel" track. The code lives in samples/ai/*.myc (one file per example, one per solution);
// the outputs below were copied from running those files with lang/bin/mycel. check-ai.mjs re-runs every file and
// fails when an output differs; build-ai.mjs renders this into site/public/mycel/learn/ai/index.html.
export const track = {
  title: "AI development in Mycel",
  intro: `Fifteen short lessons that build the ideas behind AI from nothing: a rule-based bot, a spam filter that learns from
examples, a nearest-neighbour classifier, a single learning neuron, text as numbers, a call to a language model, a small
chatbot app, and a fair test of whether your AI is any good. Lessons 11 to 15 go further and build a tiny transformer, the
kind of model behind modern chatbots, on your own laptop with the tensor package: tensors, autograd, a bigram name
generator, one attention head and a whole tiny GPT. Each lesson has one runnable example and one small exercise with its
solution. Lessons 1 to 10 need no libraries; lessons 11 to 15 need the tensor package.`,
};

export const units = [
  { id: "ai-unit-0", num: 0, title: "Rules & Patterns", badge: "Pattern Finder", desc: "Functions, structured data, rule bots, word counting, and nearest-neighbour classification." },
  { id: "ai-unit-1", num: 1, title: "Learning & Language", badge: "Model Tester", desc: "Learning neurons, bag-of-words similarity, calling a language model, a chatbot app, and fair evaluation." },
  { id: "ai-unit-2", num: 2, title: "Tensors & Tiny GPT", badge: "Tiny GPT Builder", desc: "Tensors, autograd, bigram generators, causal self-attention, and a complete tiny transformer." },
];

export const lessons = [
  {
    id: "what-is-ai", unit: 0, points: 15, browserRunnable: true, file: "01_what_is_ai", title: "What AI is, in plain words",
    text: `<p>People use "AI" for many things. Most of it is software that makes decisions or guesses from information.
Machine learning is one part of AI. Instead of writing every rule yourself, you show the program examples, and it works
out a rule from them.</p>
<p>In this course you will build small versions of those ideas. Nothing is hidden. Every result is something you can
print and check.</p>
<p>The first building block is a <b>function</b>: a named piece of code that takes an input and gives back an answer.
<code>fn</code> starts a function. <code>-&gt; Bool</code> says it gives back <code>true</code> or <code>false</code>.
<code>return</code> sends the answer back.</p>`,
    out: `true
false`,
    task: `Write <code>is_greeting(text)</code> below <code>is_question</code>. It should give <code>true</code> when the
text starts with <code>hi</code> or <code>hello</code>, whatever the capitals. Print it for <code>"Hello there"</code> and
<code>"Is it raining?"</code>.`,
    exercise: { file: "01_what_is_ai_solution", out: `true
false` },
    hints: [
      `Convert the input with <code>text.lower()</code> so <code>"Hello"</code> matches <code>"hello"</code>.`,
      `Check <code>lower.startsWith("hi") or lower.startsWith("hello")</code> and return that Bool.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "lower()" },
        sampleWrong: `fn is_question(text: String) -> Bool { return text.endsWith("?") }\nfn is_greeting(text: String) -> Bool {\n  return text.startsWith("hi") or text.startsWith("hello")\n}\nprint(is_greeting("Hello there"))\nprint(is_greeting("Is it raining?"))`,
        reason: `Text comparisons are case-sensitive, so "Hello there" does not start with lowercase "hello". Call .lower() first so any capitalization matches.`,
        concept: "Case-insensitive matching (.lower())"
      }
    ],
  },
  {
    id: "data", unit: 0, points: 15, browserRunnable: true, file: "02_data", title: "Data: lists, tuples and maps",
    text: `<p>AI starts with data: examples written in a form a program can read.</p>
<p>A <b>list</b> holds values in order, in square brackets. A <b>tuple</b> groups the values for one row, in round
brackets, like one line of a table. A <b>map</b> looks values up by a key, in curly brackets, like
<code>counts["spam"]</code>.</p>
<p><code>for (text, is_spam) in emails</code> runs the block once per row and splits each row into its two parts.
<code>emails.length</code> counts the rows. <code>var</code> makes a value that can change. <code>let</code> makes one
that cannot.</p>
<p>A map keeps one kind of value, so a count per label fits in a map. A row that mixes text and true/false is a tuple.</p>`,
    out: `2 of 4 emails are spam
("Lunch at noon?", false)
{"spam": 2, "not spam": 2}
2`,
    task: `Count the emails that are <i>not</i> spam, and print them as <code>N are not spam</code>. The program already
counts the spam ones with <code>var spam_count</code>. Add a second counter next to it.`,
    exercise: { file: "02_data_solution", out: `2 are not spam` },
    hints: [
      `Declare <code>var not_spam_count = 0</code> alongside <code>spam_count</code>.`,
      `Inside the loop, add an <code>else { not_spam_count += 1 }</code> branch and print <code>f"{not_spam_count} are not spam"</code>.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "else" },
        sampleWrong: `let emails = [("Win a free prize now", true), ("Lunch at noon?", false), ("Free money, click here", true), ("Notes from today's meeting", false)]\nvar spam_count = 0\nfor (text, is_spam) in emails {\n  if is_spam { spam_count += 1 }\n}\nprint(f"{emails.length} are not spam")`,
        reason: `You printed the total email count instead of counting only the non-spam ones. Add an else branch (or check !is_spam) to count emails that are not spam.`,
        concept: "Counting with if / else"
      }
    ],
  },
  {
    id: "rule-bot", unit: 0, points: 15, browserRunnable: true, file: "03_rule_bot", title: "A rule-based bot",
    text: `<p>The first kind of AI most people build is a <b>rule-based bot</b>. You write all the rules yourself. The bot
looks for words in a message and picks a reply. It is simple and predictable, but it only knows what you told it.</p>
<p><code>message.lower()</code> turns the text into lower case, so <code>Refund</code> and <code>refund</code> match the
same rule. <code>"refund" in text</code> is true when the word appears in the text. <code>or</code> means that either
check may be true.</p>
<p>The rules are checked from top to bottom, and the first <code>return</code> that matches wins. The last line is the
fallback for anything the bot did not expect.</p>`,
    out: `Hello! How can I help?
We are open 9 to 5, Monday to Friday.
I can help with a refund. What is your order number?
Sorry, I did not understand that.`,
    task: `Add a rule for <code>thanks</code> that replies <code>You are welcome!</code>. Put it above the fallback. Then
print the reply for <code>"Thanks a lot"</code> and for <code>"Tell me a joke"</code>.`,
    exercise: { file: "03_rule_bot_solution", out: `You are welcome!
Sorry, I did not understand that.` },
    hints: [
      `Check <code>if "thanks" in text { return "You are welcome!" }</code> before the fallback <code>return</code>.`,
      `At the bottom, print <code>reply("Thanks a lot")</code> and <code>reply("Tell me a joke")</code>.`
    ],
    commonMistakes: [
      {
        match: { outputIncludes: "Sorry, I did not understand that.\nYou are welcome!" },
        sampleWrong: `fn reply(message: String) -> String {\n  let text = message.lower()\n  if "thanks" in text { return "You are welcome!" }\n  return "Sorry, I did not understand that."\n}\nprint(reply("Tell me a joke"))\nprint(reply("Thanks a lot"))`,
        reason: `Print the reply for "Thanks a lot" first, then the fallback reply for "Tell me a joke".`,
        concept: "Rule order & expected test order"
      },
      {
        match: { codeMissing: "thanks" },
        sampleWrong: `fn reply(message: String) -> String {\n  let text = message.lower()\n  if "hello" in text { return "Hello! How can I help?" }\n  return "Sorry, I did not understand that."\n}\nprint(reply("Thanks a lot"))\nprint(reply("Tell me a joke"))`,
        reason: `No rule matches "thanks" yet, so "Thanks a lot" falls through to the fallback message. Add a check for "thanks" above the fallback return.`,
        concept: "Rule-based matching"
      }
    ],
  },
  {
    id: "learner", unit: 0, points: 20, browserRunnable: true, file: "04_learn_from_examples", title: "A tiny learner: counting words",
    text: `<p>This time the program learns from examples. You give it messages marked spam or not spam, and it counts how
often each word appears in each kind.</p>
<p>A new message gets a score. A word that was common in spam adds to the score. A word that was common in normal
messages takes away from it. This is a simpler cousin of the naive Bayes spam filter, which uses probabilities instead
of plain counts.</p>
<p><code>getOr(word, 0)</code> looks a word up in a map and gives 0 when the word has never been seen. Both maps are
<code>var</code>, because learning changes them.</p>`,
    out: `free money -> spam 3
lunch today -> not spam -2
win a prize -> spam 2`,
    task: `Add <code>"free lunch"</code> to the list of messages and print its score. Which word pushes it towards spam,
and which pushes it away?`,
    exercise: { file: "04_learn_from_examples_solution", out: `free money -> spam 3
lunch today -> not spam -2
win a prize -> spam 2
free lunch -> spam 1` },
    hints: [
      `Keep the three existing test strings in <code>test_messages</code> and append <code>"free lunch"</code>.`,
      `Loop over <code>test_messages</code> and print each message with its label and score.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "free lunch" },
        sampleWrong: `var spam_words: {String: Int} = {}\nvar ham_words: {String: Int} = {}\nfn learn(text: String, is_spam: Bool) {\n  for word in text.lower().split(" ") {\n    if is_spam { spam_words[word] = spam_words.getOr(word, 0) + 1 }\n    else { ham_words[word] = ham_words.getOr(word, 0) + 1 }\n  }\n}\nfn score(text: String) -> Int {\n  var total = 0\n  for word in text.lower().split(" ") { total += spam_words.getOr(word, 0) - ham_words.getOr(word, 0) }\n  return total\n}\nlearn("win free money now", true)\nlearn("free prize click now", true)\nlearn("lunch at noon", false)\nlearn("meeting notes for today", false)\nfor msg in ["free money", "lunch today", "win a prize"] {\n  let s = score(msg)\n  print(f"{msg} -> {if s > 0 { \\"spam\\" } else { \\"not spam\\" }} {s}")\n}`,
        reason: `You have not added "free lunch" to the test messages yet — add it to see how opposing word scores combine.`,
        concept: "Additive word scoring"
      }
    ],
  },
  {
    id: "nearest", unit: 0, points: 20, browserRunnable: true, file: "05_nearest", title: "Nearest neighbour: learning by example",
    text: `<p>Here the program keeps all the examples and does not work out a rule. To label a new point, it finds the
example closest to it and copies that example's label. This is called <b>nearest neighbour</b>.</p>
<p>Closeness is distance. For two points, the distance is the square root of the squared differences:
<code>(dx * dx + dy * dy).sqrt()</code>. Each example is a tuple of x, y and the label.</p>`,
    out: `cat
dog`,
    task: `Print <code>classify(0.5, 0.5)</code> as well. Which label does it get, and why?`,
    exercise: { file: "05_nearest_solution", out: `cat
dog
cat` },
    hints: [
      `Keep the two existing <code>print(classify(...))</code> lines and add a third one below them.`,
      `Call <code>print(classify(0.5, 0.5))</code> and compare its distance to <code>(1.0, 1.0)</code>.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "0.5" },
        sampleWrong: `let examples = [(1.0, 1.0, "cat"), (1.5, 2.0, "cat"), (6.0, 5.0, "dog"), (7.0, 7.0, "dog")]\nfn distance(ax: Float, ay: Float, bx: Float, by: Float) -> Float {\n  let dx = ax - bx\n  let dy = ay - by\n  return (dx * dx + dy * dy).sqrt()\n}\nfn classify(x: Float, y: Float) -> String {\n  var best_label = "?"\n  var best_distance = 1000.0\n  for (ex, ey, label) in examples {\n    let d = distance(x, y, ex, ey)\n    if d < best_distance { best_distance = d; best_label = label }\n  }\n  return best_label\n}\nprint(classify(2.0, 1.5))\nprint(classify(6.2, 5.8))`,
        reason: `You have not called classify(0.5, 0.5) yet — add print(classify(0.5, 0.5)) after the first two print lines.`,
        concept: "Nearest-neighbour classification"
      }
    ],
  },
  {
    id: "neuron", unit: 1, points: 25, browserRunnable: true, file: "06_perceptron", title: "A learning neuron",
    text: `<p>A <b>perceptron</b> is one artificial neuron. It multiplies each input by a weight, adds the results and a
bias number, and answers 1 when the total is above 0, or 0 when it is not.</p>
<p>Learning means changing the weights after each mistake. <code>error</code> is the target minus the guess. It is 0
when the guess was right. Each weight moves a little in the direction that would fix the mistake. <code>rate</code>
sets how big each move is.</p>
<p>This program learns AND: the answer is 1 only when both inputs are 1. One neuron can learn any rule that a single
straight line can split, such as AND or OR. It cannot learn XOR, which needs more than one line.</p>`,
    out: `0 AND 0 -> 0
0 AND 1 -> 0
1 AND 0 -> 0
1 AND 1 -> 1
weights: 0.20 0.10 bias -0.20`,
    task: `Change the examples to OR, where the answer is 1 when either input is 1. Run it and check the four answers.`,
    exercise: { file: "06_perceptron_solution", out: `0 OR 0 -> 0
0 OR 1 -> 1
1 OR 0 -> 1
1 OR 1 -> 1
weights: 0.10 0.10 bias 0.00` },
    hints: [
      `Update the target in <code>examples</code> for <code>(0.0, 1.0)</code> and <code>(1.0, 0.0)</code> from <code>0.0</code> to <code>1.0</code>.`,
      `Also update the print label from <code>AND</code> to <code>OR</code> so the printout matches.`
    ],
    commonMistakes: [
      {
        match: { outputIncludes: "AND" },
        sampleWrong: `var w1 = 0.0\nvar w2 = 0.0\nvar bias = 0.0\nlet rate = 0.1\nlet examples = [(0.0, 0.0, 0.0), (0.0, 1.0, 1.0), (1.0, 0.0, 1.0), (1.0, 1.0, 1.0)]\nfn predict(a: Float, b: Float) -> Float {\n  let total = a * w1 + b * w2 + bias\n  if total > 0.0 { return 1.0 }\n  return 0.0\n}\nfor step in 0..20 {\n  for (a, b, target) in examples {\n    let error = target - predict(a, b)\n    w1 += rate * error * a\n    w2 += rate * error * b\n    bias += rate * error\n  }\n}\nfor (a, b, target) in examples { print(f"{a:.0f} AND {b:.0f} -> {predict(a, b):.0f}") }\nprint(f"weights: {w1:.2f} {w2:.2f} bias {bias:.2f}")`,
        reason: `The targets learned OR (0, 1, 1, 1), but your print line still writes "AND". Update the label in the f-string to "OR".`,
        concept: "Truth tables (AND vs OR)"
      },
      {
        match: { outputIncludes: "0 OR 1 -> 0" },
        sampleWrong: `var w1 = 0.0\nvar w2 = 0.0\nvar bias = 0.0\nlet rate = 0.1\nlet examples = [(0.0, 0.0, 0.0), (0.0, 1.0, 0.0), (1.0, 0.0, 0.0), (1.0, 1.0, 1.0)]\nfn predict(a: Float, b: Float) -> Float {\n  let total = a * w1 + b * w2 + bias\n  if total > 0.0 { return 1.0 }\n  return 0.0\n}\nfor step in 0..20 {\n  for (a, b, target) in examples {\n    let error = target - predict(a, b)\n    w1 += rate * error * a\n    w2 += rate * error * b\n    bias += rate * error\n  }\n}\nfor (a, b, target) in examples { print(f"{a:.0f} OR {b:.0f} -> {predict(a, b):.0f}") }\nprint(f"weights: {w1:.2f} {w2:.2f} bias {bias:.2f}")`,
        reason: `The training examples still have AND targets (0 for (0, 1) and (1, 0)). Change both of those targets to 1.0 so the perceptron learns OR.`,
        concept: "Training targets"
      }
    ],
  },
  {
    id: "text-numbers", unit: 1, points: 25, browserRunnable: true, file: "07_text_numbers", title: "Text as numbers",
    text: `<p>A program cannot do sums on words, so the first step is to turn text into numbers. A simple way is a
<b>bag of words</b>. Pick a fixed list of words (the vocabulary), then count how often each one appears in a message.
Word order is lost, but it is a useful start.</p>
<p><b>Similarity</b> compares two lists of numbers. The dot product multiplies them pair by pair and adds the results.
Dividing by the lengths gives <i>cosine similarity</i>. 1.00 means the two lists point the same way, with the same words
in the same proportions. 0.00 means they share no vocabulary words.</p>`,
    out: `[1.0, 1.0, 0.0, 0.0, 0.0]
free money vs free prize: 0.50
free money vs lunch: 0.00`,
    task: `Add a line that prints the similarity of <code>"free money"</code> and <code>"free money prize"</code>. Is it
higher or lower than the similarity of <code>"free money"</code> and <code>"free prize"</code>?`,
    exercise: { file: "07_text_numbers_solution", out: `[1.0, 1.0, 0.0, 0.0, 0.0]
free money vs free prize: 0.50
free money vs lunch: 0.00
free money vs free money prize: 0.82` },
    hints: [
      `Turn <code>"free money prize"</code> into a vector with <code>to_vector("free money prize")</code>.`,
      `Call <code>similarity(one, four)</code> and print <code>f"free money vs free money prize: {similarity(one, four):.2f}"</code>.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "free money prize" },
        sampleWrong: `let vocab = ["free", "money", "lunch", "meeting", "prize"]\nfn to_vector(text: String) -> [Float] {\n  let words = text.lower().split(" ")\n  return vocab.map((v) => words.filter((w) => w == v).length.toFloat())\n}\nfn dot(a: [Float], b: [Float]) -> Float {\n  var total = 0.0\n  for i in 0..a.length { total += a[i] * b[i] }\n  return total\n}\nfn similarity(a: [Float], b: [Float]) -> Float { return dot(a, b) / (dot(a, a).sqrt() * dot(b, b).sqrt()) }\nlet one = to_vector("free money now")\nlet two = to_vector("free prize")\nlet three = to_vector("lunch at noon")\nprint(one)\nprint(f"free money vs free prize: {similarity(one, two):.2f}")\nprint(f"free money vs lunch: {similarity(one, three):.2f}")`,
        reason: `Add a fourth vector for "free money prize" using to_vector(...) and print its similarity against one.`,
        concept: "Bag-of-words cosine similarity"
      }
    ],
  },
  {
    id: "language-model", unit: 1, points: 25, browserRunnable: false, file: "08_ask_a_model", title: "Calling a language model",
    flags: "--allow-net --allow-listen",
    text: `<p>A <b>language model</b> is a program that predicts text. Most run as online services, and you talk to them over
the internet. The usual way is an <b>HTTP POST</b>: you send a message in JSON and get a JSON reply back. Many services
accept the same chat message shape that this lesson uses.</p>
<p>So this lesson runs with no account, the program starts a stand-in model on your own computer. It always gives the
same answer, so the output says nothing about a real model's skill. The steps are the real ones:</p>
<ul>
<li>build the JSON body with <code>json.encode</code>,</li>
<li>send it with <code>http.post</code>, with the headers,</li>
<li>read the JSON reply and take out the text.</li>
</ul>
<p>Each step after <code>.get</code> ends with <code>?</code>. That checks for a missing part, because a reply may not
have the shape you expect.</p>
<p>To use a real service, set its address and your key in an environment variable. Read the key with
<code>env.get("MYCEL_AI_KEY")</code>, and never write it into a file you share. Mycel only lets a program use the network
or open a port when you grant it, so run this file with <code>mycel run --allow-net --allow-listen</code>.</p>`,
    out: `Model says: Spam is unwanted junk email.`,
    task: `Ask a second question, <code>"Is email spam?"</code>, and print its answer too.`,
    exercise: { file: "08_ask_a_model_solution", flags: "--allow-net --allow-listen", out: `Model says: Spam is unwanted junk email.
Model says: Spam is unwanted junk email.` },
    hints: [
      `Inside <code>main()</code>, call <code>await ask(url, "Is email spam?")</code> before <code>server.stop()</code>.`,
      `Print the second answer with <code>print("Model says:", answer2)</code>.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "Is email spam?" },
        sampleWrong: `let answer = await ask(url, "What is spam?")\nprint("Model says:", answer)\nserver.stop()`,
        reason: `Call await ask(url, "Is email spam?") before server.stop() and print the second reply too.`,
        concept: "Reusing async HTTP requests"
      }
    ],
  },
  {
    id: "chatbot-app", unit: 1, points: 25, browserRunnable: false, file: "09_chatbot_app", title: "A small chatbot app",
    stdin: "hi there\nare you open\nI want a refund\nbye\nnever shown\n",
    text: `<p>Now put the pieces together into a small app. It reads lines that you type, answers with the rules from lesson 3,
and stops when you type <code>bye</code>.</p>
<p><code>await io.readLine()</code> waits for one line. It gives <code>nil</code> when the input has ended, so the
program checks for that and stops. <code>line!</code> says that the value is not nil. <code>async fn main()</code> lets
the program wait for input.</p>
<p>The output below is the same program with these lines typed in: <code>hi there</code>,
<code>are you open</code>, <code>I want a refund</code> and <code>bye</code>.</p>`,
    out: `Support bot. Type bye to stop.
you: hi there
bot: Hello! How can I help?
you: are you open
bot: We are open 9 to 5, Monday to Friday.
you: I want a refund
bot: I can help with a refund. What is your order number?
Bye!`,
    task: `Add a rule for <code>price</code> that replies <code>Our prices are on the website.</code>. Put it above the
<code>hi</code> rule. Test it by typing <code>price?</code>, <code>hi</code> and <code>bye</code>.`,
    exercise: { file: "09_chatbot_app_solution", stdin: "price?\nhi\nbye\n", out: `Support bot. Type bye to stop.
you: price?
bot: Our prices are on the website.
you: hi
bot: Hello! How can I help?
Bye!` },
    hints: [
      `Add <code>if "price" in text { return "Our prices are on the website." }</code> inside <code>reply(message)</code>.`,
      `Place the <code>"price"</code> rule above the <code>"hi"</code> rule so inputs containing both match price first.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "price" },
        sampleWrong: `fn reply(message: String) -> String {\n  let text = message.lower()\n  if "hello" in text or "hi" in text { return "Hello! How can I help?" }\n  return "Sorry, I did not understand that."\n}`,
        reason: `No rule checks for "price" in text yet, so "price?" gets the fallback reply. Add a check for "price" above the greeting rule.`,
        concept: "Rule ordering in a chatbot"
      }
    ],
  },
  {
    id: "evaluate", unit: 1, points: 25, browserRunnable: true, file: "10_how_good_is_it", title: "Is your AI any good?",
    text: `<p>A learner can look right on the examples it has already seen and still fail on new ones. To check it fairly,
keep some examples out of training. Teach the program with the <b>training set</b> only, then test it on the
<b>test set</b>. The fraction it gets right is the <b>accuracy</b>.</p>
<p>Here the spam filter from lesson 4 learns from four messages and is tested on seven. It gets six right. Look at the
wrong one: <code>lunch money</code> has one spam word and one normal word, so its score is 0, and 0 is not called
spam.</p>
<p>Seven test messages are far too few to trust. A fair number needs many more examples, and more than one split of
training and test, before you believe it.</p>`,
    out: `wrong: lunch money | expected spam: true
6 of 7 correct (86%)`,
    task: `Add <code>("free money", true)</code> to the test set. Predict the new accuracy before you run it, then check.`,
    exercise: { file: "10_how_good_is_it_solution", out: `wrong: lunch money | expected spam: true
7 of 8 correct (88%)` },
    hints: [
      `Add <code>("free money", true)</code> to the <code>test</code> list, not the <code>train</code> list.`,
      `Keep the existing seven test items so the total test count becomes 8.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "\"free money\"" },
        sampleWrong: `var spam_words: {String: Int} = {}\nvar ham_words: {String: Int} = {}\nfn learn(text: String, is_spam: Bool) {\n  for word in text.lower().split(" ") {\n    if is_spam { spam_words[word] = spam_words.getOr(word, 0) + 1 }\n    else { ham_words[word] = ham_words.getOr(word, 0) + 1 }\n  }\n}\nfn score(text: String) -> Int {\n  var total = 0\n  for word in text.lower().split(" ") { total += spam_words.getOr(word, 0) - ham_words.getOr(word, 0) }\n  return total\n}\nlet train = [("win free money now", true), ("free prize click now", true), ("lunch at noon", false), ("meeting notes for today", false)]\nlet test = [("free money prize", true), ("lunch today", false), ("click for a free prize", true), ("notes from the meeting", false), ("win money now", true), ("lunch money", true), ("a quiet day", false)]\nfor (text, is_spam) in train { learn(text, is_spam) }\nvar correct = 0\nfor (text, is_spam) in test {\n  let guess = score(text) > 0\n  if guess == is_spam { correct += 1 } else { print("wrong:", text, "| expected spam:", is_spam) }\n}\nlet accuracy = correct.toFloat() / test.length.toFloat()\nprint(f"{correct} of {test.length} correct ({accuracy:.0%})")`,
        reason: `You still have 7 items in test — add ("free money", true) to the test list so accuracy is measured out of 8.`,
        concept: "Held-out test set"
      }
    ],
  },
  {
    id: "tensors", unit: 2, points: 30, browserRunnable: false, file: "11_tensors", title: "Tensors: lists and tables that do the sums for you",
    text: `<p>Lessons 6 and 7 used loops over plain lists. That is fine for ten items. A neural network multiplies
thousands of numbers in every step, and a loop over each number is far too slow. A <b>tensor</b> is a block of numbers
with a <b>shape</b>, and the shape says how big it is along each direction. The package does the arithmetic on the whole
block at once, in fast code. Your Mycel code only says what to do.</p>
<p><b>Set up once.</b> Lessons 11 to 15 use the <code>tensor</code> package. In a terminal, run
<code>mycel new tensor_lab</code>, then <code>cd tensor_lab</code>, then <code>ply install tensor</code>. Save each example
in the <code>tensor_lab</code> folder and run it there. If <code>ply install</code> says the package is not found, the
public package index does not list <code>tensor</code> yet, and you will need the package folder from the course
maintainers.</p>
<pre class="diagram">shape []          one number               5.0
shape [3]         a list                   [1.0  2.0  3.0]
shape [2, 3]      a table, 2 rows, 3 cols  1.0  2.0  3.0
                                           4.0  5.0  6.0
shape [2, 3, 4]   two tables, each 3 by 4</pre>
<p>Read a shape from the left: <code>[2, 3]</code> is two rows and three columns. <code>t.shape</code> gives the shape
back, so you can check it while you work.</p>
<p><b>Broadcasting</b> lets shapes that almost match work together. Line the two shapes up at their right-hand ends. Two
sizes fit when they are equal, or when one of them is 1. So a list of 3 numbers added to a table with 3 columns is added
to every row:</p>
<pre class="diagram">  [[ 0  1  2]     +    [10 20 30]     =    [[10 21 32]
   [ 3  4  5]]                                [13 24 35]]</pre>
<p><b>Matrix multiply</b>, <code>matmul</code>, is the main job in a neural network. Each output number is a row of the
left table times a column of the right table: the dot product from lesson 7, done for every pair. The shapes must fit.
<code>[m, k]</code> times <code>[k, n]</code> gives <code>[m, n]</code>, and the two <code>k</code> values must be equal.</p>
<p>The example multiplies the same two tables twice. The function <code>matmul_by_loops</code> uses three nested loops,
the way you would write it by hand. <code>a.matmul(b)</code> does the same job in the package. The answers match.</p>
<pre class="static excerpt"><code>fn matmul_by_loops(a: [[Float]], b: [[Float]]) -&gt; [[Float]] {
    var rows: [[Float]] = []
    for i in 0..a.length {
        var row: [Float] = []
        for j in 0..b[0].length {
            var total = 0.0
            for k in 0..b.length {
                total += a[i][k] * b[k][j]
            }
            row.push(total)
        }
        rows.push(row)
    }
    return rows
}</code></pre>`,
    out: `a list: shape [3], 3 numbers
tensor([[0.0, 1.0, 2.0],
        [3.0, 4.0, 5.0]])
a table: shape [2, 3]
tensor([[10.0, 21.0, 32.0],
        [13.0, 24.0, 35.0]])
tensor([[0.0, 3.0],
        [1.0, 4.0],
        [2.0, 5.0]])
tensor([3.0, 5.0, 7.0])
tensor([[3.0],
        [12.0]])
[3, 2]
tensor([[4.0, 5.0],
        [10.0, 11.0]])
[[4.0, 5.0], [10.0, 11.0]]
same answer: true`,
    task: `Print the sum of each row of <code>grid</code> as one tensor. Use <code>sum</code> with the axis number. Axis 0
runs down the rows, so <code>grid.sum(0)</code> adds down each column. Axis 1 runs across each row.`,
    exercise: { file: "11_tensors_solution", out: `a list: shape [3], 3 numbers
tensor([[0.0, 1.0, 2.0],
        [3.0, 4.0, 5.0]])
a table: shape [2, 3]
tensor([[10.0, 21.0, 32.0],
        [13.0, 24.0, 35.0]])
tensor([[0.0, 3.0],
        [1.0, 4.0],
        [2.0, 5.0]])
tensor([3.0, 5.0, 7.0])
tensor([[3.0],
        [12.0]])
[3, 2]
tensor([[4.0, 5.0],
        [10.0, 11.0]])
[[4.0, 5.0], [10.0, 11.0]]
same answer: true
tensor([3.0, 12.0])` },
    hints: [
      `<code>grid.sum(0)</code> adds down axis 0 (columns). Use axis <code>1</code> to sum across each row.`,
      `Add <code>print(grid.sum(1))</code> at the end of <code>main()</code>.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "sum(1" },
        sampleWrong: `print(grid.sum(0))`,
        reason: `Axis 0 sums down columns, giving 3 numbers ([3.0, 5.0, 7.0]). Pass axis 1 (grid.sum(1)) to sum across each row into a 1D tensor [3.0, 12.0].`,
        concept: "Tensor reduction axes"
      }
    ],
  },
  {
    id: "autograd", unit: 2, points: 30, browserRunnable: false, file: "12_autograd", title: "Autograd: how a model learns which way to nudge",
    text: `<p>In lesson 6 you nudged the weights by hand-written arithmetic. That works for one neuron. A model with millions
of weights needs the computer to work out every nudge. That is <b>automatic differentiation</b>, or <b>autograd</b>.</p>
<p>Start with a small sum. For <code>y = (3x + 2) squared</code> at <code>x = 1</code>, the answer is 25. Now ask: if
<code>x</code> goes up by a tiny amount, how fast does <code>y</code> go up? That rate is the <b>gradient</b>, written
dy/dx. Work it out one step at a time, backwards from the answer:</p>
<pre class="diagram">x = 1 --times 3--> 3 --plus 2--> 5 --square--> y = 25

going back from y, each step multiplies by how fast its output changes:
  square:   rate 2 * 5 = 10
  plus 2:   rate 1, so the 10 passes through unchanged
  times 3:  rate 3, so 10 * 3 = 30, which is dy/dx</pre>
<p>Multiplying the rates along the chain is called the <b>chain rule</b>. You do not have to do it yourself. In the
package, <code>requireGrad()</code> marks a tensor as one the model should learn, every maths step remembers how it was
made, and <code>.backward()</code> on the final number fills in <code>.grad</code> for every marked tensor.</p>
<p>The first part of the example checks the hand answer: <code>dy/dx</code> is 30.</p>
<p><b>Learning the neuron.</b> Lesson 6's neuron answered with a step: 0 or 1. A step is flat almost everywhere, so
there is no slope to follow. This version uses <code>sigmoid</code>, a smooth S-shaped curve from 0 to 1 that always has a
slope. The <b>loss</b> is the mean of the squared differences between the guesses and the targets. It is 0 when every
answer is right. Each round of training does five things: clear the old gradients, make the guesses, measure the loss,
call <code>backward()</code>, and let the <b>optimizer</b> move the weights. Here the optimizer is Adam. It uses the
gradients to choose each move, and the <code>0.1</code> is the learning rate: the largest move it may make.</p>
<p>These are the lines that do the learning:</p>
<pre class="static excerpt"><code>    for step in 0..=300 {
        opt.zeroGrad()
        let guess = (inputs.matmul(weights) + bias).sigmoid()
        let error = guess - targets
        let loss = (error * error).mean()
        if step % 100 == 0 {
            print(f"step {step:>3}  loss {loss.item():.4f}")
        }
        loss.backward()
        opt.step()
    }</code></pre>`,
    out: `x = 1.0, 3x + 2 = 5.0, y = 25.0
dy/dx = 30.0
step   0  loss 0.2500
step 100  loss 0.0158
step 200  loss 0.0057
step 300  loss 0.0030
0 AND 0 -> 0.00
0 AND 1 -> 0.06
1 AND 0 -> 0.06
1 AND 1 -> 0.94
weights: 5.38 5.38 bias -8.08`,
    task: `Train the same neuron to learn <b>OR</b>: the answer is 1 when either input is 1. Change the targets to
<code>[[0.0], [1.0], [1.0], [1.0]]</code> and the labels to OR. Run it and check the four answers.`,
    exercise: { file: "12_autograd_solution", out: `x = 1.0, 3x + 2 = 5.0, y = 25.0
dy/dx = 30.0
step   0  loss 0.2500
step 100  loss 0.0094
step 200  loss 0.0031
step 300  loss 0.0017
0 OR 0 -> 0.06
0 OR 1 -> 0.96
1 OR 0 -> 0.96
1 OR 1 -> 1.00
weights: 5.97 5.97 bias -2.73` },
    hints: [
      `Change <code>targets</code> to <code>tensor.table([[0.0], [1.0], [1.0], [1.0]])</code>.`,
      `Also update the printed labels from <code>AND</code> to <code>OR</code>.`
    ],
    commonMistakes: [
      {
        match: { codeIncludes: "AND" },
        sampleWrong: `let targets = tensor.table([[0.0], [1.0], [1.0], [1.0]])\nprint("0 AND 1 -> ...")`,
        reason: `Update the labels in the printout from AND to OR to match the new OR targets.`,
        concept: "Targets and labels in training"
      },
      {
        match: { codeIncludes: "[[0.0], [0.0], [0.0], [1.0]]" },
        sampleWrong: `let targets = tensor.table([[0.0], [0.0], [0.0], [1.0]])`,
        reason: `The targets tensor still represents AND (only [1, 1] is 1.0). Set the middle two targets to [1.0] so the network trains on OR.`,
        concept: "Target tensor for OR"
      }
    ],
  },
  {
    id: "bigram", unit: 2, points: 35, browserRunnable: false, file: "13_bigram", title: "A bigram name generator: count first, then learn",
    flags: "--allow-read=.",
    text: `<p>This lesson makes new names. You need <code>names.txt</code>, which the example reads. It is in the course
samples, next to the other files, so copy it into <code>tensor_lab</code>. It holds 1,000 made-up names, one per line.</p>
<p>A <b>bigram</b> is a pair of letters that sit next to each other. A dot marks the start and end of a name, so the name
<code>ana</code> gives four pairs:</p>
<pre class="diagram">name:   . a n a .
pairs:  .a an na a.</pre>
<p>A name generator can be very simple. Start from the dot. Pick the next letter with the chance that it followed the
current letter in your examples. Stop when you pick the dot again. That is the whole model.</p>
<p><b>Step one: count.</b> The program counts every pair in the names into a table. A row is the first letter and a
column is the letter after it. Dividing each row by its total gives the chance of each next letter. Counts have become a
model, with no learning at all.</p>
<p>The counting loop reads each name with a dot at both ends and adds one to the right cell for every pair:</p>
<pre class="static excerpt"><code>    for name in names {
        var word = ["."]
        for c in name.chars() {
            word.push(f"{c}")
        }
        word.push(".")
        for i in 0..(word.length - 1) {
            let a = alphabet.indexOf(word[i])!
            let b = alphabet.indexOf(word[i + 1])!
            counts[a][b] += 1
            xs.push(a)
            ys.push(b)
        }
    }</code></pre>
<p>A pair that never appears would get a chance of zero, and no name could ever use it. So the example adds 1 to every
count first. This is called <b>add-one smoothing</b>.</p>
<p><b>Step two: learn.</b> The same table can be learned with gradients. It becomes a grid of weights, and the loss is
<code>crossEntropy</code>: the average of minus the log of the chance the model gave to the letter that really came next.
The loss is small when the right letter gets a high chance. Training moves the grid until the loss stops falling.</p>
<p>The output shows the loss of the counting table and then the loss of the learned grid at each stage. The learned
grid ends a little lower, probably because it does not add one to every count. Its names are new too: none of the eight is in
<code>names.txt</code>, but they follow the same letter habits.</p>
<p>This model only looks one letter back. The next lesson looks at a whole sequence.</p>`,
    out: `1000 names, 25 symbols, 7913 pairs of letters
'a' is followed by 'n' 155 times
counting table: average loss 2.2584
["rdr", "pthargoga", "thetaiandteaxwe", "bus", "vporde", "shml", "zialdo", "n"]
step   0  loss 3.2189
step  50  loss 2.2368
step 100  loss 2.2305
step 150  loss 2.2290
step 200  loss 2.2283
["risuxzeteen", "s", "pin", "mkarnza", "bil", "dawe", "teliaspetho", "wushan"]`,
    task: `Add a line that prints how many names start with <code>b</code>. That is the count for the pair from the dot to
<code>b</code>. Check your answer with <code>grep -c "^b" names.txt</code> in the terminal.`,
    exercise: { file: "13_bigram_solution", flags: "--allow-read=.", out: `1000 names, 25 symbols, 7913 pairs of letters
'a' is followed by 'n' 155 times
names starting with b: 80
counting table: average loss 2.2584
["rdr", "pthargoga", "thetaiandteaxwe", "bus", "vporde", "shml", "zialdo", "n"]
step   0  loss 3.2189
step  50  loss 2.2368
step 100  loss 2.2305
step 150  loss 2.2290
step 200  loss 2.2283
["risuxzeteen", "s", "pin", "mkarnza", "bil", "dawe", "teliaspetho", "wushan"]` },
    hints: [
      `The start-of-name marker is <code>"."</code> at index <code>alphabet.indexOf(".")!</code> (which is 0).`,
      `Look up <code>counts[alphabet.indexOf(".")!][alphabet.indexOf("b")!]</code> — remember to subtract 1 if you read after smoothing, or read before adding 1.`
    ],
    commonMistakes: [
      {
        match: { codeMissing: "names starting with b" },
        sampleWrong: `print(counts[0][2])`,
        reason: `Print the count with the label "names starting with b: <count>" using the row for "." and the column for "b".`,
        concept: "Bigram count table indexing"
      }
    ],
  },
  {
    id: "attention", unit: 2, points: 35, browserRunnable: false, file: "14_attention", title: "Attention from scratch: one head, step by step",
    text: `<p>A bigram only sees the letter before it. A language model needs the whole text so far. <b>Attention</b> is the
part of a transformer that lets each position look back at the others and decide what to use. Every position makes three
vectors from its own word vector:</p>
<ul>
<li><b>query</b>: what this position is looking for,</li>
<li><b>key</b>: what this position offers when another position looks for it,</li>
<li><b>value</b>: what this position passes on when it is used.</li>
</ul>
<p>The example works through one attention head with four words and three numbers per word. The numbers are invented so
you can check them. Every step has its own printout.</p>
<p><b>Step one: scores.</b> Compare each query with each key, using a dot product from lesson 7. A high score means the
query and the key point the same way. Then divide every score by the square root of the vector size (3 here, so about
1.73). That keeps the numbers small enough for the next step.</p>
<p><b>Step two: the causal mask.</b> A word in a sentence may look at itself and at the words before it, but not at the
words after it. The mask adds minus a billion to every score that would look ahead. The printout shows minus a billion as
<code>-inf</code>. The mask is a table of 0 on and below the diagonal and minus a billion above it:</p>
<pre class="diagram">          word 1  word 2  word 3  word 4
word 1      ok
word 2      ok      ok
word 3      ok      ok      ok
word 4      ok      ok      ok      ok</pre>
<p><b>Step three: softmax.</b> Softmax turns each row of scores into positive numbers that add up to 1. A minus-billion
score becomes 0, so a masked word gets no weight at all. These are the attention weights. Row 0 can only see word 1, so
its weights are 1, 0, 0, 0.</p>
<p><b>Step four: mix the values.</b> Each output row is the weights times the values. The output for a word is a blend of
the values of the words it looked at, with the biggest blend from the words with the biggest weights.</p>
<p>The last line checks the mask. The first three outputs do not change when the last word changes, because no earlier
word can see it. That is what lets a model write one word at a time.</p>
<p>The heart of the attention step is these lines:</p>
<pre class="static excerpt"><code>fn attend(x: Tensor, wq: Tensor, wk: Tensor, wv: Tensor) -> Tensor {
    let q = x.matmul(wq)
    let k = x.matmul(wk)
    let v = x.matmul(wv)
    let scale = 1.0 / (3.0).sqrt()
    let scores = q.matmul(k.transpose()) * scale
    let masked = scores + tensor.causalMask(4)
    let weights = masked.softmax()
    return weights.matmul(v)
}</code></pre>`,
    out: `queries (what each word looks for)
    2.00    0.00    1.00
    0.00    2.00    0.00
    1.00    1.00    1.00
    1.00    1.00    0.00
keys (what each word offers)
    0.00    2.00    1.00
    2.00    0.00    2.00
    1.00    1.00    1.00
    1.00    1.00    2.00
values (what each word passes on)
    2.00    1.00    1.00
    0.00    2.00    2.00
    1.00    2.00    1.00
    1.00    1.00    2.00
scores: query dot key, scaled
    0.58    3.46    1.73    2.31
    2.31    0.00    1.15    1.15
    1.73    2.31    1.73    2.31
    1.15    1.15    1.15    1.15
after the causal mask
    0.58    -inf    -inf    -inf
    2.31    0.00    -inf    -inf
    1.73    2.31    1.73    -inf
    1.15    1.15    1.15    1.15
attention weights (each row adds to 1)
    1.00    0.00    0.00    0.00
    0.91    0.09    0.00    0.00
    0.26    0.47    0.26    0.00
    0.25    0.25    0.25    0.25
output
    2.00    1.00    1.00
    1.82    1.09    1.09
    0.79    1.74    1.47
    1.00    1.50    1.50
first three outputs unchanged when the last word changes: true`,
    task: `Take the mask out: compute the weights from <code>scores</code> alone, with <code>scores.softmax()</code>, and
print them with the label <code>attention weights with no mask</code>. Which row now looks at a word after it, and which
word does it look at most?`,
    exercise: { file: "14_attention_solution", out: `queries (what each word looks for)
    2.00    0.00    1.00
    0.00    2.00    0.00
    1.00    1.00    1.00
    1.00    1.00    0.00
keys (what each word offers)
    0.00    2.00    1.00
    2.00    0.00    2.00
    1.00    1.00    1.00
    1.00    1.00    2.00
values (what each word passes on)
    2.00    1.00    1.00
    0.00    2.00    2.00
    1.00    2.00    1.00
    1.00    1.00    2.00
scores: query dot key, scaled
    0.58    3.46    1.73    2.31
    2.31    0.00    1.15    1.15
    1.73    2.31    1.73    2.31
    1.15    1.15    1.15    1.15
after the causal mask
    0.58    -inf    -inf    -inf
    2.31    0.00    -inf    -inf
    1.73    2.31    1.73    -inf
    1.15    1.15    1.15    1.15
attention weights with no mask (each row adds to 1)
    0.04    0.65    0.11    0.20
    0.58    0.06    0.18    0.18
    0.18    0.32    0.18    0.32
    0.25    0.25    0.25    0.25
output
    2.00    1.00    1.00
    1.82    1.09    1.09
    0.79    1.74    1.47
    1.00    1.50    1.50` },
    hints: [
      `Call <code>scores.softmax()</code> directly instead of adding <code>tensor.causalMask(4)</code> first.`,
      `Print the heading <code>attention weights with no mask (each row adds to 1)</code> above that table.`
    ],
    commonMistakes: [
      {
        match: { codeIncludes: "masked.softmax()" },
        sampleWrong: `let weights = masked.softmax()`,
        reason: `masked still includes tensor.causalMask(4), which zeros out future positions. Apply .softmax() directly to scores instead.`,
        concept: "Causal mask vs unmasked attention"
      }
    ],
  },
  {
    id: "tiny-gpt", unit: 2, points: 50, browserRunnable: false, file: "15_tiny_gpt", title: "Your own tiny GPT, piece by piece",
    flags: "--allow-read=.",
    text: `<p>A GPT (generative pre-trained transformer) is a program that reads text one letter or word at a time and guesses
what comes next. The model here is a small one, and it works on letters. It is the same design as the large models, with
far fewer numbers. Everything you built in lessons 11 to 14 is in it: tensors, autograd, the counting and learning of a
bigram, and attention.</p>
<p>The example is a copy of <code>lang/examples/tensor/tiny_gpt</code> from the Mycel repository, with a few changes to
make it short: the number of training steps is 20 (the full version uses 600), it prints every 10 steps, and it does not
print the time. Both files read <code>names.txt</code>, so keep that file in <code>tensor_lab</code>. Run the example
with <code>mycel run --allow-read=. 15_tiny_gpt.myc</code>. The <code>--allow-read=.</code> part lets the program read
files from the current folder.</p>
<pre class="diagram">letters in        token and position        2 blocks, each:              scores for the        pick the
(16 at once) --> numbers (32 each) --> layer norm, attention,  --> next letter (25) --> next letter
                                        layer norm, small MLP,     in each position    (softmax, sample)
                                        and add back each time</pre>
<p><b>Settings.</b> <code>context</code> is how many letters the model sees at once. <code>embed</code> is how many numbers
describe one letter. <code>heads</code> splits those numbers into four attention heads. <code>layers</code> is how many
blocks are stacked. <code>batch</code> is how many random pieces of names train at each step.</p>
<pre class="static excerpt"><code>let context = 16
let embed = 32
let heads = 4
let layers = 2
let batch = 32
let steps = 20
let learning_rate = 0.01</code></pre>
<p><b>A block.</b> Each block holds the weights for one round of attention and one small network. Its names say what
they are: <code>wq</code>, <code>wk</code> and <code>wv</code> make the queries, keys and values from lesson 14.</p>
<pre class="static excerpt"><code>struct Block {
    let ln1_g: Tensor, ln1_b: Tensor
    let wq: Tensor, wk: Tensor, wv: Tensor, wo: Tensor
    let bq: Tensor, bk: Tensor, bv: Tensor, bo: Tensor
    let ln2_g: Tensor, ln2_b: Tensor
    let w1: Tensor, b1: Tensor, w2: Tensor, b2: Tensor
}</code></pre>
<p>The weights start as small random numbers (<code>randnStd</code> with a spread of 0.02), so the model starts knowing
nothing. Layer-norm scales start at 1 and shifts at 0. Training will move them.</p>
<p><b>Attention with heads.</b> The function below takes the block's weights and the input. It makes queries, keys and
values for all letters at once. <code>reshape</code> and <code>permute</code> split the 32 numbers into four heads of
8 numbers, so each head does its own attention, the way lesson 14 did it. The causal mask from lesson 14 is added to
the scores. The heads are then joined back together.</p>
<pre class="static excerpt"><code>fn attention(b: Block, x: Tensor, mask: Tensor) -> Tensor {
    let n = x.shape[0]
    let t = x.shape[1]
    let d = embed.div(heads)
    let q = (x.matmul(b.wq) + b.bq).reshape([n, t, heads, d]).permute([0, 2, 1, 3])
    let k = (x.matmul(b.wk) + b.bk).reshape([n, t, heads, d]).permute([0, 2, 1, 3])
    let v = (x.matmul(b.wv) + b.bv).reshape([n, t, heads, d]).permute([0, 2, 1, 3])
    let scores = q.matmul(k.permute([0, 1, 3, 2])) * (1.0 / d.toFloat().sqrt()) + mask
    let mixed = scores.softmax().matmul(v)
    let joined = mixed.permute([0, 2, 1, 3]).reshape([n, t, embed])
    return joined.matmul(b.wo) + b.bo
}</code></pre>
<p><b>One block.</b> The input goes through attention and the result is added back to the input. Then it goes through
a small network (widen, GELU, narrow) and that result is added back too. Adding the input back means each block only has
to learn a change, which keeps deep stacks trainable.</p>
<pre class="static excerpt"><code>fn block_forward(b: Block, x: Tensor, mask: Tensor) -> Tensor {
    let a = x + attention(b, x.layerNorm(b.ln1_g, b.ln1_b), mask)
    let h = (a.layerNorm(b.ln2_g, b.ln2_b).matmul(b.w1) + b.b1).gelu()
    return a + h.matmul(b.w2) + b.b2
}</code></pre>
<p><b>The whole model.</b> Each letter becomes its token vector, and its position in the window gets a position vector,
which is added on. The blocks run in turn. A last layer norm and a matrix called the head turn each position into 25
scores, one per character, and the highest score is the model's favourite next letter.</p>
<pre class="static excerpt"><code>fn forward(m: Model, ids: [Int], n: Int, t: Int) -> Tensor {
    let positions = tensor.arange(t).toList().map((p) => p.toInt())
    let mask = tensor.causalMask(t)
    var x = (m.tok.indexSelect(ids).reshape([n, t, embed]) + m.pos.indexSelect(positions))
    for b in m.blocks {
        x = block_forward(b, x, mask)
    }
    return x.layerNorm(m.lnf_g, m.lnf_b).matmul(m.head_w) + m.head_b
}</code></pre>
<p><b>The loss.</b> Training takes random windows of 16 letters from the training names. The target at each position is
the letter after it, so one window gives 16 training examples. <code>crossEntropy</code> measures how much probability
the model gave to the right letters, as in lesson 13.</p>
<pre class="static excerpt"><code>fn loss_on(m: Model, text: [Int], starts: [Int]) -> Tensor {
    var inputs: [Int] = []
    var targets: [Int] = []
    for s in starts {
        for j in 0..context {
            inputs.push(text[s + j])
            targets.push(text[s + j + 1])
        }
    }
    let logits = forward(m, inputs, starts.length, context)
    return logits.crossEntropy(targets)
}</code></pre>
<p><b>Training.</b> The loop is the same five steps as lesson 12. The held-out loss is measured on names the model never
trains on, which is the fair check from lesson 10.</p>
<pre class="static excerpt"><code>    for step in 0..=steps {
        opt.zeroGrad()
        let loss = loss_on(model, train_text, random_starts(batch, train_text.length - context - 1))
        if step % 10 == 0 {
            let held = loss_on(model, check_text, random_starts(batch, check_text.length - context - 1))
            print(f"step {step:>4}  train loss {loss.item():.3f}  held-out loss {held.item():.3f}")
        }
        loss.backward()
        opt.step()
    }</code></pre>
<p><b>Generating.</b> Start from one letter, feed the last 16 letters back into the model, sample the next letter from its
probabilities, and stop at the end marker. Sampling means a letter with 30% chance is picked about 3 times in 10, so the
output is new each time but follows the patterns it learned.</p>
<pre class="static excerpt"><code>fn generate(m: Model, alphabet: [String], first: Int, newline: Int) -> String {
    var ids = [newline, first]
    var out = f"{alphabet[first]}"
    for i in 0..20 {
        let window = ids.slice(max(0, ids.length - context), ids.length)
        let logits = forward(m, window, 1, window.length)
        let last = logits.reshape([window.length, alphabet.length]).rows(window.length - 1, window.length)
        let next = tensor.sample(last.softmax().reshape([alphabet.length]))
        if next == newline {
            return out
        }
        ids.push(next)
        out += f"{alphabet[next]}"
    }
    return out
}</code></pre>
<p>The example above is the short run, 20 steps. It takes a couple of seconds, so you can see the loss fall and check the
output. The names are still poor. The full run uses 600 steps. Change <code>steps</code> to 600 and run it again, or use
the original example in the Mycel repository. Here is the real output of that full run, which trained for 27 seconds on
the Mac this lesson was checked on. The names at the end are new: none of them is in <code>names.txt</code>.</p>
<p>The training loss falls from 3.23 to 1.81, and the held-out loss from 3.23 to 2.01. The gap between the two at the end
shows where learning stops generalising: after step 300 the held-out loss goes up while the training loss stays near 1.8, a
sign that the model is starting to memorise its training names. The package's own report measured the same run at 97 seconds on a heavily loaded laptop.</p>`,
    out: `1000 names, 25 characters, 7103 training characters, 812 held out
model: 2 blocks, 4 heads, width 32, 27609 numbers to learn
step    0  train loss 3.228  held-out loss 3.229
step   10  train loss 2.907  held-out loss 2.942
step   20  train loss 2.737  held-out loss 2.745
aaranar
don
ghrntas
jicj
mciofnto
pnntr
tealinr
widmovlep`,
    fullRun: { file: "15_full_run_output", label: "Full run: 600 steps, the original example, real output" },
    task: `Change <code>layers</code> from 2 to 1 and run it. Read the second line of output: how many numbers does the
model learn now, and why is the number smaller?`,
    exercise: { file: "15_tiny_gpt_solution", flags: "--allow-read=.", out: `1000 names, 25 characters, 7103 training characters, 812 held out
model: 1 blocks, 4 heads, width 32, 14905 numbers to learn
step    0  train loss 3.209  held-out loss 3.209
step   10  train loss 2.649  held-out loss 2.658
step   20  train loss 2.350  held-out loss 2.414
anjarglor
dindlaosancibnrn
gleli
jashoniora
mandjrarusniondra
peo
theliendiobumesiv
wendasfe` },
    hints: [
      `Find <code>let layers = 2</code> near the top of <code>15_tiny_gpt.myc</code> and change it to <code>let layers = 1</code>.`,
      `Re-run with <code>mycel run --allow-read=.</code> and check the parameter count on the second line.`
    ],
    commonMistakes: [
      {
        match: { codeIncludes: "let layers = 2" },
        sampleWrong: `let layers = 2\nlet embed = 32\nlet heads = 4`,
        reason: `layers is still 2, so the model builds 2 transformer blocks (27,609 parameters). Change let layers = 2 to let layers = 1 to build a 1-block model.`,
        concept: "Transformer depth & parameter count"
      }
    ],
    ownData: {
      file: "15_own_data_solution", data: "weather.txt",
      text: `<p>The tiny GPT learns whatever text you give it. The <a href="/mycel/learn/ai/data/">training data page</a> has
five free sets: made-up names, Mycel programs, chat lines, weather sentences and recipes. Each one is a plain text file
with one item per line, and each is under 300 KB.</p>
<p>Download <a href="/mycel/learn/ai/data/weather.txt" download>weather.txt</a> and save it in the same folder as your
lesson 15 file. Then change the one line that reads the file, so it names the new file:</p>
<pre class="static excerpt"><code>    let raw = fs.readText("names.txt").unwrap()</code></pre>
<p>Run it as before. The example runs 20 steps, which takes a few seconds, and prints the loss at each step. For the full
run, change <code>let steps = 20</code> to <code>let steps = 600</code>. The page lists the real full-run loss for each set:
for <code>weather.txt</code> it ends at a training loss of 0.685 and a held-out loss of 0.651.</p>`,
      task: `Download <code>weather.txt</code>, change the file name, and run the 20-step example. Then download
<code>chat.txt</code> and run it on that. Which one has the lower loss at step 20, and what does its sample look like?`,
      out: `1000 names, 49 characters, 64480 training characters, 7057 held out
model: 2 blocks, 4 heads, width 32, 29169 numbers to learn
step    0  train loss 3.909  held-out loss 3.902
step   10  train loss 3.114  held-out loss 3.044
step   20  train loss 2.476  held-out loss 2.539
 ilrls the s thhes Te
. wnod Gw cSt utee s 
2 d t i hs.
5hin. u as igrie n dh
8 thende  f, u this. 
An wiy
Gud TmthaguGce doia  
SThia`,
    },
  },
];
