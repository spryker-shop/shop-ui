<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Twig\Assets;

use Spryker\Client\Store\StoreClientInterface;
use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToTwigClientInterface;
use SprykerShop\Yves\ShopUi\ShopUiConfig;

class AssetsUrlProvider implements AssetsUrlProviderInterface
{
    protected const string PLACEHOLDER_THEME = '%theme%';

    protected const string PLACEHOLDER_NAMESPACE = '%namespace%';

    protected ShopUiConfig $config;

    protected ShopUiToTwigClientInterface $twigClient;

    protected StoreClientInterface $storeClient;

    public function __construct(
        ShopUiConfig $config,
        ShopUiToTwigClientInterface $twigClient,
        StoreClientInterface $storeClient
    ) {
        $this->config = $config;
        $this->twigClient = $twigClient;
        $this->storeClient = $storeClient;
    }

    public function getAssetsUrl(): string
    {
        $yvesAssetsUrl = strtr($this->getNamespaceResolvedPattern(), [
            static::PLACEHOLDER_THEME => $this->getThemeName(),
        ]);

        return rtrim($yvesAssetsUrl, '/') . '/';
    }

    protected function getNamespaceResolvedPattern(): string
    {
        $pattern = $this->config->getYvesAssetsUrlPattern();

        if (!str_contains($pattern, static::PLACEHOLDER_NAMESPACE)) {
            return $pattern;
        }

        $storeName = $this->getStoreName();
        if (in_array($storeName, $this->config->getYvesAssetsNamespaces(), true)) {
            return strtr($pattern, [static::PLACEHOLDER_NAMESPACE => $storeName]);
        }

        return (string)preg_replace('#/?' . preg_quote(static::PLACEHOLDER_NAMESPACE, '#') . '/?#', '/', $pattern);
    }

    protected function getThemeName(): string
    {
        $themeName = $this->twigClient->getYvesThemeName();

        if (!$themeName) {
            $themeName = $this->twigClient->getYvesThemeNameDefault();
        }

        return $themeName;
    }

    protected function getStoreName(): string
    {
        return $this->storeClient->getCurrentStore()->getNameOrFail();
    }
}
