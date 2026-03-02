<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Form\Type;

use Symfony\Component\Form\Extension\Core\Type\NumberType;

/**
 * @method \SprykerShop\Yves\ShopUi\ShopUiFactory getFactory()
 * @method \SprykerShop\Yves\ShopUi\ShopUiConfig getConfig()
 */
class FormattedIntegerType extends AbstractFormattedType
{
    public function getParent(): string
    {
        return NumberType::class;
    }

    public function getBlockPrefix(): string
    {
        return 'formatted_integer';
    }
}
