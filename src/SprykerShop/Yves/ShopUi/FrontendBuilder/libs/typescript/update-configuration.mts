import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultGlobalSettings, loadProjectGlobalSettings, type GlobalSettings } from '../../settings.mts';
import { writeConfigurationFile } from './configuration-file.mts';
import type { SolutionReconciliation } from './solution-configuration.mts';
import {
    reconcileDefaultsConfiguration,
    reconcileProjectSolution,
    reconcileYvesConfiguration,
} from './typescript-configuration.mts';

export const applySolutionReconciliation = (context: string, reconciliation: SolutionReconciliation): void => {
    if (reconciliation.status === 'projectOwned') {
        console.log(reconciliation.notice);

        return;
    }

    if (reconciliation.status === 'unchanged') {
        return;
    }

    writeConfigurationFile(reconciliation.filePath, reconciliation.configuration);
    console.log(`${reconciliation.status === 'created' ? 'Created' : 'Updated'}: ${reconciliation.filePath}`);
};

export const updateYvesConfiguration = async (
    globalSettings: GlobalSettings = defaultGlobalSettings,
): Promise<void> => {
    const { filePath, configuration } = await reconcileYvesConfiguration(globalSettings);
    const defaultsConfiguration = reconcileDefaultsConfiguration(globalSettings);

    // Both files are what the Yves configuration extends, so they exist before it is written.
    applySolutionReconciliation(globalSettings.context, reconcileProjectSolution(globalSettings));
    writeConfigurationFile(defaultsConfiguration.filePath, defaultsConfiguration.configuration);
    console.log(`Updated: ${defaultsConfiguration.filePath}`);

    writeConfigurationFile(filePath, configuration);
    console.log(`Updated: ${filePath}`);
};

const isInvokedAsScript =
    process.argv[1] !== undefined && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url));

if (isInvokedAsScript) {
    const globalSettings = await loadProjectGlobalSettings();
    console.log(`Build configuration: ${globalSettings.buildConfigurationSource}`);
    await updateYvesConfiguration(globalSettings);
}
