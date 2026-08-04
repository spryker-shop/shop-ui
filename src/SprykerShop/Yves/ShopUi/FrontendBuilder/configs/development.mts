import { createHash } from 'node:crypto';
import { join } from 'node:path';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import filePathFilterModule from '@jsdevtools/file-path-filter';
import autoprefixer from 'autoprefixer';
import * as sassEmbedded from 'sass-embedded';
import { findComponentEntryPoints, findComponentStyles, findAppEntryPoint } from '../libs/webpack/finder.mts';
import { getAliasList } from '../libs/webpack/alias.mts';
import { getAssetsConfig } from '../libs/webpack/assets-configurator.mts';
import { cleanDirs } from '../libs/webpack/clean-dirs.mts';
import { extractIconSprites } from '../libs/webpack/icon-sprite-extractor.mts';
import { runBuildHooks } from '../libs/webpack/build-hooks.mts';
import { buildDesignTokensCss } from '../libs/webpack/design-tokens.mts';
import { buildLegacyOrphanStyleNotice, findLegacyOrphanStyles } from '../libs/webpack/legacy-style-rescue.mts';
import {
    createErrorTranslatingSassImplementation,
    createSassInjectionImporterFactory,
    isInjectableComponentPath,
    isInjectableStyleRootPath,
} from '../libs/sass/sass-injection-importer.mts';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import type { AppSettings } from '../settings.mts';
import type { BuildConfiguration } from '../libs/webpack/compiler.mts';

// The package ships a CJS default export that is the filter factory, but its bundled types resolve
// the default import to the module namespace; assert the documented call signature at this boundary.
const filePathFilter = filePathFilterModule as unknown as (options: {
    include?: string[];
    exclude?: string[];
}) => (filePath: string) => boolean;

export const getConfiguration = async (appSettings: AppSettings): Promise<BuildConfiguration> => {
    const hookEntries = await runBuildHooks(appSettings);
    const designTokensCss = await buildDesignTokensCss(appSettings);

    const componentEntryPointsPromise = findComponentEntryPoints(appSettings.find.componentEntryPoints);
    const stylesPromise = findComponentStyles(appSettings.find.componentStyles);
    const [componentEntryPoints, styles] = await Promise.all([componentEntryPointsPromise, stylesPromise]);
    const alias = getAliasList(appSettings);

    try {
        await extractIconSprites({
            sourcePath: appSettings.paths.iconSprite.sources.map((src) => join(process.cwd(), src)),
            targetPath: join(process.cwd(), appSettings.paths.iconSprite.target),
        });
    } catch (error) {
        console.error('Error extracting icon sprites:', error);
    }

    cleanDirs([appSettings.paths.public, appSettings.paths.publicStatic]);

    const vendorTs = await findAppEntryPoint(appSettings.find.shopUiEntryPoints, './vendor.ts');
    const appTs = await findAppEntryPoint(appSettings.find.shopUiEntryPoints, './app.ts');
    const basicScss = await findAppEntryPoint(appSettings.find.shopUiEntryPoints, './styles/basic.scss');
    const utilScss = await findAppEntryPoint(appSettings.find.shopUiEntryPoints, './styles/util.scss');
    const sharedScss = await findAppEntryPoint(appSettings.find.shopUiEntryPoints, './styles/shared.scss');

    const isInjectionDebuggingEnabled = appSettings.isInjectionDebuggingEnabled ?? false;

    // The shared style graph (`Theme/*/styles/**`, present only in core ShopUi and the project)
    // provides every mixin the injected shared module already exposes — those names must never
    // resolve through the mixin index.
    const sharedStyleFilePaths = await findComponentStyles({
        dirs: appSettings.find.componentStyles.dirs,
        // The builder's own Jest fixtures are component- and style-shaped; they must not enter a
        // real build (same exclusion as the component finder applies).
        patterns: ['**/Theme/*/styles/**/*.scss', '!**/__tests__/**'],
    });

    // `styles` arrives in finder directory order (assetsSourceDirs), so on duplicate mixin
    // names the later file wins, mirroring the legacy "last @import wins" precedence. The order
    // is `core, sprykerCore, eco, features, project` (project last) — a deliberate divergence
    // from master's legacy builder (which had features last); see the `sources` note in
    // settings.mts for why project-last is the intended contract.
    const mixinIndex = await createMixinIndex({
        componentStyleFilePaths: styles,
        sharedStyleFilePaths,
        isInjectionDebuggingEnabled,
    });

    const {
        buildInjectionBanner,
        buildStyleRootBanner,
        createImporter: createSassInjectionImporter,
    } = createSassInjectionImporterFactory({
        aliasList: alias,
        projectWrapperPath: sharedScss ?? null,
        mixinIndex,
        isInjectionDebuggingEnabled,
    });

    // The injected Sass output depends on the mixin index, which webpack's filesystem cache
    // cannot observe — the cache version must change whenever the index changes.
    const mixinIndexHash = createHash('sha256').update(mixinIndex.getFingerprint()).digest('hex');

    const criticalEntryPoints = componentEntryPoints.filter(
        filePathFilter({
            include: appSettings.criticalPatterns,
        }),
    );

    const nonCriticalEntryPoints = componentEntryPoints.filter(
        filePathFilter({
            exclude: appSettings.criticalPatterns,
        }),
    );

    // Modules shipped before the builder migration may still carry self-emitting component styles
    // with no entry (legacy "the file exists, therefore it is in the bundle" contract). They are
    // supported silently — the list is diagnostic output, visible only under --debug-injection.
    const legacyOrphanStyles = findLegacyOrphanStyles({
        componentStyleFilePaths: styles,
        entryPointFilePaths: componentEntryPoints,
    });

    if (isInjectionDebuggingEnabled) {
        legacyOrphanStyles.forEach((filePath) =>
            console.log(`[debug-injection] ${buildLegacyOrphanStyleNotice(filePath)}`),
        );
    }

    const criticalOrphanStyles = legacyOrphanStyles.filter(filePathFilter({ include: appSettings.criticalPatterns }));
    const nonCriticalOrphanStyles = legacyOrphanStyles.filter(
        filePathFilter({ exclude: appSettings.criticalPatterns }),
    );

    return {
        namespace: appSettings.namespaceConfig.namespace,
        theme: appSettings.theme,
        componentEntryPointsLength: componentEntryPoints.length,
        stylesLength: styles.length,
        webpack: {
            context: appSettings.context,
            mode: 'development',
            devtool: 'cheap-module-source-map',

            cache: {
                type: 'filesystem',
                version: `mixin-index-${mixinIndexHash}`,
                buildDependencies: {
                    config: [import.meta.url],
                },
            },

            stats: {
                colors: true,
                chunks: false,
                chunkModules: false,
                chunkOrigins: false,
                modules: false,
                entrypoints: false,
                warnings: true,
            },

            // These app roots (vendor.ts, app.ts, basic.scss, util.scss) are required build inputs;
            // findAppEntryPoint types them as possibly-undefined, so the build contract is asserted here.
            // Rescued legacy styles come before the declared entry points: the legacy bundle laid
            // them out in finder order (core first, project last), so a project component that
            // competes with a rescued vendor rule must stay later in the cascade and keep winning.
            entry: {
                vendor: vendorTs!,
                app: [appTs!, ...legacyOrphanStyles, ...componentEntryPoints, ...hookEntries.app],
                // Design tokens go first: token definitions must precede every style that
                // consumes them, including basic.scss.
                critical: [
                    ...(designTokensCss ? [designTokensCss] : []),
                    ...hookEntries.critical,
                    basicScss!,
                    ...criticalOrphanStyles,
                    ...criticalEntryPoints,
                ],
                'non-critical': [
                    ...hookEntries.nonCritical,
                    ...nonCriticalOrphanStyles,
                    ...nonCriticalEntryPoints,
                    utilScss!,
                ],
                util: utilScss!,
            },

            output: {
                path: join(appSettings.context, appSettings.paths.public),
                publicPath: `/${appSettings.urls.assets}/`,
                filename: `./js/${appSettings.name}.[name].js`,
                chunkLoadingGlobal: `webpackJsonp_${appSettings.name.replace(/(-|\W)+/gi, '_')}`,
            },

            resolve: {
                extensions: ['.ts', '.js', '.json', '.css', '.scss'],
                alias,
            },

            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        loader: 'babel-loader',
                        options: {
                            cacheDirectory: true,
                            presets: [
                                [
                                    '@babel/env',
                                    {
                                        loose: true,
                                        modules: false,
                                        targets: {
                                            esmodules: true,
                                        },
                                        useBuiltIns: false,
                                    },
                                ],
                                '@babel/preset-typescript',
                            ],
                            plugins: [
                                ['@babel/plugin-transform-runtime'],
                                [
                                    '@babel/plugin-transform-class-properties',
                                    {
                                        loose: true,
                                    },
                                ],
                            ],
                        },
                    },
                    {
                        test: /\.(scss|css)/i,
                        use: [
                            MiniCssExtractPlugin.loader,
                            {
                                loader: 'css-loader',
                                options: {
                                    url: false,
                                    importLoaders: 1,
                                },
                            },
                            {
                                loader: 'postcss-loader',
                                options: {
                                    postcssOptions: {
                                        plugins: [autoprefixer],
                                    },
                                },
                            },
                            {
                                loader: 'sass-loader',
                                options: {
                                    implementation: createErrorTranslatingSassImplementation(sassEmbedded),
                                    api: 'modern-compiler',
                                    // Entry files are Sass roots compiled from a string — they never
                                    // pass through the importer's load(), so injectable roots get the
                                    // banner here. Children of a root keep coming through the importer;
                                    // additionalData cannot reach them (covered by the injection
                                    // jest suite).
                                    additionalData: (content: string, loaderContext: { resourcePath: string }) => {
                                        const isComponentRoot = isInjectableComponentPath(loaderContext.resourcePath);

                                        if (
                                            !isComponentRoot &&
                                            !isInjectableStyleRootPath(loaderContext.resourcePath)
                                        ) {
                                            return content;
                                        }

                                        const injectionBanner = isComponentRoot
                                            ? buildInjectionBanner(content, loaderContext.resourcePath)
                                            : buildStyleRootBanner(content);

                                        if (isInjectionDebuggingEnabled) {
                                            console.log(
                                                `[debug-injection] ${loaderContext.resourcePath}\n    injected banner (root): ${injectionBanner}`,
                                            );
                                        }

                                        // One physical line prepended to the original first line, so
                                        // error line numbers keep matching the authored file.
                                        return `${injectionBanner} ${content}`;
                                    },
                                    // A function, not a plain object: the importer must register every
                                    // file it loads as a webpack dependency of the module being compiled
                                    // (sass-loader only registers `file:` URLs from `loadedUrls`, and the
                                    // injection importer keeps component files under a custom scheme).
                                    sassOptions: (loaderContext: { addDependency: (filePath: string) => void }) => {
                                        const sassInjectionImporter = createSassInjectionImporter({
                                            onFileLoaded: (loadedFilePath: string) =>
                                                loaderContext.addDependency(loadedFilePath),
                                        });

                                        return {
                                            // `importer` intercepts relative loads from the entry file
                                            // itself (compiled from a string, it has no owning importer);
                                            // without it those loads would use the built-in filesystem
                                            // importer and component files would skip injection.
                                            importer: sassInjectionImporter,
                                            importers: [sassInjectionImporter],
                                        };
                                    },
                                },
                            },
                        ],
                    },
                ],
            },

            optimization: {
                runtimeChunk: 'single',
                concatenateModules: false,
                splitChunks: {
                    chunks: 'initial',
                    minChunks: 1,
                    cacheGroups: {
                        default: false,
                        defaultVendors: false,
                    },
                },
            },

            plugins: [
                new webpack.DefinePlugin({
                    __NAME__: `'${appSettings.name}'`,
                    __PRODUCTION__: appSettings.isProductionMode,
                }),

                ...getAssetsConfig(appSettings),

                new MiniCssExtractPlugin({
                    filename: `./css/${appSettings.name}.[name].css`,
                }),

                (compiler) =>
                    compiler.hooks.done.tap('webpack', (compilationParams) => {
                        const watchLifecycleEventNames = ['yves:watch'];

                        if (watchLifecycleEventNames.includes(process.env.npm_lifecycle_event ?? '')) {
                            return;
                        }

                        const { errors } = compilationParams.compilation;

                        if (!errors || !errors.length) {
                            return;
                        }

                        errors.forEach((error) => console.log(error.message));
                        process.exit(1);
                    }),
            ],
        },
    };
};

export default getConfiguration;
