
import mongoose, { Document, Schema, Model } from "mongoose";

// This interface defines the structure of a single canvas document in MongoDB.
export interface ICanvasSchema {
    // Note: Mongoose automatically adds the '_id' field.
    elements: Array<any>; // Changed from 'element' to 'elements' for clarity.
    title: string;
    lastModified: Date;
    createdAt: Date;
}

// This combines the Mongoose Document type with our custom interface.
export type ICanvas = ICanvasSchema & Document;

// This defines the statics for the model (if you needed any).
export interface ICanvasModel extends Model<ICanvas> { }

// This is the actual Mongoose schema definition.
const canvasSchema = new Schema<ICanvas, ICanvasModel>({
    elements: { // Changed from 'element'
        type: [Object],
        required: false,
        default: [], // It's good practice to default an array to empty.
    },
    title: {
        type: String,
        required: false,
        default: 'Untitled',
        trim: true,
        // IMPORTANT: The 'unique' constraint has been removed to allow multiple untitled canvases.
    },
    lastModified: {
        type: Date,
        default: Date.now,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Create and export the Mongoose model.
export const Canvas = mongoose.model<ICanvas, ICanvasModel>('Canvas', canvasSchema);
