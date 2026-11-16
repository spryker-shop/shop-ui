import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { glob, globSync } from '../libs/glob.mts';

// The builders kept the fast-glob results they were written against; these pin where tinyglobby differs by default.
let temporaryRoot: string;
let realModulesDirectory: string;
let linkedModulesDirectory: string;

beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'builder-glob-'));
    realModulesDirectory = join(temporaryRoot, 'real');
    linkedModulesDirectory = join(temporaryRoot, 'linked');

    mkdirSync(join(realModulesDirectory, 'ModuleA', 'assets', 'Zed', 'node_modules'), { recursive: true });
    mkdirSync(join(realModulesDirectory, 'ModuleB', 'assets', 'Zed'), { recursive: true });
    writeFileSync(join(realModulesDirectory, 'ModuleA', 'assets', 'Zed', 'main.entry.js'), '');
    writeFileSync(join(realModulesDirectory, 'ModuleA', 'assets', 'Zed', 'node_modules', 'vendor.entry.js'), '');
    symlinkSync(realModulesDirectory, linkedModulesDirectory, 'dir');
});

afterEach(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('glob', () => {
    it('returns directories without the trailing slash tinyglobby marks them with', async () => {
        const directories = await glob('*/assets/Zed', { cwd: realModulesDirectory, onlyDirectories: true });

        expect(directories.sort()).toEqual(['ModuleA/assets/Zed', 'ModuleB/assets/Zed']);
    });

    it('returns a directory the pattern names, not the files below it', async () => {
        const directories = await glob('ModuleB/assets/Zed', { cwd: realModulesDirectory, onlyFiles: false });

        expect(directories).toEqual(['ModuleB/assets/Zed']);
    });

    it('excludes what a negated pattern matches', async () => {
        const files = await glob(['**/*.entry.js', '!**/node_modules/**'], { cwd: realModulesDirectory });

        expect(files).toEqual(['ModuleA/assets/Zed/main.entry.js']);
    });

    it('finds an absolute pattern outside the process directory through a symlinked directory', async () => {
        const directories = await glob(join(linkedModulesDirectory, '*', 'assets', 'Zed'), {
            onlyDirectories: true,
            followSymbolicLinks: false,
        });

        expect(directories.sort()).toEqual([
            join(linkedModulesDirectory, 'ModuleA', 'assets', 'Zed'),
            join(linkedModulesDirectory, 'ModuleB', 'assets', 'Zed'),
        ]);
    });
});

describe('globSync', () => {
    it('finds an absolute pattern outside the process directory through a symlinked directory', () => {
        const directories = globSync(join(linkedModulesDirectory, 'ModuleB', 'assets', 'Zed'), {
            onlyDirectories: true,
            followSymbolicLinks: false,
        });

        expect(directories).toEqual([join(linkedModulesDirectory, 'ModuleB', 'assets', 'Zed')]);
    });
});
