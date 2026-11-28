class B(Exception):
    pass

class C(B):
    pass

class D(C):
    pass

for name in ["B", "C", "D"]:
    try:
        if name == "D":
            raise D("d")
        elif name == "C":
            raise C("c")
        else:
            raise B("b")
    except D:
        print("D")
    except C:
        print("C")
    except B:
        print("B")
