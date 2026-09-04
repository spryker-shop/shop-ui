import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectGlobalSettings } from '../../settings.mts';

const LINTED_FILE_PATTERN = '**/Theme/**/*.{js,ts}';
const YVES_DIRECTORY_NAME = 'Yves';
const PROJECT_CONFIGURATION_FILE_NAME = 'eslint.config.yves.mjs';
const OWNED_SOURCE_PREFIX = './src/';

const globalSettings = await loadProjectGlobalSettings();

// Only the sources the repository itself contains are linted. In a project layout the core, eco and
// feature roots point into vendor/, which is installed code and not ours to report on.
// A source root that does not already end in the Yves layer still has to reach it, otherwise the
// pattern also matches themes belonging to other layers, such as the Configurator applications.
const buildFilePattern = (sourceRoot: string): string =>
    sourceRoot.endsWith(`/${YVES_DIRECTORY_NAME}`)
        ? `${sourceRoot}/${LINTED_FILE_PATTERN}`
        : `${sourceRoot}/**/${YVES_DIRECTORY_NAME}/${LINTED_FILE_PATTERN}`;

const filePatterns = Object.values(globalSettings.paths.sources)
    .filter((sourceRoot) => sourceRoot.startsWith(OWNED_SOURCE_PREFIX))
    .map(buildFilePattern);

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
    ['eslint', '--no-config-lookup', '--config', configPath, '--no-error-on-unmatched-pattern', ...filePatterns],
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
