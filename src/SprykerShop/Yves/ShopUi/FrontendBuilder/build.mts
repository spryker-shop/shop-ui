import { pathToFileURL } from 'node:url';
import { defaultGlobalSettings, getAppSettings, loadProjectGlobalSettings, resolveSourceLayout } from './settings.mts';
import type { AppSettings, GlobalSettings } from './settings.mts';
import { parseCliArguments } from './libs/command-line-parser.mts';
import { getFilteredNamespaceConfigList } from './libs/sass/namespace-config-parser.mts';
import { multiCompile } from './libs/webpack/compiler.mts';
import type { BuildConfiguration } from './libs/webpack/compiler.mts';

type ConfigurationFactory = (appSettings: AppSettings) => Promise<BuildConfiguration>;

const modeConfigMap: Record<string, () => Promise<{ default: ConfigurationFactory }>> = {
    development: () => import('./configs/development.mts'),
    'development-watch': () => import('./configs/development-watch.mts'),
    production: () => import('./configs/production.mts'),
};

/**
 * Runs the YVES builder with the provided global settings.
 * When called from project level, pass the result of defineConfig() as the argument
 * to extend or override the default builder settings.
 */
export const run = async (globalSettings: GlobalSettings = defaultGlobalSettings): Promise<void> => {
    const requestedArguments = parseCliArguments(globalSettings);

    // The layout decides where every component is looked up, so make the choice visible: a build
    // that finds no components is almost always a layout or working-directory problem.
    console.log(`Source layout: ${resolveSourceLayout(globalSettings.context).name}`);

    const configModule = modeConfigMap[requestedArguments.mode];

    if (!configModule) {
        console.error(`Unknown mode: "${requestedArguments.mode}"`);
        process.exit(1);
    }

    const { default: getConfiguration } = await configModule();
    const namespaceConfigList = getFilteredNamespaceConfigList(requestedArguments);
    const configurationPromises = getAppSettings(
        namespaceConfigList,
        requestedArguments.pathToConfig,
        globalSettings,
    ).map((appSettings) =>
        getConfiguration({
            ...appSettings,
            isInjectionDebuggingEnabled: requestedArguments.isInjectionDebuggingEnabled,
        }),
    );

    const configs = await Promise.all(configurationPromises).catch((error: unknown) => {
        console.error('An error occurred while creating configuration', error);
        process.exit(1);
    });

    multiCompile(configs);
};

// Allow direct CLI invocation: node build.mts <mode> [options]
// Also supports project-level override discovery at ./frontend/yves.settings.mts
const isDirectInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
    run(await loadProjectGlobalSettings());
}
