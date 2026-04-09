import { Binary, CliFlags, CliVerbs } from "./constants.js";

type CliVerb = (typeof CliVerbs)[keyof typeof CliVerbs];

export type NetbirdOptions = {
    readonly url: string;
    readonly daemonAddr: string;
    // Optional flags applied only to `netbird up`. Default off.
    readonly allowServerSsh?: boolean;
    readonly enableRosenpass?: boolean;
    readonly enableLazyConnection?: boolean;
    readonly blockInbound?: boolean;
};

// Pure helper — assembles the `netbird <verb>` argv. Only `up` accepts
// --management-url / --admin-url; `status` and `down` only take --daemon-addr;
// `version` is purely local and takes no flags. Passing unknown flags to the
// wrong verb makes the CLI error out. No I/O. Exported for unit testing.
export const buildArgs = (opts: NetbirdOptions, verb: CliVerb): readonly string[] => {
    if (verb === CliVerbs.Version) {
        return [Binary, verb];
    }
    const base = [Binary, CliFlags.DaemonAddr, opts.daemonAddr];
    if (verb === CliVerbs.Up) {
        const argv: string[] = [
            ...base,
            verb,
            CliFlags.ManagementUrl,
            opts.url,
            CliFlags.AdminUrl,
            opts.url,
        ];
        if (opts.allowServerSsh) argv.push(CliFlags.AllowServerSsh);
        if (opts.enableRosenpass) argv.push(CliFlags.EnableRosenpass);
        if (opts.enableLazyConnection) argv.push(CliFlags.EnableLazyConnection);
        if (opts.blockInbound) argv.push(CliFlags.BlockInbound);
        return argv;
    }
    return [...base, verb];
};
