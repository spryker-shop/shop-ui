import { readFileSync } from 'node:fs';
import type { CliArguments } from '../command-line-parser.mts';

export interface NamespaceConfig {
    namespace: string;
    defaultTheme: string;
    themes: string[];
    codeBucket: string;
}

interface NamespaceConfigFile {
    path: string;
    staticPath: string;
    namespaces: NamespaceConfig[];
}

const loadNamespaceJson = (pathToConfig: string): NamespaceConfigFile => JSON.parse(readFileSync(pathToConfig, 'utf8'));

const getNamespaceMap = (pathToConfig: string): Map<string, NamespaceConfig> => {
    const namespaceJson = loadNamespaceJson(pathToConfig);
    const namespaceMap = new Map<string, NamespaceConfig>();

    namespaceJson.namespaces.forEach((item) => {
        namespaceMap.set(item.namespace, item);
    });

    return namespaceMap;
};

const printWrongNamespaceMessage = (namespace: string): void => {
    console.error(`Namespace "${namespace}" does not exist.`);
    process.exit(1);
};

export const printAvailableNamespacesAndThemes = (pathToConfig: string): void => {
    const namespaceJson = loadNamespaceJson(pathToConfig);

    console.log('Namespaces with available themes:');
    namespaceJson.namespaces.forEach((namespaceConfig) => {
        console.log(`- ${namespaceConfig.namespace}`);
        console.log(`  ${namespaceConfig.defaultTheme}`);

        if (namespaceConfig.themes.length) {
            namespaceConfig.themes.forEach((theme) => console.log(`  ${theme}`));
        }
    });
    console.log('');
    process.exit();
};

export const getFilteredNamespaceConfigList = (requestedArguments: CliArguments): NamespaceConfig[] => {
    const namespaceMap = getNamespaceMap(requestedArguments.pathToConfig);

    if (!requestedArguments.namespaces.length) {
        requestedArguments.namespaces = Array.from(namespaceMap.keys());
    }

    requestedArguments.namespaces
        .filter((requestedNamespace) => !namespaceMap.has(requestedNamespace))
        .map(printWrongNamespaceMessage);

    const generateNamespaceConfig = (requestedNamespace: string): NamespaceConfig => {
        // Non-null: this callback only runs for namespaces the surrounding filter has
        // already confirmed to exist in the map.
        const namespaceConfig: NamespaceConfig = Object.assign(namespaceMap.get(requestedNamespace)!);
        namespaceConfig.themes.push(namespaceConfig.defaultTheme);

        if (!requestedArguments.themes.length) {
            return namespaceConfig;
        }

        requestedArguments.themes.map((theme) => {
            if (!namespaceConfig.themes.includes(theme)) {
                console.warn(`Theme "${theme}" does not exist in "${requestedNamespace}" namespace.`);
            }
        });

        namespaceConfig.themes = namespaceConfig.themes.filter((namespaceTheme) =>
            requestedArguments.themes.includes(namespaceTheme),
        );

        return namespaceConfig;
    };

    return requestedArguments.namespaces
        .filter((requestedNamespace) => namespaceMap.has(requestedNamespace))
        .map((requestedNamespace) => generateNamespaceConfig(requestedNamespace));
};
