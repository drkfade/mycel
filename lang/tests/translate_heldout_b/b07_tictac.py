board = [["X", "O", "X"], [" ", "X", "O"], ["O", " ", "X"]]
for row in board:
    print("|".join(row))
diag = all(board[i][i] == "X" for i in range(3))
print("X wins on diagonal:", diag)
empty = sum(row.count(" ") for row in board)
print("empty cells:", empty)
