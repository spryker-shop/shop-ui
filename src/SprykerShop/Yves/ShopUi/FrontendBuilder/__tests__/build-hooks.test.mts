import { describe, it, expect } from '@jest/globals';
import { runBuildHooks } from '../libs/webpack/build-hooks.mts';
import type { BuildHook } from '../libs/webpack/build-hooks.mts';
import type { AppSettings } from '../settings.mts';

const appSettingsWith = (buildHooks: BuildHook[]): AppSettings => ({ buildHooks }) as unknown as AppSettings;

describe('build hook entry contributions', () => {
    it('merges the critical, app and non-critical files of every hook in registration order', async () => {
        const contributions = await runBuildHooks(
            appSettingsWith([
                { name: 'first', run: () => ({ critical: '/abs/first.css', app: ['/abs/first.ts'] }) },
                { name: 'second', run: () => ({ critical: ['/abs/second.css'], nonCritical: '/abs/second-late.css' }) },
            ]),
        );

        expect(contributions.critical).toEqual(['/abs/first.css', '/abs/second.css']);
        expect(contributions.app).toEqual(['/abs/first.ts']);
        expect(contributions.nonCritical).toEqual(['/abs/second-late.css']);
    });

    it('turns a named entry contribution into an additional webpack entry', async () => {
        const contributions = await runBuildHooks(
            appSettingsWith([{ name: 'print', run: () => ({ entries: { print: '/abs/print.scss' } }) }]),
        );

        expect(contributions.entries).toEqual({ print: ['/abs/print.scss'] });
    });

    it('concatenates the files two hooks contribute to the same named entry', async () => {
        const contributions = await runBuildHooks(
            appSettingsWith([
                { name: 'print-base', run: () => ({ entries: { print: ['/abs/print-base.scss'] } }) },
                { name: 'print-brand', run: () => ({ entries: { print: '/abs/print-brand.scss' } }) },
            ]),
        );

        expect(contributions.entries).toEqual({ print: ['/abs/print-base.scss', '/abs/print-brand.scss'] });
    });

    it('refuses a named entry that would replace a builder entry', async () => {
        await expect(
            runBuildHooks(appSettingsWith([{ name: 'clash', run: () => ({ entries: { app: '/abs/extra.scss' } }) }])),
        ).rejects.toThrow(/hook "clash".*"app".*reserved.*critical.*nonCritical/s);
    });

    it('refuses a named entry whose name cannot be an asset file name', async () => {
        await expect(
            runBuildHooks(
                appSettingsWith([{ name: 'bad-name', run: () => ({ entries: { 'print/../x': '/abs/extra.scss' } }) }]),
            ),
        ).rejects.toThrow(/hook "bad-name".*"print\/\.\.\/x".*letters, digits/s);
    });
});
