import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
    MANIFEST_FILENAME,
    createManifestWriterPlugin,
    createTwigVersionHolder,
    hashEmittedAssets,
    writeDevBuildManifest,
} from '../libs/reload/manifest-writer.mts';
import type { DevBuildManifest } from '../libs/reload/manifest-writer.mts';
import type { Compiler, Stats } from 'webpack';

// Captures the `done` handler the plugin registers so the test can fire compilations manually,
// standing in for webpack's compiler without pulling the full build into a unit test.
const createFakeCompiler = () => {
    let doneHandler: ((stats: Stats) => void) | undefined;

    const compiler = {
        hooks: {
            done: {
                tap: (_name: string, handler: (stats: Stats) => void) => {
                    doneHandler = handler;
                },
            },
        },
    } as unknown as Compiler;

    const fireCompilation = (hasErrors: boolean): void => {
        doneHandler?.({ hasErrors: () => hasErrors } as unknown as Stats);
    };

    return { compiler, fireCompilation };
};

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

// Builds an output directory shaped like a real webpack watch build: emitted chunks under js/ and
// css/, their source maps alongside, and a copied static asset outside those two subtrees.
const writeSampleOutput = (outputDirectory: string): void => {
    mkdirSync(join(outputDirectory, 'js'), { recursive: true });
    mkdirSync(join(outputDirectory, 'css'), { recursive: true });
    mkdirSync(join(outputDirectory, 'images'), { recursive: true });

    writeFileSync(join(outputDirectory, 'js', 'yves_default.app.js'), "console.log('app');\n");
    writeFileSync(join(outputDirectory, 'js', 'yves_default.app.js.map'), '{"version":3,"file":"app.js"}\n');
    writeFileSync(join(outputDirectory, 'css', 'yves_default.app.css'), '.app{color:red}\n');
    writeFileSync(join(outputDirectory, 'css', 'yves_default.app.css.map'), '{"version":3,"file":"app.css"}\n');
    // A copied static asset that happens to be JavaScript, sitting outside js/ and css/.
    writeFileSync(join(outputDirectory, 'images', 'inline-widget.js'), "console.log('copied');\n");
};

let outputDirectory: string;

beforeEach(() => {
    outputDirectory = mkdtempSync(join(tmpdir(), 'yves-manifest-writer-'));
});

afterEach(() => {
    rmSync(outputDirectory, { recursive: true, force: true });
});

describe('hashEmittedAssets', () => {
    it('maps each emitted js and css file to the sha256 of its content, keyed by output-relative path', () => {
        writeSampleOutput(outputDirectory);

        const assetHashes = hashEmittedAssets(outputDirectory);

        expect(assetHashes).toEqual({
            'js/yves_default.app.js': sha256("console.log('app');\n"),
            'css/yves_default.app.css': sha256('.app{color:red}\n'),
        });
    });

    it('excludes .map source-map files from the hash map', () => {
        writeSampleOutput(outputDirectory);

        const assetHashes = hashEmittedAssets(outputDirectory);

        expect(Object.keys(assetHashes)).not.toContain('js/yves_default.app.js.map');
        expect(Object.keys(assetHashes)).not.toContain('css/yves_default.app.css.map');
    });

    it('excludes copied static assets that live outside the js and css subdirectories', () => {
        writeSampleOutput(outputDirectory);

        const assetHashes = hashEmittedAssets(outputDirectory);

        expect(Object.keys(assetHashes)).not.toContain('images/inline-widget.js');
    });
});

describe('writeDevBuildManifest', () => {
    const manifest: DevBuildManifest = {
        buildId: 3,
        twigVersion: 0,
        assets: { 'css/yves_default.app.css': sha256('.app{color:red}\n') },
    };

    it('writes a complete, parseable manifest file with the expected shape', () => {
        writeDevBuildManifest(outputDirectory, manifest);

        const written = JSON.parse(readFileSync(join(outputDirectory, MANIFEST_FILENAME), 'utf8'));

        expect(written).toEqual(manifest);
    });

    it('leaves no temp file behind after an atomic write (rename, not partial write)', () => {
        writeDevBuildManifest(outputDirectory, manifest);

        const leftoverTempFiles = readdirSync(outputDirectory).filter((name) => name.endsWith('.tmp'));

        expect(leftoverTempFiles).toEqual([]);
        expect(existsSync(join(outputDirectory, MANIFEST_FILENAME))).toBe(true);
    });

    it('throws an error naming the manifest path and the reason when the output directory is not writable', () => {
        const missingDirectory = join(outputDirectory, 'does-not-exist');
        const expectedManifestPath = join(missingDirectory, MANIFEST_FILENAME);

        expect(() => writeDevBuildManifest(missingDirectory, manifest)).toThrow(expectedManifestPath);
        expect(() => writeDevBuildManifest(missingDirectory, manifest)).toThrow('no such file or directory');
        expect(() => writeDevBuildManifest(missingDirectory, manifest)).toThrow('npm run yves:watch');
    });
});

describe('createManifestWriterPlugin', () => {
    it('writes the manifest with a monotonic buildId that increments once per successful compilation', () => {
        writeSampleOutput(outputDirectory);
        const { compiler, fireCompilation } = createFakeCompiler();
        const { plugin } = createManifestWriterPlugin({
            outputDirectory,
            twigVersionHolder: createTwigVersionHolder(),
        });

        plugin.apply(compiler);
        fireCompilation(false);
        fireCompilation(false);

        const manifest = JSON.parse(readFileSync(join(outputDirectory, MANIFEST_FILENAME), 'utf8'));

        expect(manifest.buildId).toBe(2);
        expect(manifest.assets).toEqual({
            'js/yves_default.app.js': sha256("console.log('app');\n"),
            'css/yves_default.app.css': sha256('.app{color:red}\n'),
        });
    });

    it('reads the current twigVersion from the shared holder at flush time', () => {
        writeSampleOutput(outputDirectory);
        const twigVersionHolder = createTwigVersionHolder();
        const { compiler, fireCompilation } = createFakeCompiler();
        const { plugin } = createManifestWriterPlugin({ outputDirectory, twigVersionHolder });

        plugin.apply(compiler);
        twigVersionHolder.value = 7;
        fireCompilation(false);

        const manifest = JSON.parse(readFileSync(join(outputDirectory, MANIFEST_FILENAME), 'utf8'));

        expect(manifest.twigVersion).toBe(7);
    });

    it('does not write a manifest or increment the buildId when the compilation has errors', () => {
        writeSampleOutput(outputDirectory);
        const { compiler, fireCompilation } = createFakeCompiler();
        const { plugin } = createManifestWriterPlugin({
            outputDirectory,
            twigVersionHolder: createTwigVersionHolder(),
        });

        plugin.apply(compiler);
        fireCompilation(true);

        expect(existsSync(join(outputDirectory, MANIFEST_FILENAME))).toBe(false);
    });

    it('rewriteManifest re-emits with the same buildId and assets but the current twigVersion (Twig-only bump)', () => {
        writeSampleOutput(outputDirectory);
        const twigVersionHolder = createTwigVersionHolder();
        const { compiler, fireCompilation } = createFakeCompiler();
        const { plugin, rewriteManifest } = createManifestWriterPlugin({ outputDirectory, twigVersionHolder });

        plugin.apply(compiler);
        fireCompilation(false);
        const afterCompile = JSON.parse(readFileSync(join(outputDirectory, MANIFEST_FILENAME), 'utf8'));

        twigVersionHolder.value += 1;
        rewriteManifest();
        const afterTwigBump = JSON.parse(readFileSync(join(outputDirectory, MANIFEST_FILENAME), 'utf8'));

        // A template edit advances only twigVersion: buildId and the asset hashes stay put, which is
        // what lets the client tell a Twig change apart from a rebuild.
        expect(afterTwigBump.buildId).toBe(afterCompile.buildId);
        expect(afterTwigBump.assets).toEqual(afterCompile.assets);
        expect(afterTwigBump.twigVersion).toBe(afterCompile.twigVersion + 1);
    });
});

describe('createTwigVersionHolder', () => {
    it('starts at version zero and exposes a mutable value the caller can bump', () => {
        const holder = createTwigVersionHolder();

        expect(holder.value).toBe(0);

        holder.value += 1;

        expect(holder.value).toBe(1);
    });
});
