import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import type { Compiler, Stats, WebpackPluginInstance } from 'webpack';
import type { FSWatcher } from 'chokidar';
import { CustomizeRule, customizeArray, merge, mergeWithCustomize } from 'webpack-merge';
import getConfiguration from './development.mts';
import {
    MANIFEST_FILENAME,
    createManifestWriterPlugin,
    createTwigVersionHolder,
} from '../libs/reload/manifest-writer.mts';
import { createTwigWatcher, resolveThemeWatchDirectories } from '../libs/reload/twig-watcher.mts';
import type { TwigVersionHolder } from '../libs/reload/manifest-writer.mts';
import type { AppSettings } from '../settings.mts';
import type { BuildConfiguration } from '../libs/webpack/compiler.mts';

// The client must be the FIRST element of `entry.app` (plan: "prepend") so its polling loop is set
// up before component modules run. Default `merge` only appends arrays, so this customized merge
// prepends for `webpack.entry.app` specifically; every other array (notably `webpack.plugins`) falls
// through to the default append, which is why the base plugins and the two reload plugins coexist.
const mergeWithPrependedAppEntry = mergeWithCustomize<BuildConfiguration>({
    customizeArray: customizeArray({
        'webpack.entry.app': CustomizeRule.Prepend,
    }),
});

interface TwigWatcherStartOptions {
    watchedDirectories: string[];
    twigVersionHolder: TwigVersionHolder;
    rewriteManifest: () => void;
}

/**
 * Webpack plugin that starts the Twig watcher exactly once, after the first successful compilation
 * (skipping a failed build, consistent with the manifest writer). The watcher is a watch-mode-only
 * concern with no place in the one-shot `development`/`production` configs, so it is wired here as an
 * inline plugin rather than in `build.mts` — and only inside the kill-switch-off branch below.
 */
const createTwigWatcherStartPlugin = ({
    watchedDirectories,
    twigVersionHolder,
    rewriteManifest,
}: TwigWatcherStartOptions): WebpackPluginInstance => {
    let watcher: FSWatcher | undefined;

    return {
        apply(compiler: Compiler): void {
            compiler.hooks.done.tap('YvesDevReloadTwigWatcherStart', (stats: Stats): void => {
                if (watcher !== undefined || stats.hasErrors()) {
                    return;
                }

                watcher = createTwigWatcher({ watchedDirectories, twigVersionHolder, rewriteManifest });

                const closeWatcher = (): void => {
                    void watcher?.close();
                };

                // Release the file handles on the usual termination paths so a Ctrl-C leaves no
                // dangling watcher. `once` avoids stacking duplicate listeners across signals.
                process.once('SIGINT', closeWatcher);
                process.once('SIGTERM', closeWatcher);
                process.once('exit', closeWatcher);
            });
        },
    };
};

const configurationWatchMode = async (appSettings: AppSettings): Promise<BuildConfiguration> => {
    const baseConfiguration = await getConfiguration(appSettings);

    // Kill switch (plan constraint 3): SPRYKER_FRONTEND_RELOAD=0 restores exactly today's watch
    // behavior — no manifest plugin, no client entry, no reload constants — with no new settings key.
    const isReloadDisabled = process.env.SPRYKER_FRONTEND_RELOAD === '0';

    if (isReloadDisabled) {
        const watchOnlyOverride: Partial<BuildConfiguration> = { webpack: { watch: true } };

        // webpack-merge's single-type-parameter signature cannot express "partial override into a full
        // config"; the override is a deliberately partial BuildConfiguration merged into a complete one.
        return merge(baseConfiguration, watchOnlyOverride as BuildConfiguration);
    }

    // The manifest is written into the webpack output directory, which is identical to
    // `output.path` in development.mts (served at `/{urls.assets}/dev-build-manifest.json`).
    const outputDirectory = join(appSettings.context, appSettings.paths.public);
    const twigVersionHolder = createTwigVersionHolder();
    const { plugin: manifestWriterPlugin, rewriteManifest } = createManifestWriterPlugin({
        outputDirectory,
        twigVersionHolder,
    });

    // The Twig watcher scans the same source directories as the component finder. Resolve the dir
    // globs here (async config-build context) so the watcher itself receives concrete absolute dirs.
    const watchedDirectories = await resolveThemeWatchDirectories(appSettings.find.componentEntryPoints.dirs);
    const twigWatcherStartPlugin = createTwigWatcherStartPlugin({
        watchedDirectories,
        twigVersionHolder,
        rewriteManifest,
    });

    // The served manifest URL mirrors development.mts's `publicPath` (`/{urls.assets}/`) plus the
    // manifest filename. The client reads it from this exact location — no runtime discovery, no new
    // network channel (plan constraint 2).
    const reloadManifestUrl = `/${appSettings.urls.assets}/${MANIFEST_FILENAME}`;
    const reloadDefinePlugin = new webpack.DefinePlugin({
        __RELOAD_MANIFEST_URL__: JSON.stringify(reloadManifestUrl),
    });

    // Absolute path to the browser client (component TypeScript, compiled by the babel-loader rule in
    // development.mts). Resolved from this config's URL so it works regardless of the working directory.
    const reloadClientPath = fileURLToPath(new URL('../libs/reload/client/reload-client.ts', import.meta.url));

    const watchOverride: Partial<BuildConfiguration> = {
        webpack: {
            watch: true,
            entry: {
                app: [reloadClientPath],
            },
            plugins: [manifestWriterPlugin, reloadDefinePlugin, twigWatcherStartPlugin],
        },
    };

    return mergeWithPrependedAppEntry(baseConfiguration, watchOverride as BuildConfiguration);
};

export default configurationWatchMode;
