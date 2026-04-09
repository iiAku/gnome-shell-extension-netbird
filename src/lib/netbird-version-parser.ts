// Pure parser for `netbird version` output. Netbird historically prints
// either a bare semver ("0.67.0") or a line like "netbird version 0.67.0".
// We accept both and tolerate leading "v". Returns null when no version token
// can be found so the indicator can fall back to "unknown".

export type NetbirdVersion = {
    readonly version: string | null;
};

const VERSION_RE = /v?(\d+\.\d+\.\d+(?:[-+][\w.]+)*)/;

export const parseVersion = (text: string): NetbirdVersion => {
    const match = VERSION_RE.exec(text);
    return { version: match ? (match[1] ?? null) : null };
};
