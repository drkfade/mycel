from enum import StrEnum

class Status(StrEnum):
    OPEN = 'open'
    CLOSED = 'closed'

s = Status.OPEN
print(s.name, s.value, str(s))
