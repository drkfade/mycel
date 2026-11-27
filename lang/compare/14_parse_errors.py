for s in ["12", "x7", "40"]:
    try:
        print(int(s) * 2)
    except ValueError:
        print(f"not a number: {s}")
