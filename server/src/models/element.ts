import mongoose, { Document, Schema, Model, Types } from "mongoose";

export interface IElementSchema {
    _id: Types.UUID;
    element: Array<Object>;
    title: string;
    lastModified: Date;
    createdAt: Date;
}

export type IElement = IElementSchema & Document;

export interface IElementModel extends Model<IElement> {
}

const elementSchema = new Schema<IElement, IElementModel>({
    element: {
        type: [Object],
        required: false,
        unique: false,
    },
    title: {
        type: String,
        required: false,
        default: 'Unititled',
        trim: true,
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

export const element = mongoose.model<IElement, IElementModel>('Element', elementSchema);
