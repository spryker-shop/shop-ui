import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { getAliasList } from '../libs/webpack/alias.mts';
import type { AppSettings } from '../settings.mts';

const temporaryRoots: string[] = [];

const createContextWithPaths = (paths: Record<string, string[]>): string => {
    const context = mkdtempSync(join(tmpdir(), 'yves-builder-alias-'));
    temporaryRoots.push(context);
    writeFileSync(join(context, 'tsconfig.yves.json'), JSON.stringify({ compilerOptions: { paths } }));

    return context;
};

// `getAliasList` reads only the context and the configuration path.
const appSettingsFor = (context: string): AppSettings =>
    ({ context, paths: { tsConfig: './tsconfig.yves.json' } }) as unknown as AppSettings;

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('the webpack alias mirror', () => {
    it('mirrors a list of targets as an ordered webpack alias array', () => {
        const context = createContextWithPaths({
            '@shared/ai-commerce/*': ['./project/Theme/default/*', './core/Theme/default/*'],
        });

        expect(getAliasList(appSettingsFor(context))['@shared/ai-commerce']).toEqual([
            join(context, 'project/Theme/default'),
            join(context, 'core/Theme/default'),
        ]);
    });

    it('keeps a single-target alias a plain string', () => {
        const context = createContextWithPaths({ 'ShopUi/*': ['./core/ShopUi/Theme/default/*'] });

        expect(getAliasList(appSettingsFor(context)).ShopUi).toBe(join(context, 'core/ShopUi/Theme/default'));
    });
});
