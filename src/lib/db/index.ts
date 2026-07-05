// Data-access layer.
//
// Convention (see CLAUDE.md): ALL Supabase queries live in /lib/db as typed
// functions. Components and server actions call these; they never build queries
// inline. Add functions here (or in feature files under this folder) as the app
// grows — e.g. getContacts(), getTodayQueue(), logInteraction().
//
// No queries are implemented yet — features come in later prompts.

export * from "./types";
