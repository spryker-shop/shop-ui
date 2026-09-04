import { describe, it, expect } from '@jest/globals';
import type { AppSettings } from '../settings.mts';
import { getCopyConfig } from '../libs/webpack/assets-configurator.mts';
import { fixturePath } from './helpers/compile-fixture.mts';

const buildAppSettings = (): AppSettings =>
    ({
        context: fixturePath('core-assets-merge'),
        paths: {
            assets: {
                coreGlobalAssets: 'core-shop-ui/Theme/default/assets',
                globalAssets: './frontend/assets/global/default',
                staticAssets: './frontend/static',
                currentAssets: 'frontend/assets/de/default',
            },
            publicStatic: 'public/Yves/assets/static',
        },
    }) as unknown as AppSettings;

describe('global assets merged from the ShopUi core and the project', () => {
    it('copies the core assets before the project assets', () => {
        const patterns = getCopyConfig(buildAppSettings());

        expect(patterns.map(({ from }) => from)).toEqual([
            'core-shop-ui/Theme/default/assets',
            './frontend/assets/global/default',
            './frontend/static',
        ]);
    });

    it('lets a project asset overwrite the core asset of the same name', () => {
        const patterns = getCopyConfig(buildAppSettings());

        expect(patterns.every(({ force }) => force === true)).toBe(true);
    });

    it('skips an asset directory that the project does not have', () => {
        const patterns = getCopyConfig(buildAppSettings());

        expect(patterns.map(({ from }) => from)).not.toContain('frontend/assets/de/default');
    });

    it('resolves a relative asset directory against the build context, not the working directory', () => {
        const appSettings = buildAppSettings();
        const patterns = getCopyConfig(appSettings);

        expect(patterns).not.toHaveLength(0);
        expect(patterns.every(({ context }) => context === appSettings.context)).toBe(true);
    });
});
