<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShopTest\Yves\ShopUi\Twig\Assets;

use Codeception\Test\Unit;
use Generated\Shared\Transfer\StoreTransfer;
use Spryker\Client\Store\StoreClientInterface;
use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToTwigClientInterface;
use SprykerShop\Yves\ShopUi\ShopUiConfig;
use SprykerShop\Yves\ShopUi\Twig\Assets\AssetsUrlProvider;

/**
 * Auto-generated group annotations
 *
 * @group SprykerShopTest
 * @group Yves
 * @group ShopUi
 * @group Twig
 * @group Assets
 * @group AssetsUrlProviderTest
 * Add your own group annotations below this line
 */
class AssetsUrlProviderTest extends Unit
{
    protected const string THEME_NAME = 'default';

    protected const string STORE_NAME = 'DE';

    public function testGetAssetsUrlReplacesThemePlaceholderWithoutTouchingStoreClient(): void
    {
        $storeClientMock = $this->createMock(StoreClientInterface::class);
        $storeClientMock->expects($this->never())->method('getCurrentStore');

        $assetsUrlProvider = $this->createAssetsUrlProvider('/assets/%theme%', static::THEME_NAME, $storeClientMock);

        $assetsUrl = $assetsUrlProvider->getAssetsUrl();

        $this->assertSame('/assets/' . static::THEME_NAME . '/', $assetsUrl);
    }

    public function testGetAssetsUrlFallsBackToDefaultThemeWhenCurrentThemeIsEmpty(): void
    {
        $assetsUrlProvider = $this->createAssetsUrlProvider('/assets/%theme%', '');

        $assetsUrl = $assetsUrlProvider->getAssetsUrl();

        $this->assertSame('/assets/default-theme/', $assetsUrl);
    }

    public function testGetAssetsUrlReplacesNamespacePlaceholderWithCurrentStoreNameWhenStoreHasABuiltNamespace(): void
    {
        $assetsUrlProvider = $this->createAssetsUrlProvider('/assets/%namespace%/%theme%', static::THEME_NAME, null, [static::STORE_NAME]);

        $assetsUrl = $assetsUrlProvider->getAssetsUrl();

        $this->assertSame('/assets/' . static::STORE_NAME . '/' . static::THEME_NAME . '/', $assetsUrl);
    }

    public function testGetAssetsUrlStripsNamespaceSegmentWhenCurrentStoreHasNoBuiltNamespace(): void
    {
        $assetsUrlProvider = $this->createAssetsUrlProvider('/assets/%namespace%/%theme%', static::THEME_NAME, null, []);

        $assetsUrl = $assetsUrlProvider->getAssetsUrl();

        $this->assertSame('/assets/' . static::THEME_NAME . '/', $assetsUrl);
    }

    public function testGetAssetsUrlStripsTrailingNamespaceSegmentWhenCurrentStoreHasNoBuiltNamespace(): void
    {
        $assetsUrlProvider = $this->createAssetsUrlProvider('/assets/%theme%/%namespace%', static::THEME_NAME, null, []);

        $assetsUrl = $assetsUrlProvider->getAssetsUrl();

        $this->assertSame('/assets/' . static::THEME_NAME . '/', $assetsUrl);
    }

    /**
     * @param array<string> $assetsNamespaces
     */
    protected function createAssetsUrlProvider(
        string $pattern,
        string $currentThemeName,
        ?StoreClientInterface $storeClientMock = null,
        array $assetsNamespaces = []
    ): AssetsUrlProvider {
        $shopUiConfigMock = $this->createMock(ShopUiConfig::class);
        $shopUiConfigMock->method('getYvesAssetsUrlPattern')->willReturn($pattern);
        $shopUiConfigMock->method('getYvesAssetsNamespaces')->willReturn($assetsNamespaces);

        $twigClientMock = $this->createMock(ShopUiToTwigClientInterface::class);
        $twigClientMock->method('getYvesThemeName')->willReturn($currentThemeName);
        $twigClientMock->method('getYvesThemeNameDefault')->willReturn('default-theme');

        $storeClientMock ??= $this->createStoreClientMock();

        return new AssetsUrlProvider($shopUiConfigMock, $twigClientMock, $storeClientMock);
    }

    protected function createStoreClientMock(): StoreClientInterface
    {
        $storeClientMock = $this->createMock(StoreClientInterface::class);
        $storeClientMock->method('getCurrentStore')->willReturn((new StoreTransfer())->setName(static::STORE_NAME));

        return $storeClientMock;
    }
}
