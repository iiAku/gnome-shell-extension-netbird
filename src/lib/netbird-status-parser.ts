// Pure parser for `netbird status` output. Zero GJS dependencies so unit tests
// can run under plain Bun. Matches tokens from `constants.NetbirdStatusTokens`
// so renaming a token updates both regex construction AND value comparison.

import { NetbirdStatusTokens } from "./constants.js";
import { NetbirdState, type NetbirdStateValue } from "./netbird-state.js";

export type NetbirdStatus = {
    readonly state: NetbirdStateValue;
    readonly fqdn: string | null;
    readonly ip: string | null;
    readonly raw: string;
};

// Using `[ \t]*` (not `\s*`) for the separator after `:` so empty fields like
// `FQDN:\n` don't silently cross newlines and capture text from the next line.
const fieldValueRegex = (field: string): RegExp => new RegExp(`${field}:[ \\t]*(\\w+)`, "i");
const fieldCaptureRegex = (field: string): RegExp => new RegExp(`${field}:[ \\t]*([^\\s]+)`, "i");

const DAEMON_STATUS_RE = fieldValueRegex(NetbirdStatusTokens.DaemonField);
const MANAGEMENT_RE = fieldValueRegex(NetbirdStatusTokens.ManagementField);
const FQDN_RE = fieldCaptureRegex(NetbirdStatusTokens.FqdnField);
// `NetBird IP` contains a space in the field name — allow [ \t]+ between words.
const IP_RE = new RegExp(
    `${NetbirdStatusTokens.NetbirdIpField.replace(" ", "[ \\t]+")}:[ \\t]*([^\\s]+)`,
    "i",
);

// Exported for unit testing — normally called only from parseStatusText.
export const resolveState = (
    lower: string,
    daemonValue: string,
    managementValue: string,
): NetbirdStateValue => {
    if (
        lower.includes(NetbirdStatusTokens.NeedsLoginPhrase) ||
        lower.includes(NetbirdStatusTokens.NoSessionPhrase)
    ) {
        return NetbirdState.NeedsLogin;
    }
    if (
        daemonValue === NetbirdStatusTokens.ValueConnected ||
        managementValue === NetbirdStatusTokens.ValueConnected
    ) {
        return NetbirdState.Connected;
    }
    if (
        daemonValue === NetbirdStatusTokens.ValueConnecting ||
        managementValue === NetbirdStatusTokens.ValueConnecting
    ) {
        return NetbirdState.Connecting;
    }
    if (
        daemonValue === NetbirdStatusTokens.ValueIdle ||
        daemonValue === NetbirdStatusTokens.ValueDisconnected ||
        lower.includes(NetbirdStatusTokens.DisconnectedPhrase)
    ) {
        return NetbirdState.Disconnected;
    }
    if (
        lower.includes(NetbirdStatusTokens.ErrorPhrase) ||
        lower.includes(NetbirdStatusTokens.FailPhrase)
    ) {
        return NetbirdState.Error;
    }
    return NetbirdState.Unknown;
};

export const parseStatusText = (text: string): NetbirdStatus => {
    const lower = text.toLowerCase();
    const daemonValue = DAEMON_STATUS_RE.exec(text)?.[1]?.toLowerCase() ?? "";
    const managementValue = MANAGEMENT_RE.exec(text)?.[1]?.toLowerCase() ?? "";

    return {
        state: resolveState(lower, daemonValue, managementValue),
        fqdn: FQDN_RE.exec(text)?.[1] ?? null,
        ip: IP_RE.exec(text)?.[1] ?? null,
        raw: text,
    };
};
