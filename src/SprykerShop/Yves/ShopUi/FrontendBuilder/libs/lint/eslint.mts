import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BUILDER_TESTS_PATTERN,
    buildYvesThemePattern,
    getOwnedSourceRoots,
    loadProjectGlobalSettings,
} from '../../settings.mts';

const LINTED_FILE_PATTERN = '*.{js,ts}';
const PROJECT_CONFIGURATION_FILE_NAME = 'eslint.config.yves.mjs';

const globalSettings = await loadProjectGlobalSettings();

const filePatterns = getOwnedSourceRoots(globalSettings).map((sourceRoot) =>
    buildYvesThemePattern(sourceRoot, LINTED_FILE_PATTERN),
);

const projectConfigPath = join(globalSettings.context, PROJECT_CONFIGURATION_FILE_NAME);
const packagedConfigPath = fileURLToPath(new URL('./eslint.config.mjs', import.meta.url));

if (!existsSync(packagedConfigPath) && !existsSync(projectConfigPath)) {
    process.stderr.write(
        `ESLint configuration could not be resolved (offending path: ${packagedConfigPath}).\n` +
            `The packaged default is missing, which means the shipped ShopUi builder is incomplete.\n` +
            `Restore FrontendBuilder/libs/lint/eslint.config.mjs in the ShopUi package, or add a ` +
            `project-root override at ${projectConfigPath}.\n`,
    );
    process.exit(1);
}

const configPath = existsSync(projectConfigPath) ? projectConfigPath : packagedConfigPath;

// The eslint executable is used rather than its Node API, which resolves and type-checks every
// pattern eagerly and turns a seconds-long run into minutes on the Yves tree.
const result = spawnSync(
    'npx',
    [
        'eslint',
        '--no-config-lookup',
        '--config',
        configPath,
        '--no-error-on-unmatched-pattern',
        '--ignore-pattern',
        BUILDER_TESTS_PATTERN,
        ...filePatterns,
    ],
    { cwd: globalSettings.context, stdio: 'inherit' },
);

if (result.error !== undefined) {
    process.stderr.write(
        `ESLint could not be started for the Yves sources (${filePatterns.join(', ')}).\n` +
            `Reason: ${result.error.message}\n` +
            `Install dependencies so "npx eslint" resolves, then re-run "npm run yves:lint".\n`,
    );
    process.exit(1);
}

process.exit(result.status ?? 1);
