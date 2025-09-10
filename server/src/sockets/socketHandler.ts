import { Server as SocketIOServer } from 'socket.io';
import mongoose from "mongoose";
import { Server as HTTPServer } from 'http';
//import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Chat } from '../models/Chat';
//import { IChat } from '../models/Chat';
import { Message } from '../models/Message';
import { socketAuthenticate } from '../middlewares/authMiddleware';
import { error } from 'console';


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

    private setupEventHandlers() {
        this.io.on('connection', (socket) => {
            socket.on('join-canvas', (canvasId: string) => {
                socket.join(canvasId);
                console.log(`user has join the canvas with canvasId ${canvasId}`);
            });
            socket.on('leave-canvas', (canvasId: string) => {
                socket.leave(canvasId);
                console.log(`user has join the canvas with canvasId ${canvasId}`);
            });
        });
    }

}

