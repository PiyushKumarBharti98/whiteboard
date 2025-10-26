import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { connectDB } from "./config/db";
import { redis } from "./config/redis";
import { asyncWrapProviders } from "async_hooks";


dotenv.config();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

const startSever = async () => {
    try {
        await connectDB();
        server.listen(PORT, () => {
            console.log(`server running on ${PORT}`);
            console.log(`enviornment ${process.env.NODE_ENV}` || `development`);
            console.log(`accepting requests from ${process.env.CLIENT_URL}`)
        });
    } catch (error) {
        console.log(`failed to start server`, error);
        process.exit(1);
    }
}

startSever();

process.on('SIGTERM', () => {
    console.log('SIGTERM recieved , shutting down gracefully');
    server.close(() => {
        console.log('process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT recieved, shutting down gracefully');
    server.close(() => {
        console.log('process terminated');
    });
});
