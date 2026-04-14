
class Sudoku:
    def __init__(self, board):
        self.board = board
        self.input_cells = [list(map(lambda x: x > 0, row)) for row in board]
        self.possible_values = [list(map(lambda _: [], row)) for row in board]

    def get_non_occuring_numbers(self, row, col):
        if (not self.input_cells[row][col]):
            return []
        # Returns an array of non occuring number in that row, column and 3x3 box
        occurring = set()
        for x in range(9):
            occurring.add(self.board[row][x])
            occurring.add(self.board[x][col])
        start_row = row - row % 3
        start_col = col - col % 3
        for i in range(3):
            for j in range(3):
                occurring.add(self.board[i + start_row][j + start_col])
        non_occuring_numbers = [num for num in range(1, 10) if num not in occurring]
        self.possible_values[row][col] = non_occuring_numbers

    def set_cell_value(self, row, col, value):
        # Sets the value of a cell in the Sudoku board   
        self.board[row][col] = value

    def get_cell_value(self, row, col):
        return self.board[row][col]

    def next_cell(self, row, col):
        if (row == 8 and col == 8):
            return None
        col += 1
        if col == 9:
            col = 0
            row += 1
        return row, col

    def prev_cell(self, row, col):
        col -= 1
        if col < 0:
            col = 8
            row -= 1
        if row < 0:
            return None  # start of board
        return row, col

    def print_board(self):
        for i, row in enumerate(self.board):
            if i % 3 == 0 and i != 0:
                print("------+-------+------")
            row_str = ""
            for j, val in enumerate(row):
                if j % 3 == 0 and j != 0:
                    row_str += " | "
                row_str += str(val) + " "
            print(row_str)
    
    def populate_possible_values(self):
        for row in range(9):
            for col in range(9):
                self.get_non_occuring_numbers(row, col)
    
    def populate_input_cells(self):
        for row in range(9):
            for col in range(9):
                self.input_cells[row][col] = self.board[row][col] == 0

    def solve(self, row = 0, col = 0, is_back = False):
        # print("Now at " + str(row) + "," + str(col))
        if (not self.input_cells[row][col]):
            # print("Detected non input cell")
            next_cell = self.next_cell(row, col)
            if (next_cell is None):
                # print("No next cell present. Returning")
                self.print_board()
                return
            elif (not is_back):
                [next_row, next_col] = next_cell
                # print("Moving to next cell")
                return self.solve(next_row, next_col)
            else: 
                [prev_row, prev_col] = self.prev_cell(row, col)
                return self.solve(prev_row, prev_col, is_back)
        if (not is_back):
            self.get_non_occuring_numbers(row, col)
        # print("Possible values at cell: " +
        str(self.possible_values[row][col])
        if (len(self.possible_values[row][col]) > 0):
            # print("Possible values found")
            # print("Setting cell value")
            # print(self.possible_values[row][col])
            self.set_cell_value(row, col, self.possible_values[row][col].pop())
            # print(self.possible_values[row][col])
            next_cell = self.next_cell(row, col)
            if (next_cell is None):
                self.print_board()
                return
            else:
                [next_row, next_col] = next_cell
                return self.solve(next_row, next_col, False)
        else:
            # print("Possible values not found")
            self.set_cell_value(row, col, 0)
            prev_cell = self.prev_cell(row, col)
            if (prev_cell is None):
                # print("No previous cell")
                self.print_board()
                return
            else:
                # print("Moving to previous cell")
                [prev_row, prev_col] = prev_cell
                return self.solve(prev_row, prev_col, True)

sudoku = Sudoku([
    [0, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 8, 1, 0, 9, 3, 0, 4, 5],
    [4, 0, 0, 0, 5, 0, 0, 3, 2],
    [9, 0, 0, 5, 0, 4, 0, 7, 8],
    [0, 5, 8, 3, 0, 0, 0, 0, 9],
    [0, 0, 0, 8, 2, 0, 0, 0, 0],
    [5, 0, 0, 2, 7, 0, 0, 8, 4],
    [6, 0, 4, 1, 3, 8, 2, 0, 7],
    [8, 0, 2, 9, 0, 0, 6, 0, 0]
])

sudoku.populate_input_cells()
sudoku.populate_possible_values()

print('Input board : ')
sudoku.print_board()
sudoku.solve()
# sudoku.print_board()
# print(sudoku.possible_values)