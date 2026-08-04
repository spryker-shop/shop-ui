// State-preserving reload helpers, split out of reload-client.ts so both files stay within the Yves
// TypeScript max-lines budget. This is bundle code (component-style TypeScript compiled by the
// babel-loader pipeline), NOT builder-executed code: no node: imports and no .mts. reload-client.ts
// imports it and is itself only part of an entry when the development-watch config injects it, so
// production/one-shot bundles never contain this file.

// State-preserving reload (dev-only UX). On a full reload the page still re-executes JS from scratch
// (this is not module HMR); we merely snapshot generic UI state before the reload and reapply it
// after, so a developer editing Twig/JS does not lose scroll position, typed-in form values, or
// focus. Everything here is fully generic — no per-component knowledge — and every DOM/sessionStorage
// access degrades to a plain reload on failure, preserving the client's silent contract.

const PRESERVED_STATE_STORAGE_KEY = '__yves_dev_reload_state__';

// Values of these input types are deliberately never persisted: passwords and hidden fields carry
// secrets / CSRF tokens we must not stash in sessionStorage, and file inputs cannot be restored.
const SKIPPED_INPUT_TYPES = new Set(['password', 'hidden', 'file']);

interface PreservedFieldState {
    selector: string;
    value: string;
    // Only meaningful when `isCheckable` is true; `value` carries the state for every other field.
    checked: boolean;
    isCheckable: boolean;
}

interface PreservedFocusState {
    selector: string;
    selectionStart: number | null;
    selectionEnd: number | null;
}

export interface PreservedState {
    scrollX: number;
    scrollY: number;
    fields: PreservedFieldState[];
    focus: PreservedFocusState | null;
}

// A double-quoted CSS attribute-value string only needs backslashes and double quotes escaped; using
// CSS.escape here would be wrong because it escapes for identifier context, not quoted-string context.
const escapeAttributeValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Builds a `tag:nth-of-type(n)` chain up to `document.body` or the nearest id'd ancestor, which anchors
// the path so it stays short and stable. Returns null only when the element is not connected to body
// through such a chain (detached subtree) — genuinely unaddressable.
const buildStructuralSelector = (element: Element): string | null => {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current !== null && current !== document.body) {
        if (current.id !== '') {
            segments.unshift(`#${CSS.escape(current.id)}`);

            return segments.join(' > ');
        }

        const parent: Element | null = current.parentElement;

        if (parent === null) {
            return null;
        }

        let nthOfType = 1;
        let sibling: Element | null = current.previousElementSibling;

        while (sibling !== null) {
            if (sibling.tagName === current.tagName) {
                nthOfType += 1;
            }

            sibling = sibling.previousElementSibling;
        }

        segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${nthOfType})`);
        current = parent;
    }

    if (current === document.body) {
        segments.unshift('body');

        return segments.join(' > ');
    }

    return null;
};

const buildSelector = (element: Element): string | null => {
    if (element.id !== '') {
        return `#${CSS.escape(element.id)}`;
    }

    const name = element.getAttribute('name');

    if (name !== null && name !== '') {
        const nameSelector = `[name="${escapeAttributeValue(name)}"]`;

        if (document.querySelectorAll(nameSelector).length === 1) {
            return nameSelector;
        }
    }

    return buildStructuralSelector(element);
};

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isSkippedInput = (element: FieldElement): boolean =>
    element instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(element.type);

const isCheckableInput = (element: FieldElement): boolean =>
    element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio');

const captureFocus = (): PreservedFocusState | null => {
    const active = document.activeElement;

    if (active === null || active === document.body) {
        return null;
    }

    const selector = buildSelector(active);

    if (selector === null) {
        return null;
    }

    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;

    try {
        // selectionStart/End exist only for text-like inputs and textareas; reading them on a
        // number/checkbox input throws InvalidStateError, so any failure means "no text selection".
        const textField = active as HTMLInputElement | HTMLTextAreaElement;

        if (typeof textField.selectionStart === 'number') {
            selectionStart = textField.selectionStart;
            selectionEnd = textField.selectionEnd;
        }
    } catch {
        selectionStart = null;
        selectionEnd = null;
    }

    return { selector, selectionStart, selectionEnd };
};

export const captureState = (): PreservedState => {
    const fields: PreservedFieldState[] = [];
    const fieldElements = document.querySelectorAll<FieldElement>('input, textarea, select');

    for (const element of Array.from(fieldElements)) {
        if (isSkippedInput(element)) {
            continue;
        }

        const selector = buildSelector(element);

        if (selector === null) {
            continue;
        }

        const isCheckable = isCheckableInput(element);

        fields.push({
            selector,
            value: element.value,
            checked: isCheckable && (element as HTMLInputElement).checked,
            isCheckable,
        });
    }

    return {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        fields,
        focus: captureFocus(),
    };
};

export const reloadPreservingState = (): void => {
    try {
        sessionStorage.setItem(PRESERVED_STATE_STORAGE_KEY, JSON.stringify(captureState()));
    } catch {
        // sessionStorage can throw in private mode, when disabled, or on quota. A dev soft-reload must
        // still reload — just without state restoration. Silent by the client's contract.
    }

    window.location.reload();
};

const restoreFields = (fields: PreservedFieldState[]): void => {
    for (const field of fields) {
        // Best-effort restore: after a Twig edit the markup may differ, so a field whose selector no
        // longer resolves is silently skipped (no console output — silent client contract).
        const element = document.querySelector(field.selector);

        if (element === null) {
            continue;
        }

        if (field.isCheckable && element instanceof HTMLInputElement) {
            element.checked = field.checked;

            continue;
        }

        // Assigning .value does NOT fire input/change events, so components deriving state from those
        // events will not re-sync off the restored value. Accepted for a dev soft-reload; we do not
        // dispatch synthetic events because that risks side effects such as double-submit.
        if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
        ) {
            element.value = field.value;
        }
    }
};

const restoreFocus = (focus: PreservedFocusState | null): void => {
    if (focus === null) {
        return;
    }

    const element = document.querySelector(focus.selector);

    if (!(element instanceof HTMLElement)) {
        return;
    }

    element.focus();

    if (focus.selectionStart === null || focus.selectionEnd === null) {
        return;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        try {
            element.setSelectionRange(focus.selectionStart, focus.selectionEnd);
        } catch {
            // setSelectionRange throws on inputs that do not support text selection (e.g. number);
            // focus itself is already restored, so the range failure is ignored silently.
        }
    }
};

export const restorePreservedState = (): void => {
    let serialized: string | null;

    try {
        serialized = sessionStorage.getItem(PRESERVED_STATE_STORAGE_KEY);
        sessionStorage.removeItem(PRESERVED_STATE_STORAGE_KEY);
    } catch {
        return;
    }

    if (serialized === null) {
        return;
    }

    let state: PreservedState;

    try {
        state = JSON.parse(serialized) as PreservedState;
    } catch {
        return;
    }

    restoreFields(state.fields);
    restoreFocus(state.focus);

    // Scroll is restored LAST and one frame later so restored field values and any synchronous layout
    // have settled; scrolling before layout stabilises would land on a stale offset.
    requestAnimationFrame(() => {
        window.scrollTo(state.scrollX, state.scrollY);
    });
};
