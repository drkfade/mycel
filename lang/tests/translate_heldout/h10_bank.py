class InsufficientFunds(Exception):
    pass

class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientFunds(f"{self.owner} has only {self.balance}")
        self.balance -= amount
        return self.balance

acct = Account("ada", 100)
print(acct.withdraw(30))
try:
    acct.withdraw(500)
except InsufficientFunds as e:
    print("error:", e)
print(acct.balance)
