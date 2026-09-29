import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import { buildYvesThemePattern, getOwnedSourceRoots, loadProjectGlobalSettings } from '../../settings.mts';

const globalSettings = await loadProjectGlobalSettings();

// The owned Yves roots differ per source layout, so the patterns are derived from them.
const typeScriptFilePatterns = getOwnedSourceRoots(globalSettings).map((sourceRoot) =>
    buildYvesThemePattern(sourceRoot, '*.ts').replace(/^\.\//, ''),
);

const yvesGlobals = {
    document: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    window: 'readonly',
    $: 'readonly',
    jQuery: 'readonly',
    SprykerAjax: 'readonly',
    SprykerAlert: 'readonly',
    SprykerAjaxCallbacks: 'readonly',
    confirm: 'readonly',
    alert: 'readonly',
    localStorage: 'readonly',
    antelope: 'readonly',
    Event: 'readonly',
    CustomEvent: 'readonly',
    swal: 'readonly',
    DEV: 'readonly',
};

// Shared by the JavaScript and TypeScript blocks; each adds its own undefined/unused checks.
const yvesRules = {
    'accessor-pairs': [
        'error',
        {
            setWithoutGet: true,
            enforceForClassMembers: false,
        },
    ],
    camelcase: [
        'error',
        {
            properties: 'always',
        },
    ],
    eqeqeq: [
        'error',
        'always',
        {
            null: 'ignore',
        },
    ],
    'handle-callback-err': ['error', '^(err|error)$'],
    'max-lines': [
        'error',
        {
            max: 200,
            skipBlankLines: true,
            skipComments: true,
        },
    ],
    'new-cap': [
        'error',
        {
            newIsCap: true,
            capIsNew: false,
        },
    ],
    'no-array-constructor': 'error',
    'no-caller': 'error',
    'no-compare-neg-zero': 'error',
    'no-cond-assign': ['error', 'always'],
    'no-console': 'error',
    'no-constant-condition': [
        'error',
        {
            checkLoops: false,
        },
    ],
    'no-control-regex': 'error',
    'no-debugger': 'error',
    'no-delete-var': 'error',
    'no-dupe-args': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-empty-character-class': 'error',
    'no-empty-pattern': 'error',
    'no-eval': 'error',
    'no-ex-assign': 'error',
    'no-extra-bind': 'error',
    'no-extra-boolean-cast': 'off',
    'no-fallthrough': 'error',
    'no-func-assign': 'error',
    'no-global-assign': 'error',
    'no-implied-eval': 'error',
    'no-inner-declarations': ['error', 'functions'],
    'no-invalid-regexp': 'error',
    'no-irregular-whitespace': [
        'error',
        {
            skipStrings: true,
            skipTemplates: true,
        },
    ],
    'no-iterator': 'error',
    'no-label-var': 'error',
    'no-labels': [
        'error',
        {
            allowLoop: false,
            allowSwitch: false,
        },
    ],
    'no-lone-blocks': 'error',
    'no-multi-str': 'error',
    'no-negated-in-lhs': 'error',
    'no-new-func': 'error',
    'no-new-object': 'error',
    'no-new-require': 'error',
    'no-new-wrappers': 'error',
    'no-obj-calls': 'error',
    'no-octal': 'error',
    'no-octal-escape': 'error',
    'no-path-concat': 'error',
    'no-proto': 'error',
    'no-prototype-builtins': 'off',
    'no-redeclare': 'error',
    'no-regex-spaces': 'error',
    'no-return-assign': ['error', 'except-parens'],
    'no-return-await': 'error',
    'no-self-assign': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-shadow-restricted-names': 'error',
    'no-sparse-arrays': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-undef-init': 'error',
    'no-unexpected-multiline': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unneeded-ternary': ['error'],
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-negation': 'error',
    'no-unused-expressions': [
        'error',
        {
            allowShortCircuit: true,
            allowTernary: true,
            allowTaggedTemplates: true,
        },
    ],
    'no-use-before-define': [
        'error',
        {
            functions: false,
            classes: false,
            variables: false,
        },
    ],
    'no-useless-call': 'error',
    'no-useless-escape': 'error',
    'no-useless-return': 'error',
    'no-with': 'error',
    'one-var': [
        'error',
        {
            initialized: 'never',
        },
    ],
    'prefer-promise-reject-errors': 'error',
    'spaced-comment': [
        'error',
        'always',
        {
            line: {
                markers: ['*package', '!', '/', ',', '='],
            },
            block: {
                balanced: true,
                markers: ['*package', '!', ',', ':', '::', 'flow-include'],
                exceptions: ['*'],
            },
        },
    ],
    'unicode-bom': ['error', 'never'],
    'use-isnan': 'error',
    'valid-typeof': [
        'error',
        {
            requireStringLiterals: true,
        },
    ],
    'wrap-iife': [
        'error',
        'any',
        {
            functionPrototypeMethods: true,
        },
    ],
    yoda: ['error', 'never'],
};

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
            globals: yvesGlobals,
        },
        rules: {
            ...yvesRules,
            'no-undef': 'error',
            'no-unused-vars': [
                'error',
                {
                    vars: 'all',
                    args: 'after-used',
                },
            ],
        },
    },
    {
        files: typeScriptFilePatterns,
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                project: [globalSettings.paths.tsConfig],
            },
            globals: yvesGlobals,
        },
        plugins: {
            '@typescript-eslint': typescriptEslint,
        },
        rules: {
            ...yvesRules,
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
