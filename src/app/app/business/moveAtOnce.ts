// How many clients the Move card sends in one request (2026-11-04 review):
// each is a journal rebuilt, so a long choice is sent in turns of this many,
// each well inside the platform's time limit for one request. Shared by the
// card (MoveClients.tsx) and the action that refuses more (actions.ts).
export const MOVE_AT_ONCE = 5;
