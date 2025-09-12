import mongoose, { Document, Schema, Model, Types } from "mongoose";

export interface ISessionSchema {
    sessionId: string,
    socketId: string,
}
