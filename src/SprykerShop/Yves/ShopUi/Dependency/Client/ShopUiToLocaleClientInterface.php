<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Dependency\Client;

interface ShopUiToLocaleClientInterface
{
    /**
     * @return string
     */
    public function getCurrentLocale();
}
