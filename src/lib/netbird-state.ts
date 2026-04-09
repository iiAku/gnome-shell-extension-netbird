export const NetbirdState = {
    Unknown: "unknown",
    Disconnected: "disconnected",
    Connecting: "connecting",
    Connected: "connected",
    NeedsLogin: "needs_login",
    Error: "error",
} as const;

export type NetbirdStateValue = (typeof NetbirdState)[keyof typeof NetbirdState];
