import Component from '../../../models/component';
import AjaxProvider from '../ajax-provider/ajax-provider';

export default class AjaxRenderer extends Component {
    protected provider: AjaxProvider
    protected target: HTMLElement

    protected readyCallback(): void {
        this.provider = <AjaxProvider>document.querySelector(this.providerSelector);
        this.target = !!this.targetSelector ? <HTMLElement>document.querySelector(this.targetSelector) : null;
        this.mapEvents();
    }

    protected mapEvents(): void {
        this.provider.addEventListener('fetched', (event: Event) => this.onFetched(event));
    }

    protected onFetched(event: Event): void {
        this.render();
    }

    render(): void {
        const response = this.provider.xhr.response;

        if (!response && !this.renderIfResponseIsEmpty) {
            return;
        }

        if (!!this.target) {
            this.target.innerHTML = response;
            return;
        }

        this.innerHTML = response;
    }

    get providerSelector(): string {
        return this.getAttribute('provider-selector') || '';
    }

    get targetSelector(): string {
        return this.getAttribute('target-selector') || '';
    }

    get renderIfResponseIsEmpty(): boolean {
        return this.hasAttribute('render-if-response-is-empty');
    }
}