import { describe, it, expect } from '@jest/globals';
import { buildLegacyOrphanStyleNotice, findLegacyOrphanStyles } from '../libs/webpack/legacy-style-rescue.mts';
import { fixturePath } from './helpers/compile-fixture.mts';

const moleculesPath = fixturePath('legacy-style-rescue', 'ModuleA/Theme/fixture/components/molecules');

const componentPath = (...segments: string[]): string => `${moleculesPath}/${segments.join('/')}`;

const rescueFixture = (): string[] =>
    findLegacyOrphanStyles({
        componentStyleFilePaths: [
            componentPath('aggregator-only', 'aggregator-only.scss'),
            componentPath('mixin-library', 'mixin-library.scss'),
            componentPath('proper', 'proper.scss'),
            componentPath('self-include', 'self-include.scss'),
            componentPath('widget-only', 'widget-only.scss'),
        ],
        entryPointFilePaths: [componentPath('proper', 'index.ts'), componentPath('widget-only', 'index.ts')],
    });

describe('legacy orphan style rescue', () => {
    it('rescues a self-including component file whose component has no entry', () => {
        expect(rescueFixture()).toContain(componentPath('self-include', 'self-include.scss'));
    });

    it('rescues the self-emitting component file and ignores its style.scss, which legacy never loaded', () => {
        const rescued = rescueFixture();

        expect(rescued).toContain(componentPath('aggregator-only', 'aggregator-only.scss'));
        expect(rescued).not.toContain(componentPath('aggregator-only', 'style.scss'));
    });

    it('rescues a self-including component file when its entry loads no styles', () => {
        expect(rescueFixture()).toContain(componentPath('widget-only', 'widget-only.scss'));
    });

    it('leaves a component alone when its entry loads styles', () => {
        const rescued = rescueFixture();

        expect(rescued).not.toContain(componentPath('proper', 'style.scss'));
        expect(rescued).not.toContain(componentPath('proper', 'proper.scss'));
    });

    it('never rescues a mixin-only file, which emits nothing on load', () => {
        expect(rescueFixture()).not.toContain(componentPath('mixin-library', 'mixin-library.scss'));
    });

    it('names the file, the reason and the migration step in the diagnostic notice', () => {
        const notice = buildLegacyOrphanStyleNotice(componentPath('self-include', 'self-include.scss'));

        expect(notice).toContain(componentPath('self-include', 'self-include.scss'));
        expect(notice).toContain('no entry that loads styles');
        expect(notice).toContain("import './style.scss';");
    });
});
