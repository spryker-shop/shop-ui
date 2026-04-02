<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Plugin\Twig;

use Spryker\Service\Container\ContainerInterface;
use Spryker\Shared\TwigExtension\Dependency\Plugin\TwigPluginInterface;
use Spryker\Yves\Kernel\AbstractPlugin;
use Twig\Environment;

/**
 * @method \SprykerShop\Yves\ShopUi\ShopUiFactory getFactory()
 */
class ShopUiTwigPlugin extends AbstractPlugin implements TwigPluginInterface
{
    /**
     * {@inheritDoc}
     * - Extends Twig environment with functions `publicPath`, `qa`, `qa_*`, `model`, `atom`, `molecule`, `organism`, `template`, `view` and filter `trimLocale`.
     * - Also provides function `configurationValue` to retrieve any module configuration value in storefront.
     * - Also provides function `configurationValues` to retrieve all module configuration values under a key prefix in storefront.
     *
     * @api
     *
     * @param \Twig\Environment $twig
     * @param \Spryker\Service\Container\ContainerInterface $container
     *
     * @return \Twig\Environment
     */
    public function extend(Environment $twig, ContainerInterface $container): Environment
    {
        $twig->addExtension($this->getFactory()->createShopUiTwigExtension());
        $twig->addFunction($this->getFactory()->createConfigurationValueTwigFunction());
        $twig->addFunction($this->getFactory()->createConfigurationValuesTwigFunction());

        return $twig;
    }
}
