/**
 * Build-hook runner.
 *
 * Projects extend the shared builder with their own pre-build steps by registering hooks via
 * `defineConfig({ buildHooks: [...] })`. The builder itself ships none — built-in pre-build
 * steps (design tokens, icon sprites) are wired directly in the configs.
 *
 * A build hook is a plain object:
 *
 *   export default {
 *       name: 'my-pre-build-step',             // used only for logging
 *       async run(appSettings) {               // runs once per namespace × theme, before webpack assembly
 *           const cssPath = await build(appSettings);
 *           return { critical: [cssPath] };    // entry contributions (all keys optional)
 *       },
 *   };
 *
 * `run` may return nothing (pure side effect) or an object with any of these entry contributions:
 *   - `critical`    — prepended to the `critical` webpack entry (above-the-fold assets)
 *   - `app`         — appended to the `app` webpack entry
 *   - `nonCritical` — prepended to the `non-critical` webpack entry
 *   - `entries`     — additional named webpack entries, `{ print: '/abs/print.scss' }`; each one is
 *                     emitted as its own `yves_default.<name>.css` / `.js` next to the builder's bundles
 *
 * Each value may be a single path or an array of paths; falsy values are ignored. A named entry
 * cannot reuse one of the builder's entry names (vendor, app, critical, non-critical, util).
 */

import type { AppSettings } from '../../settings.mts';
import { BUILDER_ENTRY_NAMES } from './entry-points.mts';

export interface EntryContributions {
    critical: string[];
    app: string[];
    nonCritical: string[];
    entries: Record<string, string[]>;
}

// A hook may contribute a single path or a list of paths to any of the three entries, and to
// named entries of its own.
interface BuildHookResult {
    critical?: string | string[];
    app?: string | string[];
    nonCritical?: string | string[];
    entries?: Record<string, string | string[]>;
}

export interface BuildHook {
    name?: string;
    run?: (appSettings: AppSettings) => BuildHookResult | void | Promise<BuildHookResult | void>;
}

// Literal-narrowing idiom: `as const` keeps the tuple readonly so `key` below is typed
// as the union of entry names instead of string.
const ENTRY_KEYS = ['critical', 'app', 'nonCritical'] as const;

// The name becomes part of the emitted asset file name, `yves_default.<name>.css`.
const ENTRY_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

const HOOK_REGISTRATION_LOCATION =
    'the buildHooks array of your builder settings (frontend/yves.settings.mts or the packaged settings.mts)';

const assertNamedEntryIsAllowed = (hookName: string, entryName: string): void => {
    if ((BUILDER_ENTRY_NAMES as readonly string[]).includes(entryName)) {
        throw new Error(
            `Build hook "${hookName}" (registered in ${HOOK_REGISTRATION_LOCATION}) contributes a named entry ` +
                `"${entryName}", which is reserved for the builder's own bundles (${BUILDER_ENTRY_NAMES.join(', ')}). ` +
                `Contribute to those through the critical, app or nonCritical keys of the hook result, or pick ` +
                `another name.`,
        );
    }

    if (!ENTRY_NAME_PATTERN.test(entryName)) {
        throw new Error(
            `Build hook "${hookName}" (registered in ${HOOK_REGISTRATION_LOCATION}) contributes a named entry ` +
                `"${entryName}", which cannot be used as an asset file name. Use letters, digits, "-" and "_" ` +
                `only, starting with a letter or digit.`,
        );
    }
};

const toArray = (value: string | string[] | undefined): string[] => {
    if (!value) {
        return [];
    }

    return Array.isArray(value) ? value.filter(Boolean) : [value];
};

const createEmptyContributions = (): EntryContributions => ({ critical: [], app: [], nonCritical: [], entries: {} });

/**
 * Runs all registered build hooks for the given appSettings and merges their entry contributions.
 *
 * Hooks run sequentially so a hook may depend on files an earlier hook produced. A hook that throws
 * is logged and skipped — it must not abort the whole build. A hook result that misuses a named
 * entry is a settings error and does abort it: merging it would silently produce the wrong bundles.
 */
export const runBuildHooks = async (appSettings: AppSettings): Promise<EntryContributions> => {
    const contributions = createEmptyContributions();
    const hooks = appSettings.buildHooks ?? [];

    for (const hook of hooks) {
        const hookName = hook?.name ?? 'unknown';

        if (typeof hook?.run !== 'function') {
            console.warn(
                `Skipping invalid build hook "${hookName}" registered in ${HOOK_REGISTRATION_LOCATION}: ` +
                    `it has no run() function. Give the hook a run(appSettings) function or remove it.`,
            );
            continue;
        }

        let result: BuildHookResult;

        try {
            result = (await hook.run(appSettings)) ?? {};
        } catch (error) {
            console.error(
                `Build hook "${hookName}" (registered in ${HOOK_REGISTRATION_LOCATION}) threw and was skipped — ` +
                    `its entry contributions are missing from this build. Fix or remove the hook:`,
                error,
            );
            continue;
        }

        ENTRY_KEYS.forEach((key) => {
            contributions[key].push(...toArray(result[key]));
        });

        Object.entries(result.entries ?? {}).forEach(([entryName, files]) => {
            assertNamedEntryIsAllowed(hookName, entryName);
            contributions.entries[entryName] = [...(contributions.entries[entryName] ?? []), ...toArray(files)];
        });
    }

    return contributions;
};
