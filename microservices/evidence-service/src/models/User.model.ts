import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  email: string;
  name: string;
  organization: string;
  role: 'investigator' | 'validator' | 'admin';
  passwordHash: string;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  organization: { type: String, required: true },
  role: { type: String, enum: ['investigator', 'validator', 'admin'], default: 'investigator' },
  passwordHash: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

export const User = model<IUser>('User', UserSchema);
export default User;

