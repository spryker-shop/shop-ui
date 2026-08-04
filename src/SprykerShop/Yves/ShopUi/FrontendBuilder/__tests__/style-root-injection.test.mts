import { readFileSync } from 'node:fs';
import { describe, it, expect } from '@jest/globals';
import { isInjectableStyleRootPath, isStyleGraphPath } from '../libs/sass/sass-injection-importer.mts';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';

const CASE_NAME = 'style-module-context';

const coreStylesPath = fixturePath(CASE_NAME, 'core-shop-ui/Theme/fixture/styles');
const projectStylesPath = fixturePath(CASE_NAME, 'project/Theme/fixture/styles');

describe('style root classification', () => {
    it('classifies a non-partial file directly inside styles/ as an injectable style root', () => {
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/basic.scss')).toBe(true);
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/util.scss')).toBe(true);
    });

    it('never classifies the shared stylesheet as injectable, which would make it load itself', () => {
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/shared.scss')).toBe(false);
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/_shared.scss')).toBe(false);
    });

    it('leaves partials and nested styles files to the per-file importer decision', () => {
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/_panel-dropdown.scss')).toBe(false);
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/basics/_reset.scss')).toBe(false);
        expect(isInjectableStyleRootPath('/project/Theme/fixture/styles/utils/spacing.scss')).toBe(false);
    });

    it('does not treat component files as style roots', () => {
        expect(isInjectableStyleRootPath('/m/Theme/fixture/components/atoms/button/button.scss')).toBe(false);
    });

    it('routes every styles/ file through the importer via the style graph membership check', () => {
        expect(isStyleGraphPath('/project/Theme/fixture/styles/basics/_reset.scss')).toBe(true);
        expect(isStyleGraphPath('/m/Theme/fixture/components/atoms/button/button.scss')).toBe(false);
    });
});

describe('legacy style root compilation against the mixin index', () => {
    it('compiles a legacy util root whose mixin lives in its own @import closure, bypassing the mixin index', async () => {
        // An index with no component styles would reject `util-spacing` as unknown — the control
        // test below proves that. The root must therefore compile without consulting it.
        const emptyMixinIndex = await createMixinIndex({
            componentStyleFilePaths: [],
            sharedStyleFilePaths: [],
        });
        const { compileEntry } = createInjectionCompiler({
            aliasList: shopUiAliasList(CASE_NAME),
            mixinIndex: emptyMixinIndex,
        });
        const utilRootPath = `${projectStylesPath}/util.scss`;

        // The fixture deliberately keeps legacy @import rules (in the root and in the injected
        // shared), so Sass emits deprecation warnings. A capturing logger keeps them out of test
        // output; asserting on them proves the legacy path (not a silent rewrite) was exercised.
        const warnings: string[] = [];
        const result = await compileEntry(readFileSync(utilRootPath, 'utf8'), utilRootPath, {
            logger: {
                warn(message) {
                    warnings.push(message);
                },
            },
        });
        const css = result.css.toString();

        // `.spacing` proves the @import closure resolved; `1200px` proves the injected shared
        // context reached the root ($setting-grid-max-width comes from core shared).
        expect(css).toContain('.spacing');
        expect(css).toContain('max-width: 1200px');
        expect(warnings.length).toBeGreaterThan(0);
        for (const warning of warnings) {
            expect(warning).toContain('@import rules are deprecated');
        }
    });

    it('control: the mixin index itself rejects the util root content as an unknown mixin', async () => {
        const emptyMixinIndex = await createMixinIndex({
            componentStyleFilePaths: [],
            sharedStyleFilePaths: [],
        });
        const utilRootPath = `${projectStylesPath}/util.scss`;

        expect(() => emptyMixinIndex.resolveDependencies(readFileSync(utilRootPath, 'utf8'), utilRootPath)).toThrow(
            /Unknown mixin "util-spacing"/,
        );
    });

    it('compiles the shared stylesheet as an entry without injecting it into itself', async () => {
        const { compileEntry } = createInjectionCompiler({ aliasList: shopUiAliasList(CASE_NAME) });
        const sharedPath = `${coreStylesPath}/shared.scss`;

        // Shared defines only variables and mixins, so a successful compile with empty output is
        // the proof: a self-injected banner would fail with a module loop instead. Its legacy
        // @import lines warn as expected; a capturing logger keeps them out of stdout.
        const result = await compileEntry(readFileSync(sharedPath, 'utf8'), sharedPath, {
            logger: { warn() {} },
        });

        expect(result.css.toString()).toBe('');
    });
});
