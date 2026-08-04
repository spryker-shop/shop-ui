import Component from '../../../models/component';

export default class TogglerClick extends Component {
    protected triggersList: HTMLElement[];
    protected targetsList: HTMLElement[];

    protected init(): void {
        this.triggersList = <HTMLElement[]>Array.from(document.getElementsByClassName(this.triggerClassName));
        this.targetsList = <HTMLElement[]>Array.from(document.getElementsByClassName(this.targetClassName));

        this.mapEvents();
    }

    protected mapEvents(): void {
        this.triggersList.forEach((trigger: HTMLElement) => {
            trigger.addEventListener('click', (event: Event) => this.onTriggerClick(event));
        });
    }

    protected onTriggerClick(event: Event): void {
        event.preventDefault();
        this.toggle();
    }

    /**
     * Toggles the class names in the target elements.
     */
    toggle(): void {
        this.targetsList.forEach((target: HTMLElement) => {
            const addClass = !target.classList.contains(this.classToToggle);
            target.classList.toggle(this.classToToggle, addClass);
        });
    }

    protected get triggerClassName(): string {
        return this.getAttribute('trigger-class-name');
    }

    protected get targetClassName(): string {
        return this.getAttribute('target-class-name');
    }

    /**
     * Gets a class name for the toggle action.
     */
    get classToToggle(): string {
        return this.getAttribute('class-to-toggle');
    }
}
