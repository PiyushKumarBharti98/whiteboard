type Tool = "select" | "pencil" | "rectangle" | "pan";
type drawingState = "idle" | "drawing" | "moving" | "panning";

interface ElementBase {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: Tool;
    stroke: string;
}

interface PencilElement extends ElementBase {
    type: "pencil";
    points: { x: number; y: number }[];
}

interface RectangleElement extends ElementBase {
    type: "rectangle";
}

type WhiteBoardElement = PencilElement | RectangleElement;

interface Cursor {
    x: number;
    y: number;
    sessionId: string;
}
