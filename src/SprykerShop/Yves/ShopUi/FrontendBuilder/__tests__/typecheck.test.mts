import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from '@jest/globals';
import { defineConfig, sourceLayouts } from '../settings.mts';

const BUILDER_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPECHECK_SCRIPT = join(BUILDER_DIRECTORY, 'libs/typescript/typecheck.mts');
const SETTINGS_URL = pathToFileURL(join(BUILDER_DIRECTORY, 'settings.mts')).href;
const temporaryRoots: string[] = [];

// The marker directory is what the settings detect the source layout from.
const createProjectRoot = (layoutMarker: string): string => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'yves-builder-typecheck-')));
    temporaryRoots.push(root);
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    mkdirSync(join(root, layoutMarker), { recursive: true });

    return root;
};

const writeProjectSettings = (context: string, typecheck: boolean): void => {
    mkdirSync(join(context, 'frontend'), { recursive: true });
    writeFileSync(
        join(context, 'frontend/yves.settings.mts'),
        `import { defineConfig } from '${SETTINGS_URL}';\n\nexport default defineConfig({ typecheck: ${typecheck} });\n`,
    );
};

const runTypecheck = (context: string): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [TYPECHECK_SCRIPT], { cwd: context, encoding: 'utf8' });

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('the typecheck setting', () => {
    it('is on by default in the monorepo layout and off in the project layout', () => {
        expect(sourceLayouts.map((layout) => [layout.marker, layout.typecheck])).toEqual([
            ['src/SprykerShop', true],
            ['vendor/spryker-shop', false],
        ]);
    });

    it('is overridden by defineConfig in both directions', () => {
        expect(defineConfig({ typecheck: false }).typecheck).toBe(false);
        expect(defineConfig({ typecheck: true }).typecheck).toBe(true);
    });
});

describe('running the type check', () => {
    it('skips in a project by default and names the file and setting that enable it', () => {
        const context = createProjectRoot('vendor/spryker-shop');

        const result = runTypecheck(context);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Yves type checking is off');
        expect(result.stdout).toContain('{ typecheck: true }');
        expect(result.stdout).toContain(join(context, 'frontend/yves.settings.mts'));
    });

    it('skips in the monorepo when the project settings turn it off', () => {
        const context = createProjectRoot('src/SprykerShop');
        writeProjectSettings(context, false);

        const result = runTypecheck(context);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Yves type checking is off');
    });

    it('runs in a project that turns it on, and so reports the missing generated configuration', () => {
        const context = createProjectRoot('vendor/spryker-shop');
        writeProjectSettings(context, true);

        const result = runTypecheck(context);

        expect(result.status).toBe(1);
        expect(result.stdout).not.toContain('type checking is off');
        expect(result.stderr).toContain('does not exist yet');
    });
});
