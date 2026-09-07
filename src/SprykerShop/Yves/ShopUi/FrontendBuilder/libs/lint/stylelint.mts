import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { program } from 'commander';
import stylelint from 'stylelint';
import {
    BUILDER_TESTS_PATTERN,
    buildYvesThemePattern,
    getOwnedSourceRoots,
    loadProjectGlobalSettings,
} from '../../settings.mts';

const LINTED_FILE_PATTERN = '*.scss';

const globalSettings = await loadProjectGlobalSettings();

program
    .option('-f, --fix', 'execute stylelint in the fix mode.')
    .option('-p, --file-path <path>', 'execute stylelint only for this file.')
    .parse(process.argv);

const commandLineOptions = program.opts();

const isFixMode = !!commandLineOptions.fix;
const defaultFilePaths = getOwnedSourceRoots(globalSettings).map((sourceRoot) =>
    join(globalSettings.context, buildYvesThemePattern(sourceRoot, LINTED_FILE_PATTERN)),
);
const filePaths = commandLineOptions.filePath ? [commandLineOptions.filePath] : defaultFilePaths;

const projectConfigPath = join(globalSettings.context, '.stylelintrc.js');
const packagedConfigPath = fileURLToPath(new URL('./stylelint.config.mjs', import.meta.url));

let configFile;
if (existsSync(projectConfigPath)) {
    configFile = projectConfigPath;
} else if (existsSync(packagedConfigPath)) {
    configFile = packagedConfigPath;
} else {
    process.stderr.write(
        `Stylelint configuration could not be resolved (offending path: ${packagedConfigPath}). ` +
            `Neither a project-root override at ${projectConfigPath} nor the packaged default exists; ` +
            `a missing packaged config means the shipped ShopUi builder is broken. ` +
            `Restore FrontendBuilder/libs/lint/stylelint.config.mjs in the ShopUi package, or add a project-root .stylelintrc.js.\n`,
    );
    process.exit(1);
}

stylelint
    .lint({
        cwd: globalSettings.context,
        configFile,
        files: filePaths,
        ignorePattern: [BUILDER_TESTS_PATTERN],
        formatter: 'string',
        fix: isFixMode,
    })
    .then(function (data) {
        if (data.errored) {
            process.stdout.write(data.report);
            process.exit(1);
        }
    })
    .catch(function (error) {
        console.error(error.stack);
        process.exit(1);
    });
