<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShopTest\Yves\ShopUi\Plugin\Twig;

use Codeception\Test\Unit;
use Spryker\Service\Container\ContainerInterface;
use SprykerShop\Yves\ShopUi\Plugin\Twig\ShopUiTwigPlugin;
use SprykerShopTest\Yves\ShopUi\ShopUiTester;
use Twig\Environment;
use Twig\TwigFunction;

/**
 * Auto-generated group annotations
 *
 * @group SprykerShopTest
 * @group Yves
 * @group ShopUi
 * @group Plugin
 * @group Twig
 * @group ShopUiTwigPluginTest
 * Add your own group annotations below this line
 */
class ShopUiTwigPluginTest extends Unit
{
    protected ShopUiTester $tester;

    protected const string TWIG_FUNCTION_NAME = 'configurationValue';

    protected const string TWIG_FUNCTION_NAME_VALUES = 'configurationValues';

    protected const string TEST_CONFIG_KEY = 'theme:storefront:colors:theme_main_color';

    protected const string TEST_CONFIG_VALUE = '#1e88e5';

    protected const string TEST_CONFIG_PREFIX = 'theme:storefront:colors';

    /**
     * @var array<string, string>
     */
    protected const array TEST_CONFIG_VALUES = ['yves_main_color' => '#ffffff'];

    public function testExtendShouldAddConfigurationValueFunction(): void
    {
        // Arrange
        $registeredFunctions = $this->registerAndExtend(['getModuleConfig' => static::TEST_CONFIG_VALUE]);

        // Assert
        $this->assertArrayHasKey(static::TWIG_FUNCTION_NAME, $registeredFunctions);

        $result = call_user_func($registeredFunctions[static::TWIG_FUNCTION_NAME]->getCallable(), static::TEST_CONFIG_KEY);
        $this->assertSame(static::TEST_CONFIG_VALUE, $result);
    }

    public function testExtendShouldAddConfigurationValuesFunction(): void
    {
        // Arrange
        $registeredFunctions = $this->registerAndExtend(['getModuleConfigValues' => static::TEST_CONFIG_VALUES]);

        // Assert
        $this->assertArrayHasKey(static::TWIG_FUNCTION_NAME_VALUES, $registeredFunctions);

        $result = call_user_func(
            $registeredFunctions[static::TWIG_FUNCTION_NAME_VALUES]->getCallable(),
            static::TEST_CONFIG_PREFIX,
        );
        $this->assertSame(static::TEST_CONFIG_VALUES, $result);
    }

    /**
     * @param array<string, mixed> $configMethods
     *
     * @return array<string, \Twig\TwigFunction>
     */
    protected function registerAndExtend(array $configMethods): array
    {
        $registeredFunctions = [];
        $twigMock = $this->createMock(Environment::class);
        $containerMock = $this->createMock(ContainerInterface::class);

        $twigMock->method('addFunction')
            ->willReturnCallback(function (TwigFunction $function) use (&$registeredFunctions): void {
                $registeredFunctions[$function->getName()] = $function;
            });
        $twigMock->expects($this->once())->method('addExtension');

        foreach ($configMethods as $methodName => $returnValue) {
            $this->tester->mockConfigMethod($methodName, $returnValue);
        }

        $shopUiTwigPlugin = new ShopUiTwigPlugin();
        $shopUiTwigPlugin->setFactory($this->tester->getFactory());
        $shopUiTwigPlugin->extend($twigMock, $containerMock);

        return $registeredFunctions;
    }
}
