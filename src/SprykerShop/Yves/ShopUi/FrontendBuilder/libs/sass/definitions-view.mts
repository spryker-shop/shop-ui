// Sass has no "load members only" form, so a component loaded by another component is served with its
// top-level CSS output blanked out. Blanking keeps lines and columns for errors and source maps.

const MEMBER_AT_RULE_NAMES = new Set(['use', 'forward', 'import', 'mixin', 'function', 'debug', 'warn', 'error']);
const PLAIN_CSS_IMPORT_PATTERN = /^@import\s+(?:url\(|['"](?:[^'"]*\.css|https?:\/\/[^'"]*)['"])/i;
const MODULE_VARIABLE_ASSIGNMENT_PATTERN = /^[\w-]+\.\$/;
const UNQUOTED_URL_PATTERN = /url\(\s*(?!['"])[^)]*\)/iy;

const isPlaceholderOnlyRule = (statement: string): boolean =>
    statement
        .slice(0, statement.indexOf('{'))
        .split(',')
        .every((selectorPart) => selectorPart.trim().startsWith('%'));

const isMemberStatement = (statement: string): boolean => {
    if (statement.startsWith('$') || MODULE_VARIABLE_ASSIGNMENT_PATTERN.test(statement)) {
        return true;
    }

    if (statement.startsWith('%')) {
        return isPlaceholderOnlyRule(statement);
    }

    const atRuleName = /^@([\w-]+)/.exec(statement)?.[1];

    if (!atRuleName || !MEMBER_AT_RULE_NAMES.has(atRuleName)) {
        return false;
    }

    return atRuleName !== 'import' || !PLAIN_CSS_IMPORT_PATTERN.test(statement);
};

const findOpaqueSpanEnd = (source: string, index: number): number | null => {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '/' && nextCharacter === '/') {
        const lineEnd = source.indexOf('\n', index);

        return lineEnd === -1 ? source.length : lineEnd;
    }

    if (character === '/' && nextCharacter === '*') {
        const commentEnd = source.indexOf('*/', index + 2);

        return commentEnd === -1 ? source.length : commentEnd + 2;
    }

    if (character === '"' || character === "'") {
        let cursor = index + 1;

        while (cursor < source.length && source[cursor] !== character) {
            cursor += source[cursor] === '\\' ? 2 : 1;
        }

        return Math.min(cursor + 1, source.length);
    }

    if (character === 'u' || character === 'U') {
        UNQUOTED_URL_PATTERN.lastIndex = index;

        return UNQUOTED_URL_PATTERN.test(source) ? UNQUOTED_URL_PATTERN.lastIndex : null;
    }

    return null;
};

const blankOut = (text: string): string => text.replace(/[^\n]/g, ' ');

export const buildDefinitionsView = (source: string): string => {
    let view = '';
    let statementStart: number | null = null;
    const openBraces: Array<'block' | 'interpolation'> = [];
    let parenthesisDepth = 0;
    let index = 0;

    const closeStatement = (statementEnd: number): void => {
        const statement = source.slice(statementStart ?? statementEnd, statementEnd);
        view += isMemberStatement(statement) ? statement : blankOut(statement);
        statementStart = null;
    };

    const trackNesting = (character: string): boolean => {
        if (character === '{') {
            openBraces.push('block');

            return false;
        }

        if (character === '}') {
            return openBraces.pop() === 'block' && openBraces.length === 0;
        }

        if (character === '(') {
            parenthesisDepth += 1;

            return false;
        }

        if (character === ')') {
            parenthesisDepth = Math.max(0, parenthesisDepth - 1);

            return false;
        }

        return character === ';' && openBraces.length === 0 && parenthesisDepth === 0;
    };

    while (index < source.length) {
        const opaqueSpanEnd = findOpaqueSpanEnd(source, index);

        if (opaqueSpanEnd !== null) {
            if (statementStart === null) {
                view += source.slice(index, opaqueSpanEnd);
            }

            index = opaqueSpanEnd;
            continue;
        }

        const character = source[index];

        if (statementStart === null) {
            if (/\s/.test(character)) {
                view += character;
                index += 1;
                continue;
            }

            statementStart = index;
        }

        if (character === '#' && source[index + 1] === '{') {
            openBraces.push('interpolation');
            index += 2;
            continue;
        }

        index += 1;

        if (trackNesting(character)) {
            closeStatement(index);
        }
    }

    if (statementStart !== null) {
        closeStatement(source.length);
    }

    return view;
};
