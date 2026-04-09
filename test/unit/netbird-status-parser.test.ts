import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseStatusText, resolveState } from "../../src/lib/netbird-status-parser.ts";
import { NetbirdState, type NetbirdStateValue } from "../../src/lib/netbird-state.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

const loadFixture = (name: string): string =>
    readFileSync(join(fixturesDir, `${name}.txt`), "utf8");

describe("parseStatusText", () => {
    test("parses a connected session with FQDN and IP", () => {
        const result = parseStatusText(loadFixture("status-connected"));

        expect(result.state).toBe(NetbirdState.Connected);
        expect(result.fqdn).toBe("my-machine.netbird.example.com");
        expect(result.ip).toBe("100.64.0.1/16");
    });

    test("parses a disconnected session with idle daemon", () => {
        const result = parseStatusText(loadFixture("status-disconnected"));

        expect(result.state).toBe(NetbirdState.Disconnected);
        expect(result.fqdn).toBeNull();
        expect(result.ip).toBeNull();
    });

    test("parses a connecting session", () => {
        const result = parseStatusText(loadFixture("status-connecting"));

        expect(result.state).toBe(NetbirdState.Connecting);
    });

    test("parses needs-login output from SSO flow", () => {
        const result = parseStatusText(loadFixture("status-needs-login"));

        expect(result.state).toBe(NetbirdState.NeedsLogin);
    });

    test("returns Unknown for empty input", () => {
        const result = parseStatusText("");

        expect(result.state).toBe(NetbirdState.Unknown);
        expect(result.fqdn).toBeNull();
        expect(result.ip).toBeNull();
    });

    test("returns Unknown for garbled input with no recognized tokens", () => {
        const result = parseStatusText("something completely unrelated");

        expect(result.state).toBe(NetbirdState.Unknown);
    });

    test("preserves the raw text for debugging", () => {
        const input = loadFixture("status-connected");
        const result = parseStatusText(input);

        expect(result.raw).toBe(input);
    });

    test("preserves CIDR notation in IP address", () => {
        const result = parseStatusText("NetBird IP: 10.0.0.1/24\n");
        expect(result.ip).toBe("10.0.0.1/24");
    });

    test("parses IP without CIDR prefix", () => {
        const result = parseStatusText("NetBird IP: 10.0.0.1\n");
        expect(result.ip).toBe("10.0.0.1");
    });

    test("returns null IP when field is empty", () => {
        const result = parseStatusText("NetBird IP:\n");
        expect(result.ip).toBeNull();
    });

    test("returns null FQDN when field is empty", () => {
        const result = parseStatusText("FQDN:\n");
        expect(result.fqdn).toBeNull();
    });

    test("handles tabs between field name and value", () => {
        const result = parseStatusText("Management:\tConnected\nFQDN:\tmy-peer.example.com\n");
        expect(result.state).toBe(NetbirdState.Connected);
        expect(result.fqdn).toBe("my-peer.example.com");
    });

    test("handles multiple spaces between field name and value", () => {
        const result = parseStatusText("Daemon status:   Idle\n");
        expect(result.state).toBe(NetbirdState.Disconnected);
    });

    test("detects error state from free-text error phrases", () => {
        const result = parseStatusText("Daemon status: error connecting to daemon");
        expect(result.state).toBe(NetbirdState.Error);
    });

    test("detects error state from fail phrases", () => {
        const result = parseStatusText("connection failed unexpectedly");
        expect(result.state).toBe(NetbirdState.Error);
    });
});

describe("resolveState", () => {
    // [lower, daemonValue, managementValue, expected]
    const cases: ReadonlyArray<readonly [string, string, string, NetbirdStateValue]> = [
        ["needs login required", "", "", NetbirdState.NeedsLogin],
        ["please log in, no session found", "", "", NetbirdState.NeedsLogin],
        ["", "connected", "", NetbirdState.Connected],
        ["", "", "connected", NetbirdState.Connected],
        ["", "connecting", "", NetbirdState.Connecting],
        ["", "", "connecting", NetbirdState.Connecting],
        ["", "idle", "", NetbirdState.Disconnected],
        ["", "disconnected", "", NetbirdState.Disconnected],
        ["management: disconnected", "", "", NetbirdState.Disconnected],
        ["unexpected error occurred", "", "", NetbirdState.Error],
        ["connection fail", "", "", NetbirdState.Error],
        ["", "", "", NetbirdState.Unknown],
        ["totally unrelated text", "", "", NetbirdState.Unknown],
    ];

    test.each(cases)(
        "resolves (%p, daemon=%p, mgmt=%p) → %p",
        (lower, daemonValue, managementValue, expected) => {
            expect(resolveState(lower, daemonValue, managementValue)).toBe(expected);
        },
    );

    test("prioritizes needs-login over connected daemon", () => {
        // If NetBird somehow reports both states, needs-login wins because
        // the user must complete SSO before anything else is meaningful.
        expect(resolveState("needs login", "connected", "connected")).toBe(NetbirdState.NeedsLogin);
    });

    test("prioritizes connected over connecting when either field matches", () => {
        expect(resolveState("", "connected", "connecting")).toBe(NetbirdState.Connected);
        expect(resolveState("", "connecting", "connected")).toBe(NetbirdState.Connected);
    });
});
