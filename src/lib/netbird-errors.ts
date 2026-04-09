// Infrastructure-boundary errors thrown by NetbirdClient. Catch at the indicator
// layer and translate to user-facing notifications. Per CLAUDE.md: "throw domain
// errors, NO Result types, let errors bubble to the caller".

// Verb identifier — typically a `CliVerb` ("up"/"down"/"status"/"version")
// but can also be a subcommand label like "bundle" for `netbird debug bundle`.
type VerbLike = string;

export class NetbirdError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NetbirdError";
    }
}

// `netbird` binary could not be launched — usually means it's not installed
// or not on PATH. Maps to "Failed to connect" in the UI.
export class NetbirdCliNotFoundError extends NetbirdError {
    constructor(public readonly cause: string) {
        super(
            "netbird CLI not found. Please install NetBird and ensure " +
                `the 'netbird' binary is on your PATH. (${cause})`,
        );
        this.name = "NetbirdCliNotFoundError";
    }
}

// Subprocess exceeded its timeout. Indicates the daemon is stuck or the CLI
// is hanging on a slow operation.
export class NetbirdTimeoutError extends NetbirdError {
    constructor(
        public readonly verb: VerbLike,
        public readonly timeoutMs: number,
    ) {
        super(`netbird ${verb} timed out after ${timeoutMs}ms`);
        this.name = "NetbirdTimeoutError";
    }
}

// CLI returned non-zero and did NOT produce an SSO login URL. Most common
// cause: daemon socket permission denied, or daemon not running.
export class NetbirdCliFailedError extends NetbirdError {
    constructor(
        public readonly verb: VerbLike,
        public readonly exitCode: number,
        public readonly stderr: string,
    ) {
        super(`netbird ${verb} failed (exit ${exitCode}): ${stderr.trim() || "(no output)"}`);
        this.name = "NetbirdCliFailedError";
    }
}

// `netbird up` requires an SSO browser login. Carries the login URL so the
// indicator can open it. This is expected control flow — treat as a
// recoverable exception, not a failure.
export class NetbirdLoginRequiredError extends NetbirdError {
    constructor(public readonly loginUrl: string) {
        super("NetBird SSO login required");
        this.name = "NetbirdLoginRequiredError";
    }
}
