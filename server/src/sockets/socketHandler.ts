import { Server as SocketIOServer } from 'socket.io';
import mongoose from "mongoose";
import { Server as HTTPServer } from 'http';
import { User } from '../models/User';
import { socketAuthenticate } from '../middlewares/authMiddleware';
import { error } from 'console';
import { element } from '../models/element';

interface UserState {
    sessionId: string;
    cursors?: { x: number, y: number };
}

interface CanvasState {
    element: any[];
    users: Map<string, UserState>;
}

export class SocketManager {
    private io: SocketIOServer;
    private connectedUser: Map<string> = new Map();

    constructor(server: HTTPServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                methods: ['GET', 'POST']
            }
        });
        this.setupMiddlewares();
        this.setupEventHandlers();
    }

    private setupMiddlewares() {
        this.io.use((socket, next) => {
            try {
                const { canvasId, sessionId } = socket.handshake.auth;
                if (!canvasId || typeof.canvasId !== 'string') {
                    return next(new Error("invalid connection canvasId is required "));
                }
                socket.data.canvasId = canvasId;
                socket.data.sessionId = sessionId;
                next();
            } catch (error) {
                next(new Error("authentication error"));
            };
        });
    }

    private activeCanvases = new Map<string, CanvasState>

    private setupEventHandlers() {
        this.io.on('connection', (socket) => {
            socket.on('join-canvas', (canvasId: string) => {
                try {
                    await this.handleJoinCanvas(canvasId);
                } catch (error) {
                    console.error(`error joining canvas for ${canvasId}: `, error);
                    socket.emit(`join-error could not join canvas`)
                }
            });
            socket.on('leave-canvas', (canvasId: string) => {
                try {
                    await this.handleLeaveCanvas(canvasId);
                } catch (error) {
                    console.error(`error leaving canvas for ${canvasId}: `, error);
                    socket.emit(`leave-error could not leave canvas`)
                }
            });
            socket.on('element-created', async (data) => {
                try {
                    await this.handleElementCreated(socket, data);
                } catch (error) {
                    console.log('error creating element')
                }
            });
            socket.on('element-updated', async (dataToUpdate, oldData) => {
                try {
                    await this.handleElementUpdated(socket, dataToUpdate, oldData);
                } catch (error) {
                    socket.emit('error updating element');
                }
            });
            socket.on('element-deleted', async (data) => {
                try {
                    await this.handleElementUpdated(socket, data);
                } catch (error) {
                    socket.emit('error deleting element')
                }
            });
            socket.on('user-cursors', async (data) => {
                try {
                    await this.handleElementUpdated(socket, data);
                } catch (error) {
                    socket.emit('error handling multiple cursors')
                }
            });
        });
    }

    private async handleJoinCanvas(socket: any) {
        const { canvasId, sessionId } = socket.data;

        socket.join(canvasId);
        console.log(`user ${sessionId} joined with canvasId ${canvasId}`);

        let canvasState: CanvasState | undefined = this.activeCanvases.get(canvasId);

        if (!canvasState) {
            console.log(`canvasState not active of the canvas id ${canvasId}`);
            const canvasDoc = await element.findById(canvasId);

            if (!canvasDoc) {
                socket.emit('error data could not be found');
                return;
            }

            canvasState = {
                element: canvasDoc.element || [],
                users: new Map<string, UserState>()
            }

            this.activeCanvases.set(canvasId, canvasState);
        }

        const newUser: UserState = { sessionId };
        canvasState.users.set(socket.id, newUser);

        socket.emit('canvas state', canvasState.element);
        const otherUsers = Array.from(canvasState.users.values()).filter(user => user.sessionId !== sessionId);
        socket.emit('users-joined', otherUsers);

        socket.to(canvasId).emit('user-joined', newUser);
    }

    private async handleElementCreated(socket: any, element: any) {
    }

}

