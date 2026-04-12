// GJS-only subprocess wrapper around the `netbird` CLI. This is an
// infrastructure-boundary adapter — it throws typed NetbirdError subclasses
// so the indicator can pattern-match on failure modes. Pure parsing logic
// lives in `netbird-status-parser.ts` for unit testability.

import Gio from "gi://Gio";
import GLib from "gi://GLib";

import {
    Binary,
    CliFlags,
    CliVerbs,
    DebugBundleAction,
    DebugSubcommand,
    ExtensionLogPrefix,
    LoginRequiredPhrases,
    TimeoutsMs,
    UrlRegex,
} from "./constants.js";
import { buildArgs, type NetbirdOptions } from "./netbird-args.js";
import {
    NetbirdCliFailedError,
    NetbirdCliNotFoundError,
    NetbirdLoginRequiredError,
    NetbirdTimeoutError,
} from "./netbird-errors.js";
import { parseStatusText, type NetbirdStatus } from "./netbird-status-parser.js";
import { parseVersion, type NetbirdVersion } from "./netbird-version-parser.js";

type CommandResult = {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly timedOut: boolean;
    readonly spawnFailed: boolean;
};

type RunOptions = {
    readonly timeoutMs?: number;
    // Optional external cancellable — allows callers to abort the subprocess
    // from outside (e.g. user clicking "Disconnect" during a stuck SSO flow).
    readonly cancellable?: Gio.Cancellable;
};

const runProcess = (argv: readonly string[], opts: RunOptions = {}): Promise<CommandResult> =>
    new Promise((resolve) => {
        const timeoutMs = opts.timeoutMs ?? TimeoutsMs.Default;
        let finished = false;
        let timeoutId: number | null = null;

        const proc = new Gio.Subprocess({
            argv: [...argv],
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        try {
            proc.init(null);
        } catch (e) {
            // BOUNDARY: subprocess spawn failed — usually binary not on PATH.
            const msg = e instanceof Error ? e.message : String(e);
            resolve({
                stdout: "",
                stderr: msg,
                exitCode: -1,
                timedOut: false,
                spawnFailed: true,
            });
            return;
        }

        const cancellable = opts.cancellable ?? new Gio.Cancellable();
        let cancelHandlerId = cancellable.connect(() => {
            if (finished) return;
            try {
                proc.force_exit();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.debug(`${ExtensionLogPrefix} force_exit (cancel) failed: ${msg}`);
            }
        });

        // Centralised cleanup — called exactly once from whichever path
        // completes first (communicate callback or timeout). GJS is
        // single-threaded, so no mutex needed.
        const cleanup = (): void => {
            if (timeoutId !== null) {
                GLib.Source.remove(timeoutId);
                timeoutId = null;
            }
            if (cancelHandlerId !== 0) {
                cancellable.disconnect(cancelHandlerId);
                cancelHandlerId = 0;
            }
        };

        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            if (finished) {
                timeoutId = null;
                return GLib.SOURCE_REMOVE;
            }
            cancellable.cancel();
            try {
                proc.force_exit();
            } catch (e) {
                // BOUNDARY: force_exit can race with communicate_utf8_finish on
                // fast subprocesses. Non-fatal but worth logging.
                const msg = e instanceof Error ? e.message : String(e);
                console.debug(`${ExtensionLogPrefix} force_exit failed: ${msg}`);
            }
            timeoutId = null;
            return GLib.SOURCE_REMOVE;
        });

        proc.communicate_utf8_async(null, cancellable, (_src, res) => {
            finished = true;
            cleanup();
            let stdout = "";
            let stderr = "";
            let timedOut = false;
            try {
                const [, out, err] = proc.communicate_utf8_finish(res);
                stdout = out ?? "";
                stderr = err ?? "";
            } catch (e) {
                // BOUNDARY: cancellation or I/O error on the subprocess pipes.
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.toLowerCase().includes("cancel")) {
                    timedOut = true;
                }
                stderr = msg;
            }
            const exitCode = proc.get_exit_status();
            resolve({
                stdout,
                stderr,
                exitCode,
                timedOut,
                spawnFailed: false,
            });
        });
    });

// Translates CommandResult failure modes into typed errors. Does NOT handle
// the `up`-specific login URL path — callers check for that before invoking.
// Accepts a plain string for `verb` because some invocations are subcommands
// like `debug bundle` that aren't first-class CliVerbs.
const assertProcessOk = (verb: string, result: CommandResult, timeoutMs: number): void => {
    if (result.spawnFailed) {
        throw new NetbirdCliNotFoundError(result.stderr);
    }
    if (result.timedOut) {
        throw new NetbirdTimeoutError(verb, timeoutMs);
    }
    if (result.exitCode !== 0) {
        throw new NetbirdCliFailedError(verb, result.exitCode, result.stderr || result.stdout);
    }
};

export class NetbirdClient {
    // Tracks the current long-running operation (typically `up`). Exposed via
    // abort() so the UI can cancel a stuck SSO flow when the user closes the
    // browser or changes their mind.
    private _activeCancellable: Gio.Cancellable | null = null;

    abort(): void {
        if (this._activeCancellable && !this._activeCancellable.is_cancelled()) {
            this._activeCancellable.cancel();
        }
    }

    async status(opts: NetbirdOptions): Promise<NetbirdStatus> {
        const result = await runProcess(buildArgs(opts, CliVerbs.Status));
        assertProcessOk(CliVerbs.Status, result, TimeoutsMs.Default);
        return parseStatusText(result.stdout);
    }

    async up(opts: NetbirdOptions): Promise<void> {
        const cancellable = new Gio.Cancellable();
        this._activeCancellable = cancellable;
        let result: CommandResult;
        try {
            result = await runProcess(buildArgs(opts, CliVerbs.Up), {
                timeoutMs: TimeoutsMs.Up,
                cancellable,
            });
        } finally {
            if (this._activeCancellable === cancellable) {
                this._activeCancellable = null;
            }
        }

        if (result.spawnFailed) {
            throw new NetbirdCliNotFoundError(result.stderr);
        }
        if (result.timedOut) {
            throw new NetbirdTimeoutError(CliVerbs.Up, TimeoutsMs.Up);
        }

        // `netbird up` only requires SSO when the CLI explicitly says so in
        // its output. We must NOT treat "any URL in output" as login-required,
        // since successful runs also print URLs (management server, etc.),
        // which would cause false-positive browser launches on every connect.
        const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
        const needsLogin = LoginRequiredPhrases.some((phrase) => combined.includes(phrase));

        if (needsLogin) {
            const urlMatch = UrlRegex.exec(`${result.stdout}\n${result.stderr}`);
            if (urlMatch) {
                throw new NetbirdLoginRequiredError(urlMatch[0]);
            }
            // Login required but no URL to open — surface as a normal error.
            throw new NetbirdCliFailedError(
                CliVerbs.Up,
                result.exitCode,
                result.stderr || result.stdout,
            );
        }

        if (result.exitCode !== 0) {
            throw new NetbirdCliFailedError(
                CliVerbs.Up,
                result.exitCode,
                result.stderr || result.stdout,
            );
        }
    }

    async down(opts: NetbirdOptions): Promise<void> {
        const result = await runProcess(buildArgs(opts, CliVerbs.Down));
        assertProcessOk(CliVerbs.Down, result, TimeoutsMs.Default);
    }

    async version(opts: NetbirdOptions): Promise<NetbirdVersion> {
        const result = await runProcess(buildArgs(opts, CliVerbs.Version));
        assertProcessOk(CliVerbs.Version, result, TimeoutsMs.Default);
        return parseVersion(result.stdout || result.stderr);
    }

    async debugBundle(opts: NetbirdOptions): Promise<{ readonly rawOutput: string }> {
        // `netbird debug bundle` generates a support zip and prints its path.
        // We don't parse the path (netbird versions differ); callers just
        // show the raw output to the user so they can copy/paste it.
        const argv = [
            Binary,
            CliFlags.DaemonAddr,
            opts.daemonAddr,
            DebugSubcommand,
            DebugBundleAction,
        ];
        const result = await runProcess(argv, { timeoutMs: TimeoutsMs.DebugBundle });
        assertProcessOk(DebugBundleAction, result, TimeoutsMs.DebugBundle);
        return { rawOutput: (result.stdout || result.stderr).trim() };
    }
}
