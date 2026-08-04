import { readFileSync } from 'node:fs';
import { describe, it, expect } from '@jest/globals';
import { createStyleFileInjectionDecider } from '../libs/sass/style-module-context.mts';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';

const CASE_NAME = 'style-module-context';

const coreStylesPath = fixturePath(CASE_NAME, 'core-shop-ui/Theme/fixture/styles');
const projectStylesPath = fixturePath(CASE_NAME, 'project/Theme/fixture/styles');

const needsSharedInjection = createStyleFileInjectionDecider({
    sharedRootPaths: [`${coreStylesPath}/shared.scss`],
    aliasList: shopUiAliasList(CASE_NAME),
});

const decideFor = (filePath: string): boolean => needsSharedInjection(filePath, readFileSync(filePath, 'utf8'));

describe('shared injection decision for style-graph files', () => {
    it('injects into a partial that declares its own @use, which cannot see the root context', () => {
        expect(decideFor(`${projectStylesPath}/basics/_grid.scss`)).toBe(true);
    });

    it('leaves a partial without its own @use alone, because it inherits the root context', () => {
        expect(decideFor(`${projectStylesPath}/basics/_reset.scss`)).toBe(false);
    });

    it('leaves a partial that already loads shared alone', () => {
        expect(decideFor(`${projectStylesPath}/basics/_typography.scss`)).toBe(false);
    });

    it('never injects into a file inside the shared closure, which would be a module loop', () => {
        expect(decideFor(`${coreStylesPath}/settings/_color.scss`)).toBe(false);
    });

    it('never injects into the shared stylesheet itself', () => {
        expect(decideFor(`${coreStylesPath}/shared.scss`)).toBe(false);
    });
});

describe('legacy project style root compilation', () => {
    it('compiles a legacy @import root whose partial declares its own @use', async () => {
        const { compileEntry } = createInjectionCompiler({ aliasList: shopUiAliasList(CASE_NAME) });
        const rootPath = `${projectStylesPath}/basic.scss`;

        // The legacy @import lines warn as expected; a capturing logger keeps them out of stdout.
        const result = await compileEntry(readFileSync(rootPath, 'utf8'), rootPath, {
            logger: { warn() {} },
        });

        expect(result.css.toString()).toContain('max-width: 1200px');
    });
});
