<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Twig;

use Spryker\Shared\Twig\TwigFunctionProvider;
use SprykerShop\Yves\ShopUi\ShopUiConfig;

class ConfigurationValuesTwigFunctionProvider extends TwigFunctionProvider
{
    protected const string FUNCTION_NAME = 'configurationValues';

    public function __construct(protected ShopUiConfig $config)
    {
    }

    public function getFunctionName(): string
    {
        return static::FUNCTION_NAME;
    }

    public function getFunction(): callable
    {
        return function (string $prefix): array {
            return $this->config->getModuleConfigValues($prefix);
        };
    }
}
