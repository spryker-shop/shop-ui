/**
 * Path helpers for the generated TypeScript configurations.
 *
 * A configuration file states its paths relative to itself, while the builder computes every path
 * relative to the project root, so most of this file exists to translate between the two.
 */

export const toConfigurationPathSegments = (configurationPath: string): string[] =>
    configurationPath
        .replace(/^\.\//, '')
        .split('/')
        .filter((segment) => segment.length > 0);

export const joinConfigurationPath = (...configurationPaths: string[]): string =>
    configurationPaths.flatMap(toConfigurationPathSegments).join('/');

/** TypeScript resolves a path relative to the file holding it, so a nested file needs a ladder. */
export const buildParentDirectoryLadder = (contextRelativeDirectory: string): string =>
    toConfigurationPathSegments(contextRelativeDirectory)
        .map(() => '..')
        .join('/');

/**
 * `extends` treats a value starting with neither `./` nor `../` as a package name, so a reference
 * written from the project root itself has to keep an explicit `./` prefix.
 */
export const buildRelativeReference = (parentDirectoryLadder: string, contextRelativePath: string): string =>
    parentDirectoryLadder === ''
        ? `./${joinConfigurationPath(contextRelativePath)}`
        : joinConfigurationPath(parentDirectoryLadder, contextRelativePath);

/**
 * Matches a configuration path against a template segment by segment, `*` standing for exactly one
 * segment. Used both to emit the generated entries and to recognise the ones an earlier run — or a
 * run under the other source layout — emitted, so a stale entry is replaced instead of accumulating.
 */
export const matchesConfigurationPathTemplate = (configurationPath: string, pathTemplate: string): boolean => {
    const pathSegments = toConfigurationPathSegments(configurationPath);
    const templateSegments = toConfigurationPathSegments(pathTemplate);

    return (
        pathSegments.length === templateSegments.length &&
        templateSegments.every(
            (templateSegment, index) => templateSegment === '*' || templateSegment === pathSegments[index],
        )
    );
};

export const matchesAnyPathTemplate = (configurationPath: string, pathTemplates: string[]): boolean =>
    pathTemplates.some((pathTemplate) => matchesConfigurationPathTemplate(configurationPath, pathTemplate));

export const dasherize = (value: string): string =>
    value
        .replace(/[\s_]/g, '-')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
