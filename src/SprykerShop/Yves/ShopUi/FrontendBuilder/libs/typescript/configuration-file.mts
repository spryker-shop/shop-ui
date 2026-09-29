import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface TypeScriptConfiguration {
    extends?: string | string[];
    compilerOptions?: Record<string, unknown> & { paths?: Record<string, string[]> };
    include?: string[];
    exclude?: string[];
}

export const readConfigurationFile = (filePath: string): TypeScriptConfiguration | null => {
    if (!existsSync(filePath)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(filePath, { encoding: 'utf8' })) as TypeScriptConfiguration;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        throw new Error(
            `Cannot read the Yves TypeScript configuration ${filePath}: ${reason}.\n` +
                `The builder regenerates the layout-dependent sections of this file in place, so it must ` +
                `contain valid JSON without comments or trailing commas.\n` +
                `Fix the JSON syntax, or delete the file and run "npm run update:config -w shop-ui" to have it ` +
                `written from scratch.\n`,
        );
    }
};

const hasSameContent = (existingText: string, configuration: unknown): boolean => {
    try {
        return JSON.stringify(JSON.parse(existingText)) === JSON.stringify(configuration);
    } catch {
        // An unparsable file is rewritten.
        return false;
    }
};

// Rewritten only when the content changes, so the formatting a project gave its copy survives.
export const writeConfigurationFile = (filePath: string, configuration: unknown): void => {
    if (existsSync(filePath) && hasSameContent(readFileSync(filePath, 'utf8'), configuration)) {
        return;
    }

    writeFileSync(filePath, `${JSON.stringify(configuration, null, 4)}\n`);
};

/**
 * Generated entries come first and entries the project added itself follow, so regenerating an
 * untouched file is a no-op and a project addition is never lost.
 */
export const reconcileEntryList = (
    existingEntries: string[] | undefined,
    generatedEntries: string[],
    isGeneratedEntry: (entry: string) => boolean,
): string[] => {
    const projectEntries = (existingEntries ?? []).filter(
        (existingEntry) => !generatedEntries.includes(existingEntry) && !isGeneratedEntry(existingEntry),
    );

    return [...generatedEntries, ...projectEntries];
};
