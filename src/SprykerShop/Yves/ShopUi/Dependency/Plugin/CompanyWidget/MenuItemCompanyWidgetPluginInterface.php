<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Dependency\Plugin\CompanyWidget;

use Spryker\Yves\Kernel\Dependency\Plugin\WidgetPluginInterface;

/**
 * @deprecated Use {@link \SprykerShop\Yves\CompanyWidget\Widget\CompanyMenuItemWidget} instead.
 */
interface MenuItemCompanyWidgetPluginInterface extends WidgetPluginInterface
{
    /**
     * @var string
     */
    public const NAME = 'MenuItemCompanyWidgetPlugin';

    /**
     * @api
     *
     * @return void
     */
    public function initialize(): void;
}
