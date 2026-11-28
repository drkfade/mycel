def bool_return():
    try:
        return True
    finally:
        print("cleaning up")

print(bool_return())
