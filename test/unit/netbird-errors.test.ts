import { describe, expect, test } from "bun:test";

import {
    NetbirdCliFailedError,
    NetbirdCliNotFoundError,
    NetbirdError,
    NetbirdLoginRequiredError,
    NetbirdTimeoutError,
} from "../../src/lib/netbird-errors.ts";

describe("error hierarchy", () => {
    test("NetbirdCliNotFoundError is instanceof NetbirdError", () => {
        const err = new NetbirdCliNotFoundError("No such file");
        expect(err).toBeInstanceOf(NetbirdError);
        expect(err).toBeInstanceOf(Error);
    });

    test("NetbirdTimeoutError is instanceof NetbirdError", () => {
        const err = new NetbirdTimeoutError("up", 120_000);
        expect(err).toBeInstanceOf(NetbirdError);
    });

    test("NetbirdCliFailedError is instanceof NetbirdError", () => {
        const err = new NetbirdCliFailedError("status", 1, "daemon not running");
        expect(err).toBeInstanceOf(NetbirdError);
    });

    test("NetbirdLoginRequiredError is instanceof NetbirdError", () => {
        const err = new NetbirdLoginRequiredError("https://login.example.com");
        expect(err).toBeInstanceOf(NetbirdError);
    });
});

describe("error properties", () => {
    test("NetbirdCliNotFoundError includes actionable install message", () => {
        const err = new NetbirdCliNotFoundError("No such file or directory");
        expect(err.message).toContain("install NetBird");
        expect(err.message).toContain("PATH");
        expect(err.cause).toBe("No such file or directory");
    });

    test("NetbirdTimeoutError exposes verb and timeout", () => {
        const err = new NetbirdTimeoutError("up", 120_000);
        expect(err.verb).toBe("up");
        expect(err.timeoutMs).toBe(120_000);
        expect(err.message).toContain("120000ms");
    });

    test("NetbirdCliFailedError exposes verb, exitCode, and stderr", () => {
        const err = new NetbirdCliFailedError("status", 2, "  permission denied\n");
        expect(err.verb).toBe("status");
        expect(err.exitCode).toBe(2);
        expect(err.stderr).toBe("  permission denied\n");
        expect(err.message).toContain("permission denied");
        expect(err.message).toContain("exit 2");
    });

    test("NetbirdCliFailedError handles empty stderr gracefully", () => {
        const err = new NetbirdCliFailedError("down", 1, "");
        expect(err.message).toContain("(no output)");
    });

    test("NetbirdLoginRequiredError exposes loginUrl", () => {
        const err = new NetbirdLoginRequiredError("https://login.example.com/auth?code=abc");
        expect(err.loginUrl).toBe("https://login.example.com/auth?code=abc");
        expect(err.message).toContain("SSO login required");
    });
});
