import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AppSettings } from '../../settings.mts';

// Reads the path aliases from the tsconfig file and transforms them into webpack aliases,
// keeping alias definitions in a single place. The wildcard `*` mapping is skipped because
// aliasing `*` to `*` would create a self-referential resolution loop in webpack.
export const getAliasList = (appSettings: AppSettings): Record<string, string> => {
    const tsConfigFile = join(appSettings.context, appSettings.paths.tsConfig);
    // tsconfig.yves.json is a third-party-shaped JSON file; its parsed form is untyped here and
    // only `compilerOptions.paths` (a name → path-list map) is consumed.
    const tsConfig: { compilerOptions: { paths: Record<string, string[]> } } = JSON.parse(
        readFileSync(tsConfigFile, 'utf8'),
    );
    const aliases = tsConfig.compilerOptions.paths;

    return Object.keys(aliases).reduce<Record<string, string>>((map, name) => {
        if (name !== '*' && aliases[name].length) {
            const alias = name.replace(/(\/\*?)$/, '');
            const aliasPath = aliases[name][0].replace(/(\/\*?)$/, '');
            map[alias] = join(appSettings.context, aliasPath);
        }

        return map;
    }, {});
};
