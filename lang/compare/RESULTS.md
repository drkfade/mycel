| program | same output | lines py / myc | tokens py / myc | first error (same typo) — Python | — Mycel |
|---|---|---|---|---|---|
| 01_hello | yes | 1 / 1 | 4 / 4 | NameError: name 'prnt' is not defined. Did you mean: 'print'? | error [E0352]: cannot find `prnt` — did you mean `print`? |
| 02_greet | yes | 3 / 3 | 10 / 10 | NameError: name 'agee' is not defined. Did you mean: 'age'? | error [E0352]: cannot find `agee` — did you mean `age`? |
| 03_sum_list | yes | 3 / 3 | 29 / 29 | NameError: name 'num' is not defined. Did you mean: 'nums'? | error [E0352]: cannot find `num` — did you mean `nums`? |
| 04_fizzbuzz | yes | 9 / 6 | 49 / 53 | NameError: name 'j' is not defined | error [E0352]: cannot find `j` in this scope |
| 05_word_count | yes | 6 / 6 | 49 / 47 | NameError: name 'm' is not defined | error [E0352]: cannot find `m` in this scope |
| 06_reverse | yes | 3 / 3 | 21 / 19 | AttributeError: 'str' object has no attribute 'uper'. Did you mean: 'upper'? | error [E0390]: String has no member `uper` — did you mean `upper`? |
| 07_max_min | yes | 2 / 2 | 25 / 25 | NameError: name 'temp' is not defined. Did you mean: 'temps'? | error [E0352]: cannot find `temp` — did you mean `temps`? |
| 08_factorial | yes | 5 / 5 | 29 / 31 | NameError: name 'fac' is not defined. Did you mean: 'fact'? | error [E0352]: cannot find `fac` — did you mean `fact`? |
| 09_fibonacci | yes | 4 / 3 | 35 / 36 | NameError: name 'fibs' is not defined. Did you mean: 'fib'? | error [E0352]: cannot find `fibs` — did you mean `fib`? |
| 10_class | yes | 7 / 6 | 38 / 33 | AttributeError: 'Dog' object has no attribute 'speek'. Did you mean: 'speak'? | error [E0390]: Dog has no member `speek` — did you mean `speak`? |
| 11_dict_scores | yes | 4 / 3 | 45 / 49 | NameError: name 'scor' is not defined. Did you mean: 'score'? | error [E0352]: cannot find `scor` — did you mean `score`? |
| 12_comprehension | yes | 3 / 3 | 29 / 26 | NameError: name 'square' is not defined. Did you mean: 'squares'? | error [E0352]: cannot find `square` — did you mean `squares`? |
| 13_enumerate | yes | 3 / 2 | 25 / 23 | NameError: name 'fruit' is not defined. Did you mean: 'fruits'? | error [E0352]: cannot find `fruit` — did you mean `fruits`? |
| 14_parse_errors | yes | 5 / 4 | 29 / 36 | NameError: name 'x' is not defined | error [E0352]: cannot find `x` in this scope |
| 15_strings | yes | 3 / 3 | 35 / 35 | AttributeError: 'str' object has no attribute 'lowr'. Did you mean: 'lower'? | error [E0390]: String has no member `lowr` — did you mean `lower`? |
| 16_average | yes | 3 / 3 | 26 / 26 | NameError: name 'average' is not defined | error [E0352]: cannot find `average` in this scope |
| 17_json | yes | 4 / 4 | 38 / 44 | NameError: name 'dat' is not defined. Did you mean: 'data'? | error [E0352]: cannot find `dat` — did you mean `data`? |
| 18_sort_tuples | yes | 3 / 2 | 47 / 46 | NameError: name 'nam' is not defined. Did you mean: 'name'? | error [E0352]: cannot find `nam` — did you mean `name`? |
| 19_vowels | yes | 6 / 6 | 24 / 26 | NameError: name 'cont' is not defined. Did you mean: 'count'? | error [E0352]: cannot find `cont` — did you mean `count`? |
| 20_primes | yes | 8 / 9 | 59 / 61 | NameError: name 'Tru' is not defined. Did you mean: 'True'? | error [E0352]: cannot find `tru` — did you mean `true`? |
| 21_temperature | yes | 3 / 4 | 25 / 28 | NameError: name 'fahr' is not defined | error [E0352]: cannot find `fahr` in this scope |
| 22_swap | yes | 3 / 3 | 20 / 20 | NameError: name 'c' is not defined | error [E0352]: cannot find `c` in this scope |
| 23_lambda_sort | yes | 3 / 3 | 29 / 28 | NameError: name 'word' is not defined. Did you mean: 'words'? | error [E0352]: cannot find `word` — did you mean `words`? |
| 24_sets | yes | 3 / 3 | 43 / 58 | NameError: name 'b' is not defined. Did you mean: 'bb'? | error [E0352]: cannot find `b` — did you mean `bb`? |
| 25_args | yes | 3 / 3 | 15 / 17 | NameError: name 'arg' is not defined. Did you mean: 'args'? | error [E0352]: cannot find `arg` — did you mean `args`? |
| **total** | 25/25 | 100 / 93 | 778 / 810 | | |
