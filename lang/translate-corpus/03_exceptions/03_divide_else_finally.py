def divide(x, y):
    try:
        if y == 0:
            raise ZeroDivisionError("division by zero")
        result = x / y
    except ZeroDivisionError:
        print("division by zero!")
    else:
        print("result is", result)
    finally:
        print("executing finally clause")

divide(2, 1)
divide(2, 0)
