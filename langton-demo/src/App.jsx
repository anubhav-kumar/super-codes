import "./index.css";
import { useState, useEffect, useRef } from "react";

const eventDispatcher = new EventTarget();

const LangtonBox = (props) => {
  const { isOn, row, col } = props;

  const [onState, setOnState] = useState(isOn);

  const backgroundColor = onState ? "cyan" : "black";

  const height = 4;
  const width = 4;

  // Listen for cell toggle requests.
  useEffect(() => {
    const eventName = `TOGGLE_ON_STATE_${row}_${col}`;

    const handler = () => {
      setOnState((prev) => !prev);
    };

    eventDispatcher.addEventListener(eventName, handler);

    return () => {
      eventDispatcher.removeEventListener(eventName, handler);
    };
  }, [row, col]);

  // Listen for cell state queries.
  useEffect(() => {
    const eventName = `QUERY_ON_STATE_${row}_${col}`;

    const handler = () => {
      eventDispatcher.dispatchEvent(
        new CustomEvent(`RESPONSE_ON_STATE_${row}_${col}`, {
          detail: { onState },
        }),
      );
    };

    eventDispatcher.addEventListener(eventName, handler);

    return () => {
      eventDispatcher.removeEventListener(eventName, handler);
    };
  }, [row, col, onState]);

  return (
    <div
      style={{
        backgroundColor,
        height,
        width,
        zIndex: 100,
      }}
    />
  );
};

const LangtonBoardRows = (props) => {
  const { length, row } = props;

  const collector = [];

  for (let i = 0; i <= length; i++) {
    collector.push(i);
  }

  return (
    <div style={{ display: "flex" }}>
      {collector.map((col) => (
        <LangtonBox
          key={`box_${row}_${col}`}
          isOn={false}
          row={row}
          col={col}
        />
      ))}
    </div>
  );
};

const LangtonBoard = (props) => {
  const { length } = props;

  const collector = [];

  for (let i = 0; i <= length; i++) {
    collector.push(i);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        {collector.map((i) => (
          <LangtonBoardRows key={`row_${i}`} row={i} length={length} />
        ))}
      </div>
    </div>
  );
};

const ANT_FACE_ENUM = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
};

export default function App() {
  const length = 200;

  const [antPositionRow, setAntPositionRow] = useState(Math.ceil(length / 2));

  const [antPositionCol, setAntPositionCol] = useState(Math.ceil(length / 2));

  const [antFace, setAntFace] = useState(ANT_FACE_ENUM.UP);

  const [startSimulation, setStartSimulation] = useState(false);

  // Keep the latest state values available to event handlers.
  const antPositionRowRef = useRef(antPositionRow);
  const antPositionColRef = useRef(antPositionCol);
  const antFaceRef = useRef(antFace);

  // Prevent overlapping movements.
  const moveLockRef = useRef(false);

  // Keep the latest moveAnt function available to the timer.
  const moveAntRef = useRef(null);

  // Synchronize refs with React state.
  antPositionRowRef.current = antPositionRow;
  antPositionColRef.current = antPositionCol;
  antFaceRef.current = antFace;

  const toggleLightStatus = (row, col) => {
    eventDispatcher.dispatchEvent(
      new CustomEvent(`TOGGLE_ON_STATE_${row}_${col}`, {
        detail: {},
      }),
    );
  };

  const moveAntForward = (direction, row, col) => {
    switch (direction) {
      case ANT_FACE_ENUM.UP:
        setAntPositionRow(row - 1);
        break;

      case ANT_FACE_ENUM.LEFT:
        setAntPositionCol(col - 1);
        break;

      case ANT_FACE_ENUM.DOWN:
        setAntPositionRow(row + 1);
        break;

      case ANT_FACE_ENUM.RIGHT:
        setAntPositionCol(col + 1);
        break;

      default:
        break;
    }
  };

  const moveAnt = () => {
    // Ignore movement if another movement is in progress.
    if (moveLockRef.current) {
      return;
    }

    moveLockRef.current = true;

    // Take a snapshot of the current ant position.
    const currentRow = antPositionRowRef.current;
    const currentCol = antPositionColRef.current;
    const currentDirection = antFaceRef.current;

    // Stop at board boundaries.
    if (
      currentRow < 0 ||
      currentRow > length ||
      currentCol < 0 ||
      currentCol > length
    ) {
      moveLockRef.current = false;
      setStartSimulation(false);
      return;
    }

    const responseEventName = `RESPONSE_ON_STATE_${currentRow}_${currentCol}`;

    const handler = (event) => {
      // Remove this response listener immediately.
      eventDispatcher.removeEventListener(responseEventName, handler);

      const boxOnState = event.detail.onState;

      // Calculate the new direction.
      const nextDirection = boxOnState
        ? (currentDirection + 3) % 4
        : (currentDirection + 1) % 4;

      setAntFace(nextDirection);

      // Move using the NEW direction.
      moveAntForward(nextDirection, currentRow, currentCol);

      // Flip the current cell.
      toggleLightStatus(currentRow, currentCol);

      // Release movement lock.
      moveLockRef.current = false;
    };

    // Register response listener before sending query.
    eventDispatcher.addEventListener(responseEventName, handler, {
      once: true,
    });

    // Ask the current cell for its state.
    eventDispatcher.dispatchEvent(
      new CustomEvent(`QUERY_ON_STATE_${currentRow}_${currentCol}`, {
        detail: {},
      }),
    );
  };

  // Keep the timer connected to the latest moveAnt function.
  moveAntRef.current = moveAnt;

  // Start or stop automatic movement.
  useEffect(() => {
    if (!startSimulation) {
      return;
    }

    const timer = setInterval(() => {
      moveAntRef.current();
    }, 50);

    return () => {
      clearInterval(timer);
    };
  }, [startSimulation]);

  return (
    <div className="App">
      <div>
        <button
          onClick={() => {
            setStartSimulation((prev) => !prev);
          }}
        >
          {startSimulation ? "Stop" : "Start"}
        </button>
        
      </div>
      <LangtonBoard length={length} />
    </div>
  );
}
