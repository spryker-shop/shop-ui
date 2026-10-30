import { describe, it, expect } from '@jest/globals';
import { buildDefinitionsView } from '../libs/sass/definitions-view.mts';

const keptStatements = (source: string): string[] =>
    buildDefinitionsView(source)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

describe('definitions view of a component style file', () => {
    it('keeps module loads, mixins, functions and variables', () => {
        const source = [
            "@use 'sass:map';",
            "@import 'partial';",
            '$size: 10px;',
            'config.$gap: 2px;',
            '@function double($value) { @return $value * 2; }',
            '@mixin box { .box { width: $size; } }',
        ].join('\n');

        expect(buildDefinitionsView(source)).toBe(source);
    });

    it('blanks out top-level includes, style rules and output at-rules', () => {
        const source = [
            '@mixin box { .box { width: 1px; } }',
            '@include box;',
            '.rule { color: red; }',
            '@media (min-width: 1px) { .rule { color: blue; } }',
            '@include box { color: green; }',
            '@if true { .conditional { color: black; } }',
        ].join('\n');

        expect(keptStatements(source)).toEqual(['@mixin box { .box { width: 1px; } }']);
    });

    it('blanks out an @import that compiles to a plain CSS import', () => {
        const source = ["@import 'vendor/library.css';", "@import url('https://example.com/font.css');"].join('\n');

        expect(keptStatements(source)).toEqual([]);
    });

    it('keeps a placeholder rule and blanks out a rule that mixes a placeholder with a class', () => {
        const source = ['%placeholder { color: red; }', '%mixed, .visible { color: blue; }'].join('\n');

        expect(keptStatements(source)).toEqual(['%placeholder { color: red; }']);
    });

    it('ends an interpolated selector rule at its block brace, not at the interpolation brace', () => {
        const source = ['#{$name}__icon { width: 1px; }', '$after: 1;'].join('\n');

        expect(keptStatements(source)).toEqual(['$after: 1;']);
    });

    it('steps over braces and semicolons inside strings, comments and unquoted urls', () => {
        const source = [
            '.rule { content: "};"; background: url(//cdn.example.com/a;b.png); }',
            '// } stray brace in a comment',
            '/* ; */ $kept: 1;',
        ].join('\n');

        expect(keptStatements(source)).toEqual(['// } stray brace in a comment', '/* ; */ $kept: 1;']);
    });

    it('preserves every line and column of the kept statements', () => {
        const source = ['.rule {', '    color: red;', '}', '@mixin box {', '    width: 1px;', '}'].join('\n');
        const view = buildDefinitionsView(source);

        expect(view.split('\n')).toHaveLength(6);
        expect(view.length).toBe(source.length);
        expect(view.indexOf('@mixin box')).toBe(source.indexOf('@mixin box'));
    });
});
