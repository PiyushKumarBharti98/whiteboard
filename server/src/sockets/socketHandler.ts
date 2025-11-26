import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { element as ElementModel } from "../models/element";

interface UserState {
    sessionId: string;
    cursors?: { x: number; y: number };
}

interface CanvasState {
    element: any[];
    users: Map<string, UserState>;
}

export class SocketManager {
    private io: SocketIOServer;
    private activeCanvases = new Map<string, CanvasState>();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(server: HTTPServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:5173",
                methods: ["GET", "POST"],
            },
        });
        this.setupMiddlewares();
        this.setupEventHandlers();
    }

    private setupMiddlewares() {
        this.io.use((socket, next) => {
            try {
                const { canvasId, sessionId } = socket.handshake.auth;
                if (!canvasId || typeof canvasId !== "string") {
                    return next(
                        new Error("invalid connection canvasId is required"),
                    );
                }
                socket.data.canvasId = canvasId;
                socket.data.sessionId = sessionId;
                next();
            } catch (error) {
                console.error("Authentication error:", error);
                next(new Error("authentication error"));
            }
        });
    }

    private setupEventHandlers() {
        this.io.on("connection", (socket: Socket) => {
            // Added async here
            socket.on("join-canvas", async () => {
                try {
                    await this.handleJoinCanvas(socket);
                } catch (error) {
                    console.error(
                        `error joining canvas for ${socket.data.canvasId}: `,
                        error,
                    );
                    socket.emit("join-error", "could not join canvas");
                }
            });

            socket.on("element-update", async (elements: any[]) => {
                try {
                    await this.handleElementUpdate(socket, elements);
                } catch (error) {
                    console.log("error updating element");
                }
            });

            socket.on(
                "user-cursors",
                async (data: { x: number; y: number }) => {
                    try {
                        await this.handleCursorPosition(socket, data);
                    } catch (error) {
                        socket.emit("error handling multiple cursors");
                    }
                },
            );

            socket.on("disconnect", async () => {
                try {
                    await this.handleLeaveCanvas(socket);
                } catch (error) {
                    console.error(
                        `error leaving canvas for ${socket.data.canvasId}: `,
                        error,
                    );
                    socket.emit("leave-error", "could not leave canvas");
                }
            });
        });
    }

    private async handleJoinCanvas(socket: Socket) {
        const { canvasId, sessionId } = socket.data;
        if (!canvasId || !sessionId) return;

        socket.join(canvasId);
        console.log(
            `user ${sessionId} (${socket.id}) joined canvas ${canvasId}`,
        );

        let canvasState: CanvasState | undefined =
            this.activeCanvases.get(canvasId);

        if (!canvasState) {
            console.log(
                `Canvas state not active for ${canvasId}, fetching from DB...`,
            );
            // Use ElementModel (from element.ts)
            const canvasDoc = await ElementModel.findById(canvasId);

            if (canvasDoc) {
                canvasState = {
                    element: canvasDoc.element || [],
                    users: new Map<string, UserState>(),
                };
            } else {
                console.log(
                    `No canvas found for ${canvasId}, creating new one.`,
                );
                canvasState = {
                    element: [],
                    users: new Map<string, UserState>(),
                };
            }
            this.activeCanvases.set(canvasId, canvasState);
        }

        const newUser: UserState = { sessionId };
        canvasState.users.set(socket.id, newUser);

        socket.emit("canvas-state", canvasState.element);

        const otherUsers = Array.from(canvasState.users.values()).filter(
            (user) => user.sessionId !== sessionId,
        );
        socket.emit("users-joined", otherUsers);

        socket.to(canvasId).emit("user-joined", newUser);
    }

    private async handleLeaveCanvas(socket: Socket) {
        const { canvasId, sessionId } = socket.data;
        if (!canvasId || !sessionId) return;

        const canvasState = this.activeCanvases.get(canvasId);
        if (!canvasState) return;

        canvasState.users.delete(socket.id);
        console.log(`user ${sessionId} (${socket.id}) left canvas ${canvasId}`);

        socket.to(canvasId).emit("user-left", { sessionId });

        // Future optimization: if no users left, clear canvas from memory
        // if (canvasState.users.size === 0) {
        //     this.activeCanvases.delete(canvasId);
        //     console.log(`Cleared inactive canvas ${canvasId} from memory.`);
        // }
    }

    private async handleElementUpdate(socket: Socket, elements: any[]) {
        const canvasId = socket.data.canvasId;
        if (!canvasId) return;

        let canvasState = this.activeCanvases.get(canvasId);

        if (!canvasState) {
            console.log(
                `Canvas state missing for update on ${canvasId}, attempting to load...`,
            );
            try {
                const canvasDoc = await ElementModel.findById(canvasId);
                if (canvasDoc) {
                    canvasState = {
                        element: canvasDoc.element || [],
                        users: new Map<string, UserState>(),
                    };
                } else {
                    canvasState = {
                        element: [],
                        users: new Map<string, UserState>(),
                    };
                }
                this.activeCanvases.set(canvasId, canvasState);
            } catch (error) {
                console.error(`Error loading canvas during update:`, error);
                return;
            }
        }

        if (!canvasState) {
            console.log(
                `Error: canvasState could not be established for ${canvasId}`,
            );
            return;
        }

        canvasState.element = elements;
        socket.to(canvasId).emit("elements-updated", elements);
        this.scheduleDatabaseSave(canvasId);
    }
    private async handleCursorPosition(
        socket: Socket,
        cursorPosition: { x: number; y: number },
    ) {
        const canvasId = socket.data.canvasId;
        const sessionId = socket.data.sessionId;
        if (!canvasId || !sessionId) return;

        const canvasState = this.activeCanvases.get(canvasId);
        if (!canvasState) return;

        const userState = canvasState.users.get(socket.id);
        if (userState) {
            userState.cursors = cursorPosition;
        }

        socket.to(canvasId).emit("user-cursors", {
            sessionId,
            ...cursorPosition,
        });
    }

    private scheduleDatabaseSave(canvasId: string) {
        if (this.debounceTimers.has(canvasId)) {
            clearTimeout(this.debounceTimers.get(canvasId));
        }

        const timer = setTimeout(async () => {
            console.log(`Saving canvas ${canvasId} to database...`);
            const canvasState = this.activeCanvases.get(canvasId);
            if (canvasState) {
                try {
                    await ElementModel.findByIdAndUpdate(
                        canvasId,
                        {
                            element: canvasState.element,
                            lastModified: new Date(),
                        },
                        { upsert: true, new: true },
                    );
                    console.log(`Canvas ${canvasId} successfully saved.`);
                } catch (error) {
                    console.error(`Error saving canvas ${canvasId}:`, error);
                }
            }
            this.debounceTimers.delete(canvasId);
        }, 5000);
        this.debounceTimers.set(canvasId, timer);
    }
}
