import Component from 'ShopUi/models/component';

export const EVENT_SELECTION_CHANGE = 'advanced-table-selection-change';

/**
 * @event advanced-table-selection-change A bubbling event fired by a selectable checkbox when its state changes.
 */
export default class AdvancedTableCheckboxCell extends Component {
    protected input: HTMLInputElement;
    protected table: HTMLElement | null;
    protected isUpdatingRows = false;

    protected init(): void {
        this.input = this.querySelector<HTMLInputElement>(`.${this.jsName}__input`);
        this.table = this.closest('table');

        if (!this.input) {
            return;
        }

        if (this.mode === this.getAttribute('mode-select')) {
            this.syncRow();
            this.input.addEventListener('change', () => this.onSelectChange());
        }

        if (this.mode === this.getAttribute('mode-head')) {
            this.syncHead();
            this.input.addEventListener('change', () => this.onHeadChange());
            this.table?.addEventListener(EVENT_SELECTION_CHANGE, () => this.onRowSelectionChange());
        }
    }

    protected onRowSelectionChange(): void {
        if (!this.isUpdatingRows) {
            this.syncHead();
        }
    }

    protected onSelectChange(): void {
        this.syncRow();
        this.dispatchEvent(
            new CustomEvent(EVENT_SELECTION_CHANGE, {
                bubbles: true,
                detail: { checked: this.input.checked, row: this.closest('tr') },
            }),
        );
    }

    protected syncRow(): void {
        this.closest('tr')?.classList.toggle('advanced-table__row--selected', this.input.checked);
    }

    protected onHeadChange(): void {
        const isChecked = this.input.checked;

        this.isUpdatingRows = true;
        this.getRowInputs().forEach((input: HTMLInputElement) => {
            if (input.disabled || input.checked === isChecked) {
                return;
            }

            input.checked = isChecked;
            input.dispatchEvent(new Event('change'));
        });
        this.isUpdatingRows = false;

        this.syncHead();
    }

    protected syncHead(): void {
        const inputs = this.getRowInputs().filter((input: HTMLInputElement) => !input.disabled);
        const checkedCount = inputs.filter((input: HTMLInputElement) => input.checked).length;

        this.input.checked = inputs.length > 0 && checkedCount === inputs.length;
        this.input.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
    }

    protected getRowInputs(): HTMLInputElement[] {
        if (!this.table) {
            return [];
        }

        return Array.from(
            this.table.querySelectorAll<HTMLInputElement>(
                `.${this.jsName}__input--${this.getAttribute('mode-select')}`,
            ),
        );
    }

    protected get mode(): string {
        return this.getAttribute('mode') ?? '';
    }
}
