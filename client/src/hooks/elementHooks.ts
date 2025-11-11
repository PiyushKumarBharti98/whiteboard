import {
    MousePointer,
    Pencil,
    RectangleHorizontal,
    Hand,
    WindArrowDown,
} from "lucide-react";
import type { WhiteBoardElement, Tool } from "../types/definition";

const createElement = (
    id: string,
    type: Tool,
    x: number,
    y: number,
): WhiteBoardElement => {
    const base = {
        id,
        type,
        x,
        y,
        width: 0,
        height: 0,
        stroke: "#000000",
    };
    if(type==='pencil'){
        return {...base,type:'pencil',points:[{x:0,y:0}]
    }

    if(type==='rectangle'){
        return {...base,type:'rectangle'
    }
};

const getMousePosition = (
    e: React.MouseEvent | React.WheelEvent,
    canvas: HTMLCanvasElement,
    panOffset: { x: number; y: number },
) => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left - panOffset.x,
        y: e.clientY - rect.right - panOffset.y,
    };
};
