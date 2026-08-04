import { EVENT_UPDATE_DYNAMIC_MESSAGES } from 'ShopUi/components/organisms/dynamic-notification-area/dynamic-notification-area';
import { mount } from '../../../app';
import Component from '../../../models/component';
import AjaxProvider, { EVENT_FETCHED } from '../ajax-provider/ajax-provider';

export default class AjaxRenderer extends Component {
    protected parent: HTMLElement;
    protected provider: AjaxProvider;
    protected target: HTMLElement;

    protected init(): void {
        this.parent = <HTMLElement>(this.parentClassName ? this.closest(`.${this.parentClassName}`) : document);
        this.provider = <AjaxProvider>this.parent.getElementsByClassName(this.providerClassName)[0];
        this.target = <HTMLElement>this.parent.getElementsByClassName(this.targetClassName)[0];

        this.mapEvents();
    }

    protected mapEvents(): void {
        this.provider.addEventListener(EVENT_FETCHED, () => this.onFetched());
    }

    protected onFetched(): void {
        this.render();
    }

    /**
     * Gets a response from the server and renders it on the page.
     */
    render(): void {
        let response = this.provider.xhr.response;

        if (!response && !this.renderIfResponseIsEmpty) {
            return;
        }

        const holder = this.target ?? this;

        if (this.provider.xhr.getResponseHeader('Content-Type') === 'application/json') {
            const parsedResponse = JSON.parse(response);

            if (parsedResponse.messages) {
                const dynamicNotificationCustomEvent = new CustomEvent(EVENT_UPDATE_DYNAMIC_MESSAGES, {
                    detail: parsedResponse.messages,
                });
                document.dispatchEvent(dynamicNotificationCustomEvent);
            }

            if (!parsedResponse.content) {
                return;
            }

            response = parsedResponse.content;
        }

        holder.innerHTML = response;

        if (this.mountAfterRender) {
            mount();
        }
    }

    protected get providerClassName(): string {
        return this.getAttribute('provider-class-name');
    }

    protected get targetClassName(): string {
        return this.getAttribute('target-class-name');
    }

    protected get parentClassName(): string {
        return this.getAttribute('parent-class-name');
    }

    /**
     * Gets if the response from the server is empty.
     */
    get renderIfResponseIsEmpty(): boolean {
        return this.hasAttribute('render-if-response-is-empty');
    }

    /**
     * Gets if the component is mounted after rendering.
     */
    get mountAfterRender(): boolean {
        return this.hasAttribute('mount-after-render');
    }
}
