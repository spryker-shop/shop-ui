import { relative } from 'node:path';
import { describe, it, expect } from '@jest/globals';
import { findComponentStyles } from '../libs/webpack/finder.mts';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import { defaultGlobalSettings, getAppSettings } from '../settings.mts';
import type { NamespaceConfig } from '../libs/sass/namespace-config-parser.mts';
import { fixturePath } from './helpers/compile-fixture.mts';

const fixtureRoot = fixturePath('theme-style-discovery');
const atomStylePatterns = (theme: string): string[] => [`**/Theme/${theme}/components/atoms/*/*.scss`];

const findFixtureStyles = () =>
    findComponentStyles({
        dirs: [fixturePath('theme-style-discovery', 'core'), fixturePath('theme-style-discovery', 'project')],
        patterns: atomStylePatterns('fixture-custom'),
        fallbackPatterns: atomStylePatterns('fixture'),
    });

describe('component style discovery across themes', () => {
    it('lists the default-theme files of every source before the current-theme files, project last in each group', async () => {
        const files = await findFixtureStyles();

        expect(files.map((file) => relative(fixtureRoot, file))).toEqual([
            'core/ModuleA/Theme/fixture/components/atoms/comp/comp.scss',
            'project/ModuleA/Theme/fixture/components/atoms/comp/comp.scss',
            'core/ModuleA/Theme/fixture-custom/components/atoms/comp/comp.scss',
            'project/ModuleA/Theme/fixture-custom/components/atoms/comp/comp.scss',
        ]);
    });

    it('resolves a mixin every source and theme defines to the current-theme project file', async () => {
        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: await findFixtureStyles(),
            sharedStyleFilePaths: [],
        });

        const ownerFilePaths = mixinIndex.resolveDependencies(
            '@include module-a-comp;',
            fixturePath(
                'theme-style-discovery',
                'project/ModuleA/Theme/fixture-custom/components/atoms/comp/style.scss',
            ),
        );

        expect(ownerFilePaths).toEqual([
            fixturePath(
                'theme-style-discovery',
                'project/ModuleA/Theme/fixture-custom/components/atoms/comp/comp.scss',
            ),
        ]);
    });
});

describe('component style finder settings per theme', () => {
    const namespaceConfig: NamespaceConfig = {
        namespace: 'DE',
        codeBucket: 'DE',
        defaultTheme: 'fixture',
        themes: ['fixture', 'fixture-custom'],
    };
    const [defaultThemeSettings, currentThemeSettings] = getAppSettings(
        [namespaceConfig],
        fixturePath('theme-style-discovery', 'frontend-build-config.json'),
        defaultGlobalSettings,
    );

    it('scans the current theme and falls back to the default theme when building a custom theme', () => {
        expect(currentThemeSettings.find.componentStyles.patterns).toEqual(
            expect.arrayContaining([
                '**/Theme/fixture-custom/components/molecules/*/*.scss',
                '!**/Theme/fixture-custom/**/style.scss',
            ]),
        );
        expect(currentThemeSettings.find.componentStyles.fallbackPatterns).toEqual(
            expect.arrayContaining([
                '**/Theme/fixture/components/molecules/*/*.scss',
                '!**/Theme/fixture/**/style.scss',
            ]),
        );
    });

    it('scans only the default theme when building the default theme', () => {
        expect(defaultThemeSettings.find.componentStyles.patterns).toEqual(
            expect.arrayContaining(['**/Theme/fixture/components/molecules/*/*.scss']),
        );
        expect(defaultThemeSettings.find.componentStyles.fallbackPatterns).toEqual([]);
    });
});
