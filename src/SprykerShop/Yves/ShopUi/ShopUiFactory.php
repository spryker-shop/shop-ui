<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi;

use Spryker\Shared\Twig\TwigFunctionProvider;
use Spryker\Yves\Kernel\AbstractFactory;
use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToLocaleClientInterface;
use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToTwigClientInterface;
use SprykerShop\Yves\ShopUi\Dependency\Service\ShopUiToUtilNumberServiceInterface;
use SprykerShop\Yves\ShopUi\Dependency\Service\ShopUiToUtilSanitizeXssServiceInterface;
use SprykerShop\Yves\ShopUi\Extender\NumberFormatterTwigExtender;
use SprykerShop\Yves\ShopUi\Extender\NumberFormatterTwigExtenderInterface;
use SprykerShop\Yves\ShopUi\Filter\NumberFormatterTwigFilterFactory;
use SprykerShop\Yves\ShopUi\Filter\NumberFormatterTwigFilterFactoryInterface;
use SprykerShop\Yves\ShopUi\Form\Type\Extension\SanitizeXssTypeExtension;
use SprykerShop\Yves\ShopUi\Twig\Assets\AssetsUrlProvider;
use SprykerShop\Yves\ShopUi\Twig\Assets\AssetsUrlProviderInterface;
use SprykerShop\Yves\ShopUi\Twig\ConfigurationValuesTwigFunctionProvider;
use SprykerShop\Yves\ShopUi\Twig\ConfigurationValueTwigFunctionProvider;
use SprykerShop\Yves\ShopUi\Twig\ShopUiTwigExtension;
use SprykerShop\Yves\ShopUi\TwigFunction\NumberFormatterTwigFunctionFactory;
use SprykerShop\Yves\ShopUi\TwigFunction\NumberFormatterTwigFunctionFactoryInterface;
use Symfony\Component\Form\FormTypeExtensionInterface;
use Twig\TwigFunction;

/**
 * @method \SprykerShop\Yves\ShopUi\ShopUiConfig getConfig()
 */
class ShopUiFactory extends AbstractFactory
{
    /**
     * @return \Spryker\Shared\Twig\TwigExtension
     */
    public function createShopUiTwigExtension()
    {
        return new ShopUiTwigExtension(
            $this->getLocaleClient(),
            $this->getConfig(),
            $this->createAssetsUrlProvider(),
        );
    }

    public function createAssetsUrlProvider(): AssetsUrlProviderInterface
    {
        return new AssetsUrlProvider(
            $this->getConfig(),
            $this->getTwigClient(),
        );
    }

    public function createNumberFormatterTwigExtender(): NumberFormatterTwigExtenderInterface
    {
        return new NumberFormatterTwigExtender(
            $this->createNumberFormatterTwigFilterFactory(),
            $this->createNumberFormatterTwigFunctionFactory(),
        );
    }

    public function createNumberFormatterTwigFilterFactory(): NumberFormatterTwigFilterFactoryInterface
    {
        return new NumberFormatterTwigFilterFactory(
            $this->getUtilNumberService(),
        );
    }

    public function createNumberFormatterTwigFunctionFactory(): NumberFormatterTwigFunctionFactoryInterface
    {
        return new NumberFormatterTwigFunctionFactory(
            $this->getUtilNumberService(),
        );
    }

    public function createSanitizeXssTypeExtension(): FormTypeExtensionInterface
    {
        return new SanitizeXssTypeExtension($this->getUtilSanitizeXssService());
    }

    public function getTwigClient(): ShopUiToTwigClientInterface
    {
        return $this->getProvidedDependency(ShopUiDependencyProvider::CLIENT_TWIG);
    }

    public function getLocaleClient(): ShopUiToLocaleClientInterface
    {
        return $this->getProvidedDependency(ShopUiDependencyProvider::CLIENT_LOCALE);
    }

    public function getUtilNumberService(): ShopUiToUtilNumberServiceInterface
    {
        return $this->getProvidedDependency(ShopUiDependencyProvider::SERVICE_UTIL_NUMBER);
    }

    public function getUtilSanitizeXssService(): ShopUiToUtilSanitizeXssServiceInterface
    {
        return $this->getProvidedDependency(ShopUiDependencyProvider::SERVICE_UTIL_SANITIZE_XSS);
    }

    public function createConfigurationValueTwigFunctionProvider(): TwigFunctionProvider
    {
        return new ConfigurationValueTwigFunctionProvider(
            $this->getConfig(),
        );
    }

    public function createConfigurationValueTwigFunction(): TwigFunction
    {
        $functionProvider = $this->createConfigurationValueTwigFunctionProvider();

        return new TwigFunction(
            $functionProvider->getFunctionName(),
            $functionProvider->getFunction(),
            $functionProvider->getOptions(),
        );
    }

    public function createConfigurationValuesTwigFunctionProvider(): TwigFunctionProvider
    {
        return new ConfigurationValuesTwigFunctionProvider(
            $this->getConfig(),
        );
    }

    public function createConfigurationValuesTwigFunction(): TwigFunction
    {
        $functionProvider = $this->createConfigurationValuesTwigFunctionProvider();

        return new TwigFunction(
            $functionProvider->getFunctionName(),
            $functionProvider->getFunction(),
            $functionProvider->getOptions(),
        );
    }
}
