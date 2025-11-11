import { io } from "socket.io-client";
import { nanoid } from "nanoid";
import { MousePointer, Pencil, RectangleHorizontal, Hand } from "lucide-react";

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
