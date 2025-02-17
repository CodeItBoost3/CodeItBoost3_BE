import { object, string, number, boolean, optional, size, min, max } from "superstruct";

export const CreateGroupStruct = object({
    name: size(string(), 2, 36),
    userId: number(),
    password: size(string(), 6, 16),
    imageUrl: optional(string()),
    isPublic: boolean(),
    introduction: optional(size(string(), 0, 500)),
});

export const UpdateGroupStruct = object({
    name: optional(size(string(), 2, 36)),
    password: optional(size(string(), 6, 16)),
    imageUrl: optional(string()),
    isPublic: optional(boolean()),
    introduction: optional(size(string(), 0, 500)),
});