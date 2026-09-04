import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import CopyPlugin from 'copy-webpack-plugin';
import type { AppSettings } from '../../settings.mts';

export interface CopyPattern {
    from: string;
    to: string;
    context: string;
    globOptions?: { dot?: boolean; ignore?: string[] };
    noErrorOnMissing?: boolean;
    force?: boolean;
}

const resolveAgainstContext = (appSettings: AppSettings, assetsPath: string): string =>
    isAbsolute(assetsPath) ? assetsPath : resolve(appSettings.context, assetsPath);

export const getCopyConfig = (appSettings: AppSettings): CopyPattern[] =>
    Object.values(appSettings.paths.assets).reduce<CopyPattern[]>((copyConfig, assetsPath) => {
        if (existsSync(resolveAgainstContext(appSettings, assetsPath))) {
            copyConfig.push({
                from: assetsPath,
                to: '.',
                context: appSettings.context,
                globOptions: {
                    dot: true,
                    ignore: ['**/.gitkeep'],
                },
                noErrorOnMissing: true,
                force: true,
            });
        }

        return copyConfig;
    }, []);

const getCopyStaticConfig = (appSettings: AppSettings): CopyPattern[] => {
    const staticAssetsPath = appSettings.paths.assets.staticAssets;

    if (!existsSync(resolveAgainstContext(appSettings, staticAssetsPath))) {
        return [];
    }

    return [
        {
            from: staticAssetsPath,
            to: appSettings.paths.publicStatic,
            context: appSettings.context,
        },
    ];
};

export const getAssetsConfig = (appSettings: AppSettings): CopyPlugin[] => [
    new CopyPlugin({
        patterns: getCopyConfig(appSettings),
    }),

    new CopyPlugin({
        patterns: getCopyStaticConfig(appSettings),
    }),
];
