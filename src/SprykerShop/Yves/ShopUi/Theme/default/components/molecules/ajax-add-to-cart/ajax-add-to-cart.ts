import { error } from 'ShopUi/app/logger';
import { EVENT_UPDATE_CART_QUANTITY } from 'ShopUi/components/molecules/cart-counter/cart-counter';
import { EVENT_UPDATE_DYNAMIC_MESSAGES } from 'ShopUi/components/organisms/dynamic-notification-area/dynamic-notification-area';
import Component from 'ShopUi/models/component';

export default class AjaxAddToCart extends Component {
    protected button: HTMLButtonElement;

    protected readyCallback(): void {}

    protected init(): void {
        this.button = <HTMLButtonElement>this.getElementsByClassName(`${this.jsName}__button`)[0];
        this.mapEvents();
        this.enableButton();
    }

    // The button is server-rendered disabled so that clicks arriving before the click handler
    // is attached cannot be silently lost; it becomes clickable only once the handler is live.
    protected enableButton(): void {
        if (!this.button.hasAttribute('data-enable-on-init')) {
            return;
        }

        this.button.disabled = false;
        this.button.removeAttribute('data-enable-on-init');
    }

    protected mapEvents(): void {
        this.mapButtonClickEvent();
    }

    protected mapButtonClickEvent(): void {
        this.button.addEventListener('click', (event: Event) => this.onClick(event));
    }

    protected onClick(event: Event): void {
        event.preventDefault();

        this.sendRequest();
    }

    protected async sendRequest(): Promise<void> {
        const formData = new FormData();

        formData.append('_token', this.button.dataset.csrfToken);
        formData.append('quantity', this.button.dataset.quantity);
        formData.append('separate_product', this.button.dataset.separateProduct);

        try {
            const response = await fetch(this.button.dataset.url, { method: 'POST', body: formData });
            const parsedResponse = await response.json();

            if (!parsedResponse.messages) {
                return;
            }
            const dynamicNotificationCustomEvent = new CustomEvent(EVENT_UPDATE_DYNAMIC_MESSAGES, {
                detail: parsedResponse.messages,
            });
            document.dispatchEvent(dynamicNotificationCustomEvent);

            const cartCounterCustomEvent = new CustomEvent(EVENT_UPDATE_CART_QUANTITY, {
                detail: parsedResponse.quantityFormatted,
            });
            document.dispatchEvent(cartCounterCustomEvent);

            if (this.eventRevealer) {
                document.dispatchEvent(new CustomEvent(this.eventRevealer));
            }
        } catch (event) {
            error(event);
        }
    }

    /**
     * Gets event which should be dispatched after the fetch operation.
     */
    get eventRevealer(): string | null {
        return this.getAttribute('event-revealer');
    }
}
