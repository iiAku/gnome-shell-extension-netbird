import { describe, expect, test } from "bun:test";

import { Binary, CliFlags, CliVerbs } from "../../src/lib/constants.ts";
import { buildArgs, type NetbirdOptions } from "../../src/lib/netbird-args.ts";

const options: NetbirdOptions = {
    url: "https://api.netbird.example:443",
    daemonAddr: "unix:///var/run/netbird.sock",
};

const allFlagsOn: NetbirdOptions = {
    ...options,
    allowServerSsh: true,
    enableRosenpass: true,
    enableLazyConnection: true,
    blockInbound: true,
};

const allFlagsOff: NetbirdOptions = {
    ...options,
    allowServerSsh: false,
    enableRosenpass: false,
    enableLazyConnection: false,
    blockInbound: false,
};

describe("buildArgs", () => {
    test("starts with the netbird binary", () => {
        const argv = buildArgs(options, CliVerbs.Status);
        expect(argv[0]).toBe(Binary);
    });

    test("passes --daemon-addr with the socket path", () => {
        const argv = buildArgs(options, CliVerbs.Status);
        const idx = argv.indexOf(CliFlags.DaemonAddr);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(argv[idx + 1]).toBe(options.daemonAddr);
    });

    test("passes the same URL as both --management-url and --admin-url for `up`", () => {
        const argv = buildArgs(options, CliVerbs.Up);
        const mgmtIdx = argv.indexOf(CliFlags.ManagementUrl);
        const adminIdx = argv.indexOf(CliFlags.AdminUrl);
        expect(argv[mgmtIdx + 1]).toBe(options.url);
        expect(argv[adminIdx + 1]).toBe(options.url);
    });

    test("does NOT pass --management-url or --admin-url for `status` (CLI rejects them)", () => {
        const argv = buildArgs(options, CliVerbs.Status);
        expect(argv).not.toContain(CliFlags.ManagementUrl);
        expect(argv).not.toContain(CliFlags.AdminUrl);
    });

    test("does NOT pass --management-url or --admin-url for `down`", () => {
        const argv = buildArgs(options, CliVerbs.Down);
        expect(argv).not.toContain(CliFlags.ManagementUrl);
        expect(argv).not.toContain(CliFlags.AdminUrl);
    });

    test.each([CliVerbs.Status, CliVerbs.Down])("`%s` verb is last in argv", (verb) => {
        const argv = buildArgs(options, verb);
        expect(argv[argv.length - 1]).toBe(verb);
    });

    test("`up` verb precedes the URL flags", () => {
        const argv = buildArgs(options, CliVerbs.Up);
        const upIdx = argv.indexOf(CliVerbs.Up);
        const mgmtIdx = argv.indexOf(CliFlags.ManagementUrl);
        expect(upIdx).toBeGreaterThanOrEqual(0);
        expect(upIdx).toBeLessThan(mgmtIdx);
    });

    test("`version` only includes binary and verb (no daemon-addr)", () => {
        const argv = buildArgs(options, CliVerbs.Version);
        expect(argv).toEqual([Binary, CliVerbs.Version]);
    });

    test("includes --allow-server-ssh when allowServerSsh is true", () => {
        const argv = buildArgs({ ...options, allowServerSsh: true }, CliVerbs.Up);
        expect(argv).toContain(CliFlags.AllowServerSsh);
    });

    test("omits --allow-server-ssh when allowServerSsh is false", () => {
        const argv = buildArgs({ ...options, allowServerSsh: false }, CliVerbs.Up);
        expect(argv).not.toContain(CliFlags.AllowServerSsh);
    });

    test("omits --allow-server-ssh when allowServerSsh is undefined", () => {
        const argv = buildArgs(options, CliVerbs.Up);
        expect(argv).not.toContain(CliFlags.AllowServerSsh);
    });

    test("includes all optional flags when all are true", () => {
        const argv = buildArgs(allFlagsOn, CliVerbs.Up);
        expect(argv).toContain(CliFlags.AllowServerSsh);
        expect(argv).toContain(CliFlags.EnableRosenpass);
        expect(argv).toContain(CliFlags.EnableLazyConnection);
        expect(argv).toContain(CliFlags.BlockInbound);
    });

    test("omits all optional flags when all are false", () => {
        const argv = buildArgs(allFlagsOff, CliVerbs.Up);
        expect(argv).not.toContain(CliFlags.AllowServerSsh);
        expect(argv).not.toContain(CliFlags.EnableRosenpass);
        expect(argv).not.toContain(CliFlags.EnableLazyConnection);
        expect(argv).not.toContain(CliFlags.BlockInbound);
    });

    test("optional flags only apply to `up`, not `status` or `down`", () => {
        for (const verb of [CliVerbs.Status, CliVerbs.Down] as const) {
            const argv = buildArgs(allFlagsOn, verb);
            expect(argv).not.toContain(CliFlags.AllowServerSsh);
            expect(argv).not.toContain(CliFlags.EnableRosenpass);
        }
    });
});
