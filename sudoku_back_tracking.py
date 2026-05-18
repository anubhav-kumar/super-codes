import re, time
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
class InputData(BaseModel):
    problem: str 

class OutputData(BaseModel):
    result: str
    time: int

class Sudoku:
    def __init__(self, board):
        self.board = board
        self.input_cells = [list(map(lambda x: x > 0, row)) for row in board]
        self.possible_values = [list(map(lambda _: [], row)) for row in board]
        self.start_row = 0
        self.start_col = 0

    def initialise(self):
        self.populate_input_cells()
        self.populate_possible_values()
        while True:
            is_optimising = False
            for row in range(9):
                for col in range(9):
                    if len(self.possible_values[row][col]) == 1:
                        self.set_cell_value(row, col, self.possible_values[row][col].pop())
                        is_optimising = True
            if not is_optimising:
                break
            self.populate_input_cells()
            self.populate_possible_values()
    
    def set_start_row_col(self):
        min_length_of_possible_values = 10
        for row in range(9):
            for col in range(9):
                if (len(self.possible_values[row][col]) < min_length_of_possible_values):
                    min_length_of_possible_values = len(self.possible_values[row][col])
                    self.start_row = row
                    self.start_col = col

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
            row = 0
            col = 0
        else:
            col += 1
            if col == 9:
                col = 0
                row += 1
        if (row == self.start_row and col == self.start_col):
            return None
        return row, col

    def prev_cell(self, row, col):
        if (row == self.start_row and col == self.start_col):
            return None
        if (row == 0 and col == 0):
            row = 8
            col = 8
        col -= 1
        if col < 0:
            col = 8
            row -= 1
        if row < 0:
            return None  # start of board
        return row, col

    def return_board(self):
        output = ""
        for row in range(9):
            for col in range(9):
                output = output + str(self.get_cell_value(row, col))
        return output
    
    def populate_possible_values(self):
        for row in range(9):
            for col in range(9):
                self.get_non_occuring_numbers(row, col)
    
    def populate_input_cells(self):
        for row in range(9):
            for col in range(9):
                self.input_cells[row][col] = self.board[row][col] == 0

    def solve(self):
        row, col = 0, 0
        is_back = False
        while True:
            if not self.input_cells[row][col]:
                if not is_back:
                    next_cell = self.next_cell(row, col)
                    if next_cell is None:
                        return self.return_board()
                    row, col = next_cell
                else:
                    prev_cell = self.prev_cell(row, col)
                    if prev_cell is None:
                        return self.return_board()
                    row, col = prev_cell
                continue
            if not is_back:
                self.get_non_occuring_numbers(row, col)
            if len(self.possible_values[row][col]) > 0:
                self.set_cell_value(row, col, self.possible_values[row][col].pop())
                next_cell = self.next_cell(row, col)
                if next_cell is None:
                    return self.return_board()
                row, col = next_cell
                is_back = False
            else:
                self.set_cell_value(row, col, 0)
                prev_cell = self.prev_cell(row, col)
                if prev_cell is None:
                    return self.return_board()
                row, col = prev_cell
                is_back = True

@app.get("/solve")
def solve(q: str):
    print(q)
    print(type(q))
    if (bool(re.match(r'^\d{81}$', q))):
        sudoku_input = [[int(q[r*9 + c]) for c in range(9)] for r in range(9)]
        start = time.time()
        sudoku = Sudoku(sudoku_input)
        sudoku.initialise()
        sudoku.set_start_row_col()
        solution = sudoku.solve()
        end = time.time()
        seconds_elasped = (end - start)
    return {"solution": solution, "seconds_elasped": seconds_elasped}