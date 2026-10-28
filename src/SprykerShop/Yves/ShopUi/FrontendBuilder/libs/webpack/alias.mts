import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AppSettings } from '../../settings.mts';

// A list of targets is tried in order and the first that resolves wins, as in the tsconfig `paths` it mirrors.
export type AliasList = Record<string, string | string[]>;

// Reads the path aliases from the tsconfig file and transforms them into webpack aliases,
// keeping alias definitions in a single place. The wildcard `*` mapping is skipped because
// aliasing `*` to `*` would create a self-referential resolution loop in webpack.
export const getAliasList = (appSettings: AppSettings): AliasList => {
    const tsConfigFile = join(appSettings.context, appSettings.paths.tsConfig);
    // tsconfig.yves.json is a third-party-shaped JSON file; its parsed form is untyped here and
    // only `compilerOptions.paths` (a name → path-list map) is consumed.
    const tsConfig: { compilerOptions: { paths: Record<string, string[]> } } = JSON.parse(
        readFileSync(tsConfigFile, 'utf8'),
    );
    const aliases = tsConfig.compilerOptions.paths;

    return Object.keys(aliases).reduce<AliasList>((map, name) => {
        if (name !== '*' && aliases[name].length) {
            const alias = name.replace(/(\/\*?)$/, '');
            // The generated configuration lives beside the builder, and its paths are relative to
            // itself, so they resolve against its directory and not against the project root.
            const aliasTargets = aliases[name].map((aliasPath) =>
                resolve(dirname(tsConfigFile), aliasPath.replace(/(\/\*?)$/, '')),
            );
            map[alias] = aliasTargets.length === 1 ? aliasTargets[0] : aliasTargets;
        }

        return map;
    }, {});
};
