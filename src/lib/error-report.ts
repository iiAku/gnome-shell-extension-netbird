// Formats an error report suitable for pasting into a GitHub issue.
// Pure function — no GJS dependencies — so it's unit-testable.

export type ErrorContext = {
    readonly extensionVersion: string;
    readonly daemonVersion: string | null;
    readonly shellVersion: string;
    readonly sessionType: string;
    readonly desktop: string;
    readonly os: string;
    readonly state: string;
};

export const formatErrorReport = (error: unknown, context: ErrorContext): string => {
    const now = new Date().toISOString();
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? "(no stack)") : "(no stack)";

    return [
        "### Error report",
        "",
        `**${name}**: ${message}`,
        "",
        "| Detail | Value |",
        "|---|---|",
        `| Extension | v${context.extensionVersion} |`,
        `| Daemon | ${context.daemonVersion ?? "unknown"} |`,
        `| GNOME Shell | ${context.shellVersion} |`,
        `| Session | ${context.sessionType} |`,
        `| Desktop | ${context.desktop} |`,
        `| OS | ${context.os} |`,
        `| State | ${context.state} |`,
        `| Time | ${now} |`,
        "",
        "<details><summary>Stack trace</summary>",
        "",
        "```",
        stack,
        "```",
        "",
        "</details>",
    ].join("\n");
};
