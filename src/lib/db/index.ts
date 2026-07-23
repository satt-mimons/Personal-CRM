// Data-access layer.
//
// Convention (see CLAUDE.md): ALL Supabase queries live in /lib/db as typed
// functions. Components and server actions call these; they never build queries
// inline.

export * from "./types";
export * from "./session";
export * from "./contacts";
export * from "./interactions";
export * from "./action-items";
export * from "./digest";
