import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Compiler, Stats, WebpackPluginInstance } from 'webpack';

export const MANIFEST_FILENAME = 'dev-build-manifest.json';

// Webpack emits chunk assets into these two subdirectories of the output directory (see
// `configs/development.mts`: `output.filename = './js/...'` and MiniCssExtractPlugin
// `filename: './css/...'`). Copied static assets (fonts, images, global bundles) land elsewhere in
// the output tree, so scoping the hash walk to these subtrees is what excludes them.
const emittedAssetSubdirectories = ['js', 'css'] as const;

/**
 * Mutable version counter for Twig template changes. Phase 3's Twig watcher owns the writes; the
 * manifest writer only reads `value` at flush time. It is a shared object (not a number passed by
 * value) so the watcher can bump the version without importing the writer — avoiding a circular
 * import between the two libs.
 */
export interface TwigVersionHolder {
    value: number;
}

export const createTwigVersionHolder = (): TwigVersionHolder => ({ value: 0 });

export interface AssetHashMap {
    [relativeAssetPath: string]: string;
}

export interface DevBuildManifest {
    buildId: number;
    twigVersion: number;
    assets: AssetHashMap;
}

export interface ManifestWriterPluginOptions {
    outputDirectory: string;
    twigVersionHolder: TwigVersionHolder;
}

/**
 * The manifest writer surface handed to the caller. `plugin` rewrites the manifest after each
 * successful webpack compilation (advancing `buildId`); `rewriteManifest` re-emits the manifest
 * WITHOUT advancing `buildId` (assets are re-hashed from the unchanged output, so only
 * `twigVersion` moves). Phase 3's Twig watcher calls `rewriteManifest` on a `.twig` edit so a
 * template change reloads the page without faking a webpack build.
 */
export interface ManifestWriter {
    plugin: WebpackPluginInstance;
    rewriteManifest: () => void;
}

const collectFilesRecursively = (directory: string): string[] => {
    const collected: string[] = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            collected.push(...collectFilesRecursively(entryPath));

            continue;
        }

        collected.push(entryPath);
    }

    return collected;
};

const isHashableAssetFile = (filePath: string): boolean => {
    if (filePath.endsWith('.map')) {
        return false;
    }

    return filePath.endsWith('.js') || filePath.endsWith('.css');
};

const toRelativePosixPath = (outputDirectory: string, filePath: string): string =>
    relative(outputDirectory, filePath).split(sep).join('/');

/**
 * Hashes the emitted `.css`/`.js` chunk files under the output directory, keyed by their output
 * path relative to that directory (forward-slash separated so the key matches the served asset
 * URL tail). Source maps and copied static assets are excluded. Files are sorted so the resulting
 * map has a stable, deterministic key order across builds.
 */
export const hashEmittedAssets = (outputDirectory: string): AssetHashMap => {
    const assetHashes: AssetHashMap = {};

    for (const subdirectory of emittedAssetSubdirectories) {
        const subdirectoryPath = join(outputDirectory, subdirectory);

        if (!existsSync(subdirectoryPath)) {
            continue;
        }

        const sortedFiles = collectFilesRecursively(subdirectoryPath).sort();

        for (const filePath of sortedFiles) {
            if (!isHashableAssetFile(filePath)) {
                continue;
            }

            const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');
            assetHashes[toRelativePosixPath(outputDirectory, filePath)] = hash;
        }
    }

    return assetHashes;
};

// A per-process counter guarantees the temp file name is unique even when two flushes land in the
// same millisecond, so a rename can never overwrite another flush's in-flight temp file.
let temporaryFileCounter = 0;

/**
 * Writes the manifest to `dev-build-manifest.json` atomically: serialize to a uniquely named temp
 * file in the same directory, then rename over the destination. Rename within one filesystem is
 * atomic, so a polling client never observes a half-written file.
 */
export const writeDevBuildManifest = (outputDirectory: string, manifest: DevBuildManifest): void => {
    const manifestPath = join(outputDirectory, MANIFEST_FILENAME);
    temporaryFileCounter += 1;
    const temporaryPath = join(outputDirectory, `${MANIFEST_FILENAME}.${process.pid}.${temporaryFileCounter}.tmp`);
    const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;

    try {
        writeFileSync(temporaryPath, serializedManifest);
        renameSync(temporaryPath, manifestPath);
    } catch (error) {
        if (existsSync(temporaryPath)) {
            rmSync(temporaryPath, { force: true });
        }

        const reason = error instanceof Error ? error.message : String(error);

        throw new Error(
            `Failed to write the Yves dev live-reload manifest to ${manifestPath}. ` +
                `Reason: ${reason}. ` +
                `Ensure the webpack output directory exists and is writable, then re-run npm run yves:watch.`,
        );
    }
};

/**
 * Produces the webpack plugin plus a bound `rewriteManifest` callback. `buildId` is a monotonic
 * per-writer counter, incremented only on a successful compilation; the client uses it plus the
 * asset hashes and `twigVersion` to decide between a CSS hot-swap and a full reload. Both entry
 * points share the same private `buildId` and `twigVersionHolder`, so a Twig-only rewrite stays
 * coherent with the last real build (same `buildId`, same assets, bumped `twigVersion`).
 */
export const createManifestWriterPlugin = ({
    outputDirectory,
    twigVersionHolder,
}: ManifestWriterPluginOptions): ManifestWriter => {
    let buildId = 0;

    // A manifest write failure must not tear down the watch loop; report the actionable error and
    // keep going so the developer can fix the output directory without restarting the build.
    const writeManifestOrReport = (): void => {
        const manifest: DevBuildManifest = {
            buildId,
            twigVersion: twigVersionHolder.value,
            assets: hashEmittedAssets(outputDirectory),
        };

        try {
            writeDevBuildManifest(outputDirectory, manifest);
        } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
        }
    };

    return {
        plugin: {
            apply(compiler: Compiler): void {
                compiler.hooks.done.tap('YvesDevReloadManifestWriter', (stats: Stats): void => {
                    if (stats.hasErrors()) {
                        return;
                    }

                    buildId += 1;
                    writeManifestOrReport();
                });
            },
        },
        rewriteManifest: writeManifestOrReport,
    };
};
