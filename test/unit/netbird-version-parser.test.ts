import { describe, expect, test } from "bun:test";

import { parseVersion } from "../../src/lib/netbird-version-parser.ts";

describe("parseVersion", () => {
    test("extracts a bare semver", () => {
        expect(parseVersion("0.67.0").version).toBe("0.67.0");
    });

    test("extracts from `netbird version 0.67.0`", () => {
        expect(parseVersion("netbird version 0.67.0").version).toBe("0.67.0");
    });

    test("strips a leading `v`", () => {
        expect(parseVersion("v0.67.0").version).toBe("0.67.0");
    });

    test("accepts pre-release suffixes", () => {
        expect(parseVersion("0.67.0-rc1").version).toBe("0.67.0-rc1");
    });

    test("accepts build metadata", () => {
        expect(parseVersion("0.67.0+gabc123").version).toBe("0.67.0+gabc123");
    });

    test("returns null on empty input", () => {
        expect(parseVersion("").version).toBeNull();
    });

    test("returns null when no version token is present", () => {
        expect(parseVersion("unknown").version).toBeNull();
    });

    test("ignores trailing noise", () => {
        expect(parseVersion("netbird version 0.67.0 (linux/amd64)").version).toBe("0.67.0");
    });

    test("returns null for two-component version", () => {
        expect(parseVersion("1.2").version).toBeNull();
    });

    test("extracts version with combined pre-release and build metadata", () => {
        expect(parseVersion("0.67.0-rc1+build.42").version).toBe("0.67.0-rc1+build.42");
    });

    test("extracts version with dotted pre-release", () => {
        expect(parseVersion("0.67.0-alpha.1").version).toBe("0.67.0-alpha.1");
    });

    test("returns null for plain text with no digits", () => {
        expect(parseVersion("netbird daemon is running").version).toBeNull();
    });

    test("extracts first version when multiple appear", () => {
        expect(parseVersion("CLI: 0.66.4, Daemon: 0.67.0").version).toBe("0.66.4");
    });
});
