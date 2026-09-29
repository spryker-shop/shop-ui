import { describe, it, expect, afterAll } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConfigurationFile } from '../libs/typescript/configuration-file.mts';

const workingDirectory = mkdtempSync(join(tmpdir(), 'configuration-file-'));

afterAll(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
});

describe('writing a generated configuration', () => {
    it('creates the file when it does not exist', () => {
        const filePath = join(workingDirectory, 'created.json');

        writeConfigurationFile(filePath, { files: [] });

        expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ files: [] });
    });

    it('leaves a file with the same content untouched, whatever its formatting', () => {
        const filePath = join(workingDirectory, 'formatted.json');
        const formattedByTheProject = '{ "lib": ["dom", "esnext"] }\n';
        writeFileSync(filePath, formattedByTheProject);

        writeConfigurationFile(filePath, { lib: ['dom', 'esnext'] });

        expect(readFileSync(filePath, 'utf8')).toBe(formattedByTheProject);
    });

    it('rewrites the file when its content changes', () => {
        const filePath = join(workingDirectory, 'changed.json');
        writeFileSync(filePath, '{ "lib": ["dom"] }\n');

        writeConfigurationFile(filePath, { lib: ['dom', 'esnext'] });

        expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ lib: ['dom', 'esnext'] });
    });

    it('rewrites a file that is not valid JSON', () => {
        const filePath = join(workingDirectory, 'broken.json');
        writeFileSync(filePath, '{ not json');

        writeConfigurationFile(filePath, { files: [] });

        expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ files: [] });
    });
});
