# Parsing lines with ValueError handling
inputs = ["42", "abc", "-7", "0"]
valid = []
for raw in inputs:
    try:
        x = int(raw)
        valid.append(x)
    except ValueError:
        print("Oops! That was no valid number:", raw)
print(valid)
