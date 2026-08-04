import { join } from 'node:path';
import { printAvailableNamespacesAndThemes } from './sass/namespace-config-parser.mts';
import type { GlobalSettings } from '../settings.mts';

export interface CliArguments {
    mode: string;
    namespaces: string[];
    themes: string[];
    pathToConfig: string;
    isInjectionDebuggingEnabled: boolean;
}

const USAGE = `
Usage: node build.mts <mode> [options]

Modes:
  development          Build in development mode
  development-watch    Build and watch for changes
  production           Build in production mode

Options:
  -n, --namespace <name>  Build only the specified namespace (repeatable)
  -t, --theme <name>      Build only the specified theme (repeatable)
  -c, --config <path>     Path to the namespace config JSON file
  -i, --info              List available namespaces and themes, then exit
  --debug-injection       Print per-file injected Sass banners and mixin index resolution reasons
  -h, --help              Show this help message
`.trim();

const validateMode = (requestedMode: string, modes: GlobalSettings['modes']): void => {
    const isValidMode = Object.values(modes).includes(requestedMode);

    if (!isValidMode) {
        console.error(`Error: Unknown mode "${requestedMode}". Available modes: ${Object.values(modes).join(', ')}`);
        console.error(USAGE);
        process.exit(1);
    }
};

export const parseCliArguments = (globalSettings: GlobalSettings): CliArguments => {
    const { modes, paths } = globalSettings;
    const args = process.argv.slice(2);

    if (args.includes('-h') || args.includes('--help')) {
        console.log(USAGE);
        process.exit(0);
    }

    const namespaces: string[] = [];
    const themes: string[] = [];
    let mode: string | null = null;
    let configPath = paths.namespaceConfig;
    let showInfo = false;
    let isInjectionDebuggingEnabled = false;

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (arg === '-n' || arg === '--namespace') {
            namespaces.push(args[++index]);
            continue;
        }

        if (arg === '-t' || arg === '--theme') {
            themes.push(args[++index]);
            continue;
        }

        if (arg === '-c' || arg === '--config') {
            configPath = args[++index];
            continue;
        }

        if (arg === '-i' || arg === '--info') {
            showInfo = true;
            continue;
        }

        if (arg === '--debug-injection') {
            isInjectionDebuggingEnabled = true;
            continue;
        }

        if (!arg.startsWith('-') && mode === null) {
            mode = arg;
        }
    }

    if (!mode) {
        console.error('Error: Build mode is required.');
        console.error(USAGE);
        process.exit(1);
    }

    validateMode(mode, modes);

    const pathToConfig = join(globalSettings.context, configPath);

    if (showInfo) {
        printAvailableNamespacesAndThemes(pathToConfig);
    }

    return {
        mode,
        namespaces,
        themes,
        pathToConfig,
        isInjectionDebuggingEnabled,
    };
};
