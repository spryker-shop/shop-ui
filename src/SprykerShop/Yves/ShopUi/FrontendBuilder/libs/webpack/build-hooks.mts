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
 *
 * Each value may be a single path or an array of paths; falsy values are ignored.
 */

import type { AppSettings } from '../../settings.mts';

export interface EntryContributions {
    critical: string[];
    app: string[];
    nonCritical: string[];
}

// A hook may contribute a single path or a list of paths to any of the three entries.
interface BuildHookResult {
    critical?: string | string[];
    app?: string | string[];
    nonCritical?: string | string[];
}

export interface BuildHook {
    name?: string;
    run?: (appSettings: AppSettings) => BuildHookResult | void | Promise<BuildHookResult | void>;
}

// Literal-narrowing idiom: `as const` keeps the tuple readonly so `key` below is typed
// as the union of entry names instead of string.
const ENTRY_KEYS = ['critical', 'app', 'nonCritical'] as const;

const toArray = (value: string | string[] | undefined): string[] => {
    if (!value) {
        return [];
    }

    return Array.isArray(value) ? value.filter(Boolean) : [value];
};

const createEmptyContributions = (): EntryContributions => ({ critical: [], app: [], nonCritical: [] });

/**
 * Runs all registered build hooks for the given appSettings and merges their entry contributions.
 *
 * Hooks run sequentially so a hook may depend on files an earlier hook produced. A hook that throws
 * is logged and skipped — it must not abort the whole build.
 *
 */
export const runBuildHooks = async (appSettings: AppSettings): Promise<EntryContributions> => {
    const contributions = createEmptyContributions();
    const hooks = appSettings.buildHooks ?? [];

    for (const hook of hooks) {
        if (typeof hook?.run !== 'function') {
            console.warn(
                `Skipping invalid build hook "${hook?.name ?? 'unknown'}" registered in the buildHooks ` +
                    `array of your builder settings (frontend/yves.settings.mts or the packaged settings.mts): ` +
                    `it has no run() function. Give the hook a run(appSettings) function or remove it.`,
            );
            continue;
        }

        try {
            const result: BuildHookResult = (await hook.run(appSettings)) ?? {};

            ENTRY_KEYS.forEach((key) => {
                contributions[key].push(...toArray(result[key]));
            });
        } catch (error) {
            console.error(
                `Build hook "${hook.name ?? 'unknown'}" (registered in the buildHooks array of your builder ` +
                    `settings, frontend/yves.settings.mts or the packaged settings.mts) threw and was skipped — ` +
                    `its entry contributions are missing from this build. Fix or remove the hook:`,
                error,
            );
        }
    }

    return contributions;
};
