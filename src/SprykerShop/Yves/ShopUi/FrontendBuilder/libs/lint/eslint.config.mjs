import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import { sprykerBaseGlobals, sprykerBaseRules } from './spryker-base-eslint.mjs';

export default [
    {
        ignores: [
            'docker/',
            'public/*/assets/',
            '**/dist/',
            '**/node_modules/',
            'vendor/',
            'src/Pyz/Zed/*/Presentation/Components/',
            '**/.angular/',
        ],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...sprykerBaseGlobals,
            },
        },
        rules: {
            ...sprykerBaseRules,
            'accessor-pairs': [
                'error',
                {
                    setWithoutGet: true,
                    enforceForClassMembers: false,
                },
            ],
        },
    },
    {
        files: ['src/{Pyz,SprykerShop,SprykerFeature}/*/src/{Pyz,SprykerShop,SprykerFeature}/Yves/**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                project: ['./tsconfig.yves.json'],
            },
            globals: {
                ...sprykerBaseGlobals,
            },
        },
        plugins: {
            '@typescript-eslint': typescriptEslint,
        },
        rules: {
            ...sprykerBaseRules,
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'accessor-pairs': [
                'error',
                {
                    setWithoutGet: true,
                    enforceForClassMembers: false,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'none',
                    ignoreRestSiblings: true,
                },
            ],
            '@typescript-eslint/no-empty-function': [
                'error',
                {
                    allow: ['methods'],
                },
            ],
            '@typescript-eslint/no-magic-numbers': [
                'error',
                {
                    ignore: [-1, 0, 1],
                    ignoreDefaultValues: true,
                    ignoreClassFieldInitialValues: true,
                    ignoreArrayIndexes: true,
                    ignoreEnums: true,
                    ignoreReadonlyClassProperties: true,
                },
            ],
        },
    },
];
