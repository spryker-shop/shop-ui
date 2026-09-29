import { describe, it, expect, jest, afterAll, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDesignTokensCss } from '../libs/webpack/design-tokens.mts';
import type { AppSettings } from '../settings.mts';

// The generated css and the tokens json are both gitignored, so committed fixtures would
// silently vanish from a fresh checkout — every case is built at runtime instead.
const casesRoot = mkdtempSync(join(tmpdir(), 'design-tokens-'));

interface FixtureCase {
    appSettings: AppSettings;
    stylesDirectory: string;
    cssFilePath: string;
    sourceTokensPath: string;
}

const createFixtureCase = (
    caseName: string,
    { withTokensJson = false, withCommittedCss = false }: { withTokensJson?: boolean; withCommittedCss?: boolean },
): FixtureCase => {
    const caseRoot = join(casesRoot, caseName);
    const stylesDirectory = join(caseRoot, 'src/Pyz/Yves/ShopUi/Theme/fixture/styles');
    const tokensDirectory = join(caseRoot, 'frontend/assets/global/fixture/design-tokens');
    const cssFilePath = join(stylesDirectory, 'design-tokens.css');
    const sourceTokensPath = join(tokensDirectory, 'design-tokens.json');

    mkdirSync(stylesDirectory, { recursive: true });

    if (withTokensJson) {
        mkdirSync(tokensDirectory, { recursive: true });
        writeFileSync(sourceTokensPath, JSON.stringify({ color: { primary: { $value: '#f00' } } }));
    }

    if (withCommittedCss) {
        writeFileSync(cssFilePath, ':root { --primary: #f00; }');
    }

    const appSettings = {
        context: caseRoot,
        theme: 'fixture',
        paths: { assets: { globalAssets: './frontend/assets/global/fixture' } },
        find: { shopUiEntryPoints: { dirs: [join(caseRoot, 'src/Pyz/Yves')] } },
    } as unknown as AppSettings;

    return { appSettings, stylesDirectory, cssFilePath, sourceTokensPath };
};

// Proves the library is not even loaded when there is nothing to generate.
const styleDictionaryMustNotLoad = async (): Promise<never> => {
    throw new Error('style-dictionary was loaded although nothing had to be generated');
};

afterEach(() => {
    jest.restoreAllMocks();
});

afterAll(() => {
    rmSync(casesRoot, { recursive: true, force: true });
});

describe('built-in design-tokens step', () => {
    it('skips silently when the project has neither a tokens source nor a committed css', async () => {
        const { appSettings } = createFixtureCase('no-tokens', {});
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(buildDesignTokensCss(appSettings, styleDictionaryMustNotLoad)).resolves.toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('serves a committed design-tokens.css when there is no tokens source', async () => {
        const { appSettings, cssFilePath } = createFixtureCase('committed-css-only', { withCommittedCss: true });

        await expect(buildDesignTokensCss(appSettings, styleDictionaryMustNotLoad)).resolves.toBe(cssFilePath);
    });

    it('generates the css through style-dictionary and registers the transforms only once', async () => {
        const { appSettings, cssFilePath, sourceTokensPath, stylesDirectory } = createFixtureCase('generated', {
            withTokensJson: true,
        });
        jest.spyOn(console, 'info').mockImplementation(() => undefined);

        const registeredTransformNames: string[] = [];
        const buildConfigs: unknown[] = [];

        class FakeStyleDictionary {
            config: unknown;

            static registerTransform(transform: { name: string }): void {
                registeredTransformNames.push(transform.name);
            }

            static registerFileHeader(): void {}

            constructor(config: unknown) {
                this.config = config;
            }

            async buildAllPlatforms(): Promise<void> {
                buildConfigs.push(this.config);
            }
        }

        const loadFakeStyleDictionary = async () => FakeStyleDictionary;

        await expect(buildDesignTokensCss(appSettings, loadFakeStyleDictionary)).resolves.toBe(cssFilePath);
        await expect(buildDesignTokensCss(appSettings, loadFakeStyleDictionary)).resolves.toBe(cssFilePath);

        expect(registeredTransformNames).toEqual(['name/kebab-custom', 'value/px-custom']);
        expect(buildConfigs).toHaveLength(2);

        const firstBuildConfig = buildConfigs[0] as { source: string[]; platforms: { css: { buildPath: string } } };
        expect(firstBuildConfig.source).toEqual([sourceTokensPath]);
        expect(firstBuildConfig.platforms.css.buildPath).toBe(`${stylesDirectory}/`);
    });
});
