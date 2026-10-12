import { describe, it, expect } from '@jest/globals';
import {
    buildLegacyOrphanStyleNotice,
    buildShadowedLegacyStyleNotice,
    findLegacyOrphanStyles,
} from '../libs/webpack/legacy-style-rescue.mts';
import { fixturePath } from './helpers/compile-fixture.mts';

const coreMolecule = (...segments: string[]): string =>
    fixturePath('legacy-style-rescue', 'ModuleA/Theme/fixture/components/molecules', ...segments);
const coreCurrentThemeMolecule = (...segments: string[]): string =>
    fixturePath('legacy-style-rescue', 'ModuleA/Theme/fixture-custom/components/molecules', ...segments);
const projectMolecule = (...segments: string[]): string =>
    fixturePath('legacy-style-rescue', 'ProjectModuleA/Theme/fixture/components/molecules', ...segments);

const rescueCoreOnly = () =>
    findLegacyOrphanStyles({
        componentStyleFilePaths: [
            coreMolecule('aggregator-only', 'aggregator-only.scss'),
            coreMolecule('mixin-library', 'mixin-library.scss'),
            coreMolecule('proper', 'proper.scss'),
            coreMolecule('self-include', 'self-include.scss'),
            coreMolecule('widget-only', 'widget-only.scss'),
        ],
        entryPointFilePaths: [coreMolecule('proper', 'index.ts'), coreMolecule('widget-only', 'index.ts')],
    });

describe('legacy orphan style rescue', () => {
    it('rescues a self-including component file whose component has no entry', () => {
        expect(rescueCoreOnly().rescuedFilePaths).toContain(coreMolecule('self-include', 'self-include.scss'));
    });

    it('rescues the self-emitting component file and ignores its style.scss, which legacy never loaded', () => {
        const { rescuedFilePaths } = rescueCoreOnly();

        expect(rescuedFilePaths).toContain(coreMolecule('aggregator-only', 'aggregator-only.scss'));
        expect(rescuedFilePaths).not.toContain(coreMolecule('aggregator-only', 'style.scss'));
    });

    it('rescues a self-including component file when its entry loads no styles', () => {
        expect(rescueCoreOnly().rescuedFilePaths).toContain(coreMolecule('widget-only', 'widget-only.scss'));
    });

    it('leaves a component alone when its entry loads styles', () => {
        const { rescuedFilePaths } = rescueCoreOnly();

        expect(rescuedFilePaths).not.toContain(coreMolecule('proper', 'style.scss'));
        expect(rescuedFilePaths).not.toContain(coreMolecule('proper', 'proper.scss'));
    });

    it('never rescues a mixin-only file, which emits nothing on load', () => {
        expect(rescueCoreOnly().rescuedFilePaths).not.toContain(coreMolecule('mixin-library', 'mixin-library.scss'));
    });

    it('reports nothing as shadowed when every component is provided by its own directory', () => {
        expect(rescueCoreOnly().shadowed).toEqual([]);
    });

    it('names the file, the reason and the migration step in the diagnostic notice', () => {
        const notice = buildLegacyOrphanStyleNotice(coreMolecule('self-include', 'self-include.scss'));

        expect(notice).toContain(coreMolecule('self-include', 'self-include.scss'));
        expect(notice).toContain('no entry that loads styles');
        expect(notice).toContain("import './style.scss';");
    });
});

describe('legacy orphan style rescue under component overrides', () => {
    it('skips a self-emitting file when a project directory provides the component', () => {
        const { rescuedFilePaths, shadowed } = findLegacyOrphanStyles({
            componentStyleFilePaths: [
                coreMolecule('widget-only', 'widget-only.scss'),
                projectMolecule('widget-only', 'widget-only.scss'),
            ],
            entryPointFilePaths: [projectMolecule('widget-only', 'index.ts')],
        });

        expect(rescuedFilePaths).toEqual([]);
        expect(shadowed).toEqual([
            {
                filePath: coreMolecule('widget-only', 'widget-only.scss'),
                providedBy: projectMolecule('widget-only', 'index.ts'),
            },
        ]);
    });

    it('skips a default-theme self-emitting file when the current theme provides the component', () => {
        const { rescuedFilePaths, shadowed } = findLegacyOrphanStyles({
            componentStyleFilePaths: [coreMolecule('widget-only', 'widget-only.scss')],
            entryPointFilePaths: [coreCurrentThemeMolecule('widget-only', 'index.ts')],
        });

        expect(rescuedFilePaths).toEqual([]);
        expect(shadowed.map(({ filePath }) => filePath)).toEqual([coreMolecule('widget-only', 'widget-only.scss')]);
    });

    it('lets the providing directory own the styles even when it ships none', () => {
        const { rescuedFilePaths, shadowed } = findLegacyOrphanStyles({
            componentStyleFilePaths: [coreMolecule('self-include', 'self-include.scss')],
            entryPointFilePaths: [projectMolecule('self-include', 'index.ts')],
        });

        expect(rescuedFilePaths).toEqual([]);
        expect(shadowed.map(({ providedBy }) => providedBy)).toEqual([projectMolecule('self-include', 'index.ts')]);
    });

    it('does not report a shadowed mixin-only file, which loses nothing', () => {
        const { shadowed } = findLegacyOrphanStyles({
            componentStyleFilePaths: [coreMolecule('proper', 'proper.scss')],
            entryPointFilePaths: [projectMolecule('proper', 'index.ts')],
        });

        expect(shadowed).toEqual([]);
    });

    it('names the shadowed file, the providing entry and the next action in the diagnostic notice', () => {
        const notice = buildShadowedLegacyStyleNotice(
            coreMolecule('widget-only', 'widget-only.scss'),
            projectMolecule('widget-only', 'index.ts'),
        );

        expect(notice).toContain(coreMolecule('widget-only', 'widget-only.scss'));
        expect(notice).toContain(projectMolecule('widget-only', 'index.ts'));
        expect(notice).toContain('is not compiled');
        expect(notice).toContain('provides the component');
        expect(notice).toContain('load');
    });
});
