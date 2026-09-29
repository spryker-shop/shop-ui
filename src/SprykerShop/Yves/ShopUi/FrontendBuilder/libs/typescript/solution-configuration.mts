import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toConfigurationPathSegments } from './configuration-path.mts';

export const PROJECT_CONFIGURATION_FILE_NAME = 'tsconfig.json';

interface ProjectReference {
    path: string;
    [option: string]: unknown;
}

export interface SolutionConfiguration {
    files?: unknown;
    include?: unknown;
    references?: ProjectReference[];
    [option: string]: unknown;
}

export type SolutionReconciliation =
    | { status: 'created' | 'updated' | 'unchanged'; filePath: string; configuration: SolutionConfiguration }
    | { status: 'projectOwned'; filePath: string; notice: string };

interface SolutionReference {
    /** Project-root-relative, starting with `./`. */
    referencePath: string;
    /** Recognises the same configuration written for the other source layout or kept in the project root. */
    isEquivalentReference: (referencePath: string) => boolean;
}

const normaliseReferencePath = (referencePath: string): string => toConfigurationPathSegments(referencePath).join('/');

const isSolutionConfiguration = (configuration: SolutionConfiguration): boolean =>
    Array.isArray(configuration.files) && configuration.files.length === 0 && configuration.include === undefined;

const readSolutionConfiguration = (filePath: string): SolutionConfiguration | string => {
    try {
        return JSON.parse(readFileSync(filePath, { encoding: 'utf8' })) as SolutionConfiguration;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
};

const reconcileReferences = (
    existingReferences: ProjectReference[],
    { referencePath, isEquivalentReference }: SolutionReference,
): ProjectReference[] => {
    const normalisedReferencePath = normaliseReferencePath(referencePath);
    let isReferencePresent = false;
    const references: ProjectReference[] = [];

    for (const existingReference of existingReferences) {
        const existingPath = normaliseReferencePath(existingReference.path);
        const isOwnReference = existingPath === normalisedReferencePath || isEquivalentReference(existingPath);

        if (!isOwnReference) {
            references.push(existingReference);
            continue;
        }

        // The first match keeps its position so a project's own ordering survives a layout switch.
        if (!isReferencePresent) {
            references.push({ ...existingReference, path: referencePath });
            isReferencePresent = true;
        }
    }

    return isReferencePresent ? references : [...references, { path: referencePath }];
};

/**
 * The project root tsconfig.json is an editor-only solution file listing each builder's build
 * configuration, and the place where a project overrides compiler options for every builder. A root
 * that is a complete configuration instead belongs to the project and is never modified.
 */
export const reconcileSolutionConfiguration = (
    context: string,
    solutionReference: SolutionReference,
): SolutionReconciliation => {
    const filePath = join(context, PROJECT_CONFIGURATION_FILE_NAME);
    const { referencePath } = solutionReference;

    if (!existsSync(filePath)) {
        return { status: 'created', filePath, configuration: { files: [], references: [{ path: referencePath }] } };
    }

    const existingConfiguration = readSolutionConfiguration(filePath);

    if (typeof existingConfiguration === 'string') {
        return {
            status: 'projectOwned',
            filePath,
            notice:
                `Left ${filePath} unchanged: it is not plain JSON (${existingConfiguration}), so the Yves ` +
                `builder cannot add its reference safely. For per-builder editor support, add ` +
                `{ "path": "${referencePath}" } to its "references" yourself.`,
        };
    }

    if (!isSolutionConfiguration(existingConfiguration)) {
        return {
            status: 'projectOwned',
            filePath,
            notice:
                `Left ${filePath} unchanged: it is a complete TypeScript configuration rather than a ` +
                `solution file, so editors use it as a single project and its compilerOptions override the ` +
                `Yves defaults. For per-builder editor support, set "files": [], remove "include", ` +
                `and add { "path": "${referencePath}" } to "references".`,
        };
    }

    const references = reconcileReferences(existingConfiguration.references ?? [], solutionReference);
    const isUnchanged = JSON.stringify(references) === JSON.stringify(existingConfiguration.references);

    return {
        status: isUnchanged ? 'unchanged' : 'updated',
        filePath,
        configuration: { ...existingConfiguration, references },
    };
};
