import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_SETTINGS_RELATIVE_PATH, loadProjectGlobalSettings } from '../../settings.mts';

const globalSettings = await loadProjectGlobalSettings();

if (!globalSettings.typecheck) {
    console.log(
        `Yves type checking is off: the builder setting "typecheck" is false. To enable it, pass ` +
            `{ typecheck: true } to defineConfig() in ${join(globalSettings.context, PROJECT_SETTINGS_RELATIVE_PATH)}.`,
    );
    process.exit(0);
}

const configurationPath = join(globalSettings.context, globalSettings.paths.tsConfig);

if (!existsSync(configurationPath)) {
    process.stderr.write(
        `The Yves TypeScript configuration ${configurationPath} does not exist yet.\n` +
            `It is generated, and generating it is part of "npm install" through the root postinstall script.\n` +
            `Run "npm run update:config -w shop-ui" and try again.\n`,
    );
    process.exit(1);
}

const typeScriptResult = spawnSync('npx', ['tsc', '--noEmit', '-p', configurationPath], {
    stdio: 'inherit',
    cwd: globalSettings.context,
});

if (typeScriptResult.error !== undefined) {
    process.stderr.write(
        `Failed to run the TypeScript compiler for ${configurationPath}: ${typeScriptResult.error.message}.\n` +
            `Install dependencies so "npx tsc" resolves, then re-run "npm run yves:lint".\n`,
    );
    process.exit(1);
}

process.exit(typeScriptResult.status ?? 1);
