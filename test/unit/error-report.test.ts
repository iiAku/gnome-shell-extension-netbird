import { describe, expect, test } from "bun:test";

import { formatErrorReport, type ErrorContext } from "../../src/lib/error-report.ts";

const context: ErrorContext = {
    extensionVersion: "1",
    daemonVersion: "0.67.0",
    shellVersion: "47.0",
    sessionType: "wayland",
    desktop: "GNOME",
    os: "Fedora Linux 41 (Workstation Edition)",
    state: "connected",
};

describe("formatErrorReport", () => {
    test("includes error name and message", () => {
        const report = formatErrorReport(new Error("something broke"), context);
        expect(report).toContain("**Error**: something broke");
    });

    test("includes typed error name", () => {
        const err = new TypeError("bad type");
        const report = formatErrorReport(err, context);
        expect(report).toContain("**TypeError**: bad type");
    });

    test("includes extension version", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| Extension | v1 |");
    });

    test("includes daemon version", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| Daemon | 0.67.0 |");
    });

    test("shows unknown when daemon version is null", () => {
        const report = formatErrorReport(new Error("x"), { ...context, daemonVersion: null });
        expect(report).toContain("| Daemon | unknown |");
    });

    test("includes GNOME Shell version", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| GNOME Shell | 47.0 |");
    });

    test("includes session type", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| Session | wayland |");
    });

    test("includes desktop environment", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| Desktop | GNOME |");
    });

    test("includes OS name", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| OS | Fedora Linux 41 (Workstation Edition) |");
    });

    test("includes current state", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toContain("| State | connected |");
    });

    test("includes stack trace in collapsed details block", () => {
        const err = new Error("boom");
        const report = formatErrorReport(err, context);
        expect(report).toContain("<details><summary>Stack trace</summary>");
        expect(report).toContain("```");
        expect(report).toContain("Error: boom");
    });

    test("handles non-Error values gracefully", () => {
        const report = formatErrorReport("string error", context);
        expect(report).toContain("**UnknownError**: string error");
        expect(report).toContain("(no stack)");
    });

    test("includes ISO timestamp", () => {
        const report = formatErrorReport(new Error("x"), context);
        expect(report).toMatch(/\| Time \| \d{4}-\d{2}-\d{2}T/);
    });

    test("produces valid markdown table", () => {
        const report = formatErrorReport(new Error("x"), context);
        const lines = report.split("\n");
        const tableHeader = lines.find((line) => line.startsWith("| Detail"));
        const tableSep = lines.find((line) => line.startsWith("|---|"));
        expect(tableHeader).toBeDefined();
        expect(tableSep).toBeDefined();
    });
});
