<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Twig\Assets;

use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToTwigClientInterface;
use SprykerShop\Yves\ShopUi\ShopUiConfig;

class AssetsUrlProvider implements AssetsUrlProviderInterface
{
    /**
     * @var string
     */
    protected const PLACEHOLDER_THEME = '%theme%';

    /**
     * @var \SprykerShop\Yves\ShopUi\ShopUiConfig
     */
    protected $config;

    /**
     * @var \SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToTwigClientInterface
     */
    protected $twigClient;

    public function __construct(
        ShopUiConfig $config,
        ShopUiToTwigClientInterface $twigClient
    ) {
        $this->config = $config;
        $this->twigClient = $twigClient;
    }

    public function getAssetsUrl(): string
    {
        $yvesAssetsUrl = strtr($this->config->getYvesAssetsUrlPattern(), [
            static::PLACEHOLDER_THEME => $this->getThemeName(),
        ]);

        return rtrim($yvesAssetsUrl, '/') . '/';
    }

    protected function getThemeName(): string
    {
        $themeName = $this->twigClient->getYvesThemeName();

        if (!$themeName) {
            $themeName = $this->twigClient->getYvesThemeNameDefault();
        }

        return $themeName;
    }
}
