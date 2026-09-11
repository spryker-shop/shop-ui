<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShopTest\Yves\ShopUi\Twig\Node;

use Codeception\Test\Unit;
use SprykerShop\Yves\ShopUi\ShopUiConfig;
use SprykerShop\Yves\ShopUi\Twig\TokenParser\ShopUiDefineTwigTokenParser;
use Twig\Environment;
use Twig\Loader\ArrayLoader;
use Twig\Source;

/**
 * Auto-generated group annotations
 *
 * @group SprykerShopTest
 * @group Yves
 * @group ShopUi
 * @group Twig
 * @group Node
 * @group ShopUiDefineTwigNodeTest
 * Add your own group annotations below this line
 */
class ShopUiDefineTwigNodeTest extends Unit
{
    protected function createTwig(): Environment
    {
        $shopUiConfig = $this->createMock(ShopUiConfig::class);
        $shopUiConfig->method('isDevelopmentMode')->willReturn(false);

        $twig = new Environment(new ArrayLoader());
        $twig->addTokenParser(new ShopUiDefineTwigTokenParser($shopUiConfig));

        return $twig;
    }

    protected function compile(string $source): string
    {
        $shopUiConfig = $this->createMock(ShopUiConfig::class);
        $shopUiConfig->method('isDevelopmentMode')->willReturn(false);

        $twig = new Environment(new ArrayLoader(['test' => $source]));
        $twig->addTokenParser(new ShopUiDefineTwigTokenParser($shopUiConfig));

        return $twig->compileSource(new Source($source, 'test'));
    }

    public function testEmptyArrayDefaultSkipsMergeEntirely(): void
    {
        // Act
        $compiled = $this->compile('{% define data = {} %}');

        // Assert
        $this->assertStringNotContainsString('array_replace', $compiled);
    }

    public function testFlatArrayDefaultUsesArrayReplace(): void
    {
        // Act
        $compiled = $this->compile("{% define config = {name: 'x', tag: 'div'} %}");

        // Assert
        $this->assertStringContainsString('array_replace(', $compiled);
        $this->assertStringNotContainsString('array_replace_recursive(', $compiled);
    }

    public function testNestedArrayDefaultUsesRecursiveMerge(): void
    {
        // Act
        $compiled = $this->compile("{% define data = {images: {main: 'a'}} %}");

        // Assert
        $this->assertStringContainsString('array_replace_recursive(', $compiled);
    }

    public function testDynamicValueDefaultUsesRecursiveMerge(): void
    {
        // Act — a non-literal value may resolve to an array at runtime, so recursive is required.
        $compiled = $this->compile('{% define data = {name: foo} %}');

        // Assert
        $this->assertStringContainsString('array_replace_recursive(', $compiled);
    }

    public function testEmptyDefaultPassesContextValueThrough(): void
    {
        // Act
        $output = $this->createTwig()
            ->createTemplate('{% define data = {} %}{{ data.x }}')
            ->render(['data' => ['x' => 'A']]);

        // Assert
        $this->assertSame('A', $output);
    }

    public function testFlatDefaultIsOverriddenByContextValue(): void
    {
        // Act
        $output = $this->createTwig()
            ->createTemplate("{% define config = {name: 'def', tag: 'div'} %}{{ config.name }}-{{ config.tag }}")
            ->render(['config' => ['name' => 'X']]);

        // Assert — passed name overrides, default tag is kept.
        $this->assertSame('X-div', $output);
    }

    public function testNestedDefaultDeepMergesWithContextValue(): void
    {
        // Act
        $output = $this->createTwig()
            ->createTemplate('{% define data = {a: {b: 1, c: 2}} %}{{ data.a.b }}{{ data.a.c }}{{ data.a.d }}')
            ->render(['data' => ['a' => ['c' => 9, 'd' => 3]]]);

        // Assert — b from default, c overridden, d added (recursive merge preserved).
        $this->assertSame('193', $output);
    }
}
