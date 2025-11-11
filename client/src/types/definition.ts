export type Tool = "select" | "pencil" | "rectangle" | "pan";
export type drawingState = "idle" | "drawing" | "moving" | "panning";

export interface ElementBase {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: Tool;
    stroke: string;
}

export interface PencilElement extends ElementBase {
    type: "pencil";
    points: { x: number; y: number }[];
}

export interface RectangleElement extends ElementBase {
    type: "rectangle";
}

export type WhiteBoardElement = PencilElement | RectangleElement;

export interface Cursor {
    x: number;
    y: number;
    sessionId: string;
}
