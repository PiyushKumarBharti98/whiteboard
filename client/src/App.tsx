import React, { useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { create } from "zustand";
import { io } from "socket.io-client";
import { nanoid } from "nanoid";
import { MousePointer, Pencil, RectangleHorizontal, Hand } from "lucide-react";

// --- 1. TYPE DEFINITIONS ---
type Tool = "select" | "pencil" | "rectangle" | "pan";
type DrawingState = "idle" | "drawing" | "moving" | "panning";

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

type WhiteboardElement = PencilElement | RectangleElement;

// For remote cursors
interface Cursor {
    x: number;
    y: number;
    sessionId: string;
}

const URL =
    process.env.NODE_ENV === "production"
        ? "YOUR_PROD_URL"
        : "http://localhost:5000";

const sessionId = nanoid();

const getCanvasId = () => {
    const pathParts = window.location.pathname.split("/");
    if (pathParts.length === 3 && pathParts[1] === "canvas") {
        return pathParts[2];
    }
    return "default-canvas";
};

const canvasId = getCanvasId();

const socket = io(URL, {
    autoConnect: false,
    auth: {
        canvasId,
        sessionId,
    },
});

const createElement = (
    id: string,
    type: Tool,
    x: number,
    y: number,
): WhiteboardElement => {
    const base = { id, type, x, y, width: 0, height: 0, stroke: "#000000" };
    if (type === "pencil") {
        return { ...base, type: "pencil", points: [{ x: 0, y: 0 }] };
    }
    if (type === "rectangle") {
        return { ...base, type: "rectangle" };
    }
    throw new Error(`Unknown element type: ${type}`);
};

const getMousePosition = (
    e: React.MouseEvent | React.WheelEvent,
    canvas: HTMLCanvasElement,
    panOffset: { x: number; y: number },
) => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left - panOffset.x,
        y: e.clientY - rect.top - panOffset.y,
    };
};

const isPointInsideElement = (x: number, y: number, el: WhiteboardElement) => {
    return (
        x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height
    );
};

const getElementAtPosition = (
    x: number,
    y: number,
    elements: WhiteboardElement[],
) => {
    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (isPointInsideElement(x, y, el)) {
            return el;
        }
    }
    return null;
};

const drawElement = (ctx: CanvasRenderingContext2D, el: WhiteboardElement) => {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = 2;

    switch (el.type) {
        case "rectangle":
            ctx.strokeRect(el.x, el.y, el.width, el.height);
            break;
        case "pencil":
            ctx.beginPath();
            ctx.moveTo(el.x + el.points[0].x, el.y + el.points[0].y);
            el.points.forEach((point) => {
                ctx.lineTo(el.x + point.x, el.y + point.y);
            });
            ctx.stroke();
            break;
        default:
            break;
    }
};

const drawSelectionBox = (
    ctx: CanvasRenderingContext2D,
    el: WhiteboardElement,
) => {
    ctx.strokeStyle = "#007bff";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(el.x - 2, el.y - 2, el.width + 4, el.height + 4);
    ctx.setLineDash([]);
};

interface AppState {
    tool: Tool;
    drawingState: DrawingState;
    elements: WhiteboardElement[];
    cursors: Cursor[];
    panOffset: { x: number; y: number };
    selectedElementId: string | null;
    currentElement: WhiteboardElement | null;
    startPosition: { x: number; y: number };
    panStartPosition: { x: number; y: number }; 

    actions: {
        initSocketListeners: () => void;
        setTool: (tool: Tool) => void;
        setElements: (elements: WhiteboardElement[], emit?: boolean) => void;
        setCursors: (cursors: Cursor[]) => void;
        emitCursor: (pos: { x: number; y: number }) => void;

        handleMouseDown: (
            e: React.MouseEvent<HTMLCanvasElement>,
            canvas: HTMLCanvasElement,
        ) => void;
        handleMouseMove: (
            e: React.MouseEvent<HTMLCanvasElement>,
            canvas: HTMLCanvasElement,
        ) => void;
        handleMouseUp: () => void;
        handleWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
    };
}

const useStore = create<AppState>((set, get) => ({
    tool: "pencil",
    drawingState: "idle",
    elements: [],
    cursors: [],
    panOffset: { x: 0, y: 0 },
    selectedElementId: null,
    currentElement: null,
    startPosition: { x: 0, y: 0 },
    panStartPosition: { x: 0, y: 0 },

    actions: {
        initSocketListeners: () => {
            // Listen for the initial state from the server
            socket.on(
                "canvas-state",
                (initialElements: WhiteboardElement[]) => {
                    set({ elements: initialElements });
                },
            );
            socket.on(
                "elements-updated",
                (updatedElements: WhiteboardElement[]) => {
                    set({ elements: updatedElements });
                },
            );
            socket.on("user-cursors", (cursor: Cursor) => {
                set((state) => ({
                    cursors: [
                        ...state.cursors.filter(
                            (c) => c.sessionId !== cursor.sessionId,
                        ),
                        cursor,
                    ],
                }));
            });
            socket.on("user-left", ({ sessionId }: { sessionId: string }) => {
                set((state) => ({
                    cursors: state.cursors.filter(
                        (c) => c.sessionId !== sessionId,
                    ),
                }));
            });
        },

        setTool: (tool) => set({ tool, selectedElementId: null }), /

        setElements: (elements, emit = false) => {
            set({ elements });
            if (emit) {
                socket.emit("element-update", elements);
            }
        },

        setCursors: (cursors) => set({ cursors }),

        emitCursor: (pos) => socket.emit("user-cursors", pos),

        handleMouseDown: (e, canvas) => {
            const { tool, panOffset, elements } = get();
            const pos = getMousePosition(e, canvas, panOffset);
            set({ startPosition: pos });

            if (tool === "pan" || e.button === 1) {
                set({
                    drawingState: "panning",
                    panStartPosition: { x: e.clientX, y: e.clientY },
                });
                return;
            }

            if (tool === "select") {
                const element = getElementAtPosition(pos.x, pos.y, elements);
                set({
                    selectedElementId: element?.id || null,
                    drawingState: element ? "moving" : "idle",
                    currentElement: element,
                });
                return;
            }

            set({ drawingState: "drawing", selectedElementId: null });
            const newElement = createElement(nanoid(), tool, pos.x, pos.y);
            set({ currentElement: newElement });
        },

        handleMouseMove: (e, canvas) => {
            const {
                drawingState,
                tool,
                panOffset,
                elements,
                startPosition,
                panStartPosition,
                currentElement,
            } = get();
            const pos = getMousePosition(e, canvas, panOffset);

            get().actions.emitCursor(pos);

            if (drawingState === "panning") {
                const dx = e.clientX - panStartPosition.x;
                const dy = e.clientY - panStartPosition.y;
                set({
                    panOffset: {
                        x: panOffset.x + dx,
                        y: panOffset.y + dy,
                    },
                    panStartPosition: { x: e.clientX, y: e.clientY }, 
                });
                return;
            }

            if (drawingState === "moving" && currentElement) {
                const dx = pos.x - startPosition.x;
                const dy = pos.y - startPosition.y;

                const updatedElement = {
                    ...currentElement,
                    x: currentElement.x + dx,
                    y: currentElement.y + dy,
                };

                const updatedElements = elements.map((el) =>
                    el.id === currentElement.id ? updatedElement : el,
                );
                set({
                    elements: updatedElements,
                    currentElement: updatedElement,
                    startPosition: pos,
                }); 
                return;
            }

            if (drawingState === "drawing" && currentElement) {
                const dx = pos.x - startPosition.x;
                const dy = pos.y - startPosition.y;
                let updatedElement: WhiteboardElement;

                if (currentElement.type === "rectangle") {
                    updatedElement = {
                        ...currentElement,
                        x: dx > 0 ? startPosition.x : pos.x,
                        y: dy > 0 ? startPosition.y : pos.y,
                        width: Math.abs(dx),
                        height: Math.abs(dy),
                    };
                } else if (currentElement.type === "pencil") {
                    updatedElement = {
                        ...currentElement,
                        points: [
                            ...currentElement.points,
                            {
                                x: pos.x - currentElement.x,
                                y: pos.y - currentElement.y,
                            },
                        ],
                    };
                } else {
                    return;
                }

                set({ currentElement: updatedElement });
                set({
                    elements: [
                        ...elements.filter((el) => el.id !== currentElement.id),
                        updatedElement,
                    ],
                });
            }
        },

        handleMouseUp: () => {
            const { drawingState, elements, currentElement } = get();

            if (
                (drawingState === "drawing" && currentElement) ||
                drawingState === "moving"
            ) {
                get().actions.setElements(elements, true); 
            }

            set({ drawingState: "idle", currentElement: null });
        },

        handleWheel: (e) => {
            e.preventDefault();
            const { panOffset } = get();
            set({
                panOffset: {
                    x: panOffset.x - e.deltaX,
                    y: panOffset.y - e.deltaY,
                },
            });
        },
    },
}));


const Toolbar: React.FC = () => {
    const tool = useStore((s) => s.tool);
    const setTool = useStore((s) => s.actions.setTool);

    const tools: { name: Tool; icon: React.ReactNode }[] = [
        { name: "select", icon: <MousePointer size={20} /> },
        { name: "pencil", icon: <Pencil size={20} /> },
        { name: "rectangle", icon: <RectangleHorizontal size={20} /> },
        { name: "pan", icon: <Hand size={20} /> },
    ];

    return (
        <div className="toolbar">
            {tools.map(({ name, icon }) => (
                <button
                    key={name}
                    className={tool === name ? "active" : ""}
                    onClick={() => setTool(name)}
                >
                    {icon}
                </button>
            ))}
        </div>
    );
};

const CursorOverlay: React.FC = () => {
    const cursors = useStore((s) => s.cursors);
    const panOffset = useStore((s) => s.panOffset);

    return (
        <div className="cursor-overlay">
            {cursors.map((cursor) => (
                <div
                    key={cursor.sessionId}
                    className="cursor"
                    style={{
                        transform: `translate(${cursor.x + panOffset.x}px, ${cursor.y + panOffset.y}px)`,
                    }}
                >
                    <MousePointer size={20} />
                    <span>{cursor.sessionId.substring(0, 4)}</span>
                </div>
            ))}
        </div>
    );
};

const App: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const actions = useStore((s) => s.actions);
    const elements = useStore((s) => s.elements);
    const panOffset = useStore((s) => s.panOffset);
    const selectedElementId = useStore((s) => s.selectedElementId);
    const tool = useStore((s) => s.tool);

    useEffect(() => {
        actions.initSocketListeners();
        socket.connect();
        console.log(
            `Connecting to canvas: ${canvasId} with session: ${sessionId}`,
        );

        return () => {
            console.log("Disconnecting from socket");
            socket.disconnect();
        };
    }, [actions]);

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(panOffset.x, panOffset.y);

        elements.forEach((el) => drawElement(ctx, el));

        if (selectedElementId) {
            const el = elements.find((e) => e.id === selectedElementId);
            if (el) drawSelectionBox(ctx, el);
        }

        ctx.restore();
    }, [elements, panOffset, selectedElementId]);

    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            useStore.setState({});
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div
            className="app-container"
            style={{ cursor: tool === "pan" ? "grab" : "default" }}
        >
            <Toolbar />
            <CursorOverlay />
            <canvas
                ref={canvasRef}
                onMouseDown={(e) =>
                    actions.handleMouseDown(e, canvasRef.current!)
                }
                onMouseMove={(e) =>
                    actions.handleMouseMove(e, canvasRef.current!)
                }
                onMouseUp={actions.handleMouseUp}
                onWheel={actions.handleWheel} // Added for panning/zooming
                style={{
                    width: "100vw",
                    height: "100vh",
                    background: "#f8f8f8",
                }}
            />
        </div>
    );
};

export default App;
