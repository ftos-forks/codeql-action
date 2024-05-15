"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapCliConfigurationError = exports.getCliConfigCategoryIfExists = exports.cliErrorsConfig = exports.CliConfigErrorCategory = exports.CommandInvocationError = void 0;
const util_1 = require("./util");
/**
 * A class of Error that we can classify as an error stemming from a CLI
 * invocation, with associated exit code, stderr,etc.
 */
class CommandInvocationError extends Error {
    constructor(cmd, args, exitCode, stderr, stdout) {
        const prettyCommand = [cmd, ...args]
            .map((x) => (x.includes(" ") ? `'${x}'` : x))
            .join(" ");
        const fatalErrors = extractFatalErrors(stderr);
        const autobuildErrors = extractAutobuildErrors(stderr);
        let message;
        if (fatalErrors) {
            message =
                `Encountered a fatal error while running "${prettyCommand}". ` +
                    `Exit code was ${exitCode} and error was: ${fatalErrors.trim()} See the logs for more details.`;
        }
        else if (autobuildErrors) {
            const autobuildHelpLink = "https://docs.github.com/en/code-security/code-scanning/troubleshooting-code-scanning/automatic-build-failed";
            message =
                "We were unable to automatically build your code. Please provide manual build steps. " +
                    `For more information, see ${autobuildHelpLink}. ` +
                    `Encountered the following error: ${autobuildErrors}`;
        }
        else {
            let lastLine = stderr.trim().split("\n").pop()?.trim() || "";
            if (lastLine[lastLine.length - 1] !== ".") {
                lastLine += ".";
            }
            message =
                `Encountered a fatal error while running "${prettyCommand}". ` +
                    `Exit code was ${exitCode} and last log line was: ${lastLine} See the logs for more details.`;
        }
        super(message);
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.stdout = stdout;
    }
}
exports.CommandInvocationError = CommandInvocationError;
/**
 * Provide a better error message from the stderr of a CLI invocation that failed with a fatal
 * error.
 *
 * - If the CLI invocation failed with a fatal error, this returns that fatal error, followed by
 *   any fatal errors that occurred in plumbing commands.
 * - If the CLI invocation did not fail with a fatal error, this returns `undefined`.
 *
 * ### Example
 *
 * ```
 * Running TRAP import for CodeQL database at /home/runner/work/_temp/codeql_databases/javascript...
 * A fatal error occurred: Evaluator heap must be at least 384.00 MiB
 * A fatal error occurred: Dataset import for
 * /home/runner/work/_temp/codeql_databases/javascript/db-javascript failed with code 2
 * ```
 *
 * becomes
 *
 * ```
 * Encountered a fatal error while running "codeql-for-testing database finalize --finalize-dataset
 * --threads=2 --ram=2048 db". Exit code was 32 and error was: A fatal error occurred: Dataset
 * import for /home/runner/work/_temp/codeql_databases/javascript/db-javascript failed with code 2.
 * Context: A fatal error occurred: Evaluator heap must be at least 384.00 MiB.
 * ```
 *
 * Where possible, this tries to summarize the error into a single line, as this displays better in
 * the Actions UI.
 */
function extractFatalErrors(error) {
    const fatalErrorRegex = /.*fatal error occurred:/gi;
    let fatalErrors = [];
    let lastFatalErrorIndex;
    let match;
    while ((match = fatalErrorRegex.exec(error)) !== null) {
        if (lastFatalErrorIndex !== undefined) {
            fatalErrors.push(error.slice(lastFatalErrorIndex, match.index).trim());
        }
        lastFatalErrorIndex = match.index;
    }
    if (lastFatalErrorIndex !== undefined) {
        const lastError = error.slice(lastFatalErrorIndex).trim();
        if (fatalErrors.length === 0) {
            // No other errors
            return lastError;
        }
        const isOneLiner = !fatalErrors.some((e) => e.includes("\n"));
        if (isOneLiner) {
            fatalErrors = fatalErrors.map(ensureEndsInPeriod);
        }
        return [
            ensureEndsInPeriod(lastError),
            "Context:",
            ...fatalErrors.reverse(),
        ].join(isOneLiner ? " " : "\n");
    }
    return undefined;
}
function extractAutobuildErrors(error) {
    const pattern = /.*\[autobuild\] \[ERROR\] (.*)/gi;
    let errorLines = [...error.matchAll(pattern)].map((match) => match[1]);
    // Truncate if there are more than 10 matching lines.
    if (errorLines.length > 10) {
        errorLines = errorLines.slice(0, 10);
        errorLines.push("(truncated)");
    }
    return errorLines.join("\n") || undefined;
}
function ensureEndsInPeriod(text) {
    return text[text.length - 1] === "." ? text : `${text}.`;
}
/** Error messages from the CLI that we consider configuration errors and handle specially. */
var CliConfigErrorCategory;
(function (CliConfigErrorCategory) {
    CliConfigErrorCategory["ExternalRepositoryCloneFailed"] = "ExternalRepositoryCloneFailed";
    CliConfigErrorCategory["GradleBuildFailed"] = "GradleBuildFailed";
    CliConfigErrorCategory["IncompatibleWithActionVersion"] = "IncompatibleWithActionVersion";
    CliConfigErrorCategory["InitCalledTwice"] = "InitCalledTwice";
    CliConfigErrorCategory["InvalidConfigFile"] = "InvalidConfigFile";
    CliConfigErrorCategory["InvalidSourceRoot"] = "InvalidSourceRoot";
    CliConfigErrorCategory["MavenBuildFailed"] = "MavenBuildFailed";
    CliConfigErrorCategory["NoBuildCommandAutodetected"] = "NoBuildCommandAutodetected";
    CliConfigErrorCategory["NoBuildMethodAutodetected"] = "NoBuildMethodAutodetected";
    CliConfigErrorCategory["NoSourceCodeSeen"] = "NoSourceCodeSeen";
    CliConfigErrorCategory["NoSupportedBuildCommandSucceeded"] = "NoSupportedBuildCommandSucceeded";
    CliConfigErrorCategory["NoSupportedBuildSystemDetected"] = "NoSupportedBuildSystemDetected";
    CliConfigErrorCategory["OutOfMemoryOrDisk"] = "OutOfMemoryOrDisk";
    CliConfigErrorCategory["PackCannotBeFound"] = "PackCannotBeFound";
    CliConfigErrorCategory["SwiftBuildFailed"] = "SwiftBuildFailed";
    CliConfigErrorCategory["UnsupportedBuildMode"] = "UnsupportedBuildMode";
})(CliConfigErrorCategory || (exports.CliConfigErrorCategory = CliConfigErrorCategory = {}));
/**
 * All of our caught CLI error messages that we handle specially: ie. if we
 * would like to categorize an error as a configuration error or not.
 */
exports.cliErrorsConfig = {
    [CliConfigErrorCategory.ExternalRepositoryCloneFailed]: {
        cliErrorMessageCandidates: [
            new RegExp("Failed to clone external Git repository"),
        ],
    },
    [CliConfigErrorCategory.GradleBuildFailed]: {
        cliErrorMessageCandidates: [
            new RegExp("[autobuild] FAILURE: Build failed with an exception."),
        ],
    },
    // Version of CodeQL CLI is incompatible with this version of the CodeQL Action
    [CliConfigErrorCategory.IncompatibleWithActionVersion]: {
        cliErrorMessageCandidates: [
            new RegExp("is not compatible with this CodeQL CLI"),
        ],
    },
    [CliConfigErrorCategory.InitCalledTwice]: {
        cliErrorMessageCandidates: [
            new RegExp("Refusing to create databases .* but could not process any of it"),
        ],
        additionalErrorMessageToAppend: `Is the "init" action called twice in the same job?`,
    },
    [CliConfigErrorCategory.InvalidConfigFile]: {
        cliErrorMessageCandidates: [
            new RegExp("Config file .* is not valid"),
            new RegExp("The supplied config file is empty"),
        ],
    },
    // Expected source location for database creation does not exist
    [CliConfigErrorCategory.InvalidSourceRoot]: {
        cliErrorMessageCandidates: [new RegExp("Invalid source root")],
    },
    [CliConfigErrorCategory.MavenBuildFailed]: {
        cliErrorMessageCandidates: [
            new RegExp("\\[autobuild\\] \\[ERROR\\] Failed to execute goal"),
        ],
    },
    [CliConfigErrorCategory.NoBuildCommandAutodetected]: {
        cliErrorMessageCandidates: [
            new RegExp("Could not auto-detect a suitable build method"),
        ],
    },
    [CliConfigErrorCategory.NoBuildMethodAutodetected]: {
        cliErrorMessageCandidates: [
            new RegExp("Could not detect a suitable build command for the source checkout"),
        ],
    },
    // Usually when a manual build script has failed, or if an autodetected language
    // was unintended to have CodeQL analysis run on it.
    [CliConfigErrorCategory.NoSourceCodeSeen]: {
        exitCode: 32,
        cliErrorMessageCandidates: [
            new RegExp("CodeQL detected code written in .* but could not process any of it"),
            new RegExp("CodeQL did not detect any code written in languages supported by CodeQL"),
        ],
    },
    [CliConfigErrorCategory.NoSupportedBuildCommandSucceeded]: {
        cliErrorMessageCandidates: [
            new RegExp("No supported build command succeeded"),
        ],
    },
    [CliConfigErrorCategory.NoSupportedBuildSystemDetected]: {
        cliErrorMessageCandidates: [
            new RegExp("No supported build system detected"),
        ],
    },
    [CliConfigErrorCategory.OutOfMemoryOrDisk]: {
        cliErrorMessageCandidates: [
            new RegExp("CodeQL is out of memory."),
            new RegExp("out of disk"),
            new RegExp("No space left on device"),
        ],
        additionalErrorMessageToAppend: "For more information, see https://gh.io/troubleshooting-code-scanning/out-of-disk-or-memory",
    },
    [CliConfigErrorCategory.PackCannotBeFound]: {
        cliErrorMessageCandidates: [
            new RegExp("Query pack .* cannot be found\\. Check the spelling of the pack\\."),
        ],
    },
    [CliConfigErrorCategory.SwiftBuildFailed]: {
        cliErrorMessageCandidates: [
            new RegExp("\\[autobuilder/build\\] \\[build-command-failed\\] `autobuild` failed to run the build command"),
        ],
    },
    [CliConfigErrorCategory.UnsupportedBuildMode]: {
        cliErrorMessageCandidates: [
            new RegExp("does not support the .* build mode. Please try using one of the following build modes instead"),
        ],
    },
};
/**
 * Check if the given CLI error or exit code, if applicable, apply to any known
 * CLI errors in the configuration record. If either the CLI error message matches one of
 * the error messages in the config record, or the exit codes match, return the error category;
 * if not, return undefined.
 */
function getCliConfigCategoryIfExists(cliError) {
    for (const [category, configuration] of Object.entries(exports.cliErrorsConfig)) {
        if (cliError.exitCode !== undefined &&
            configuration.exitCode !== undefined &&
            cliError.exitCode === configuration.exitCode) {
            return category;
        }
        for (const e of configuration.cliErrorMessageCandidates) {
            if (cliError.message.match(e) || cliError.stderr.match(e)) {
                return category;
            }
        }
    }
    return undefined;
}
exports.getCliConfigCategoryIfExists = getCliConfigCategoryIfExists;
/**
 * Changes an error received from the CLI to a ConfigurationError with optionally an extra
 * error message appended, if it exists in a known set of configuration errors. Otherwise,
 * simply returns the original error.
 */
function wrapCliConfigurationError(cliError) {
    if (!(cliError instanceof CommandInvocationError)) {
        return cliError;
    }
    const cliConfigErrorCategory = getCliConfigCategoryIfExists(cliError);
    if (cliConfigErrorCategory === undefined) {
        return cliError;
    }
    let errorMessageBuilder = cliError.message;
    const additionalErrorMessageToAppend = exports.cliErrorsConfig[cliConfigErrorCategory].additionalErrorMessageToAppend;
    if (additionalErrorMessageToAppend !== undefined) {
        errorMessageBuilder = `${errorMessageBuilder} ${additionalErrorMessageToAppend}`;
    }
    return new util_1.ConfigurationError(errorMessageBuilder);
}
exports.wrapCliConfigurationError = wrapCliConfigurationError;
//# sourceMappingURL=cli-errors.js.map