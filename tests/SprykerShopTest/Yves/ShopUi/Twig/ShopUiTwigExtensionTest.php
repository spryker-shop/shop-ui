<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShopTest\Yves\ShopUi\Twig;

use Codeception\Test\Unit;
use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToLocaleClientInterface;
use SprykerShop\Yves\ShopUi\ShopUiConfig;
use SprykerShop\Yves\ShopUi\Twig\Assets\AssetsUrlProviderInterface;
use SprykerShop\Yves\ShopUi\Twig\Node\ShopUiDefineTwigNode;
use SprykerShop\Yves\ShopUi\Twig\ShopUiTwigExtension;
use SprykerShop\Yves\ShopUi\Twig\TokenParser\ShopUiDefineTwigTokenParser;
use Twig\Environment;
use Twig\Loader\ArrayLoader;
use Twig\Markup;

/**
 * Auto-generated group annotations
 *
 * @group SprykerShopTest
 * @group Yves
 * @group ShopUi
 * @group Twig
 * @group ShopUiTwigExtensionTest
 * Add your own group annotations below this line
 */
class ShopUiTwigExtensionTest extends Unit
{
    protected const string GLOBAL_NAME_IS_QA_ENABLED = 'isQaEnabled';

    protected const string GLOBAL_NAME_REQUIRED = 'required';

    protected const string LOCALE = 'en_US';

    protected const string ASSETS_URL = 'https://cdn.example.com/assets/';

    protected const string ASSET_RELATIVE_PATH = 'css/app.css';

    public function testGetGlobalsExposesIsQaEnabledWhenEnabled(): void
    {
        // Act
        $globals = $this->createExtension(true)->getGlobals();

        // Assert
        $this->assertArrayHasKey(static::GLOBAL_NAME_IS_QA_ENABLED, $globals);
        $this->assertTrue($globals[static::GLOBAL_NAME_IS_QA_ENABLED]);
    }

    public function testGetGlobalsExposesIsQaEnabledWhenDisabled(): void
    {
        // Act
        $globals = $this->createExtension(false)->getGlobals();

        // Assert
        $this->assertArrayHasKey(static::GLOBAL_NAME_IS_QA_ENABLED, $globals);
        $this->assertFalse($globals[static::GLOBAL_NAME_IS_QA_ENABLED]);
    }

    public function testGetGlobalsExposesRequiredPlaceholderUsedByDefineTag(): void
    {
        // Act
        $globals = $this->createExtension(true)->getGlobals();

        // Assert
        $this->assertArrayHasKey(static::GLOBAL_NAME_REQUIRED, $globals);
        $this->assertSame(ShopUiDefineTwigNode::REQUIRED_VALUE, $globals[static::GLOBAL_NAME_REQUIRED]);
    }

    public function testGetTokenParsersReturnsDefineTokenParser(): void
    {
        // Act
        $tokenParsers = $this->createExtension(true)->getTokenParsers();

        // Assert
        $this->assertCount(1, $tokenParsers);
        $this->assertInstanceOf(ShopUiDefineTwigTokenParser::class, $tokenParsers[0]);
    }

    /**
     * @dataProvider provideComponentMarkupTemplates
     *
     * @param string $template
     * @param array<string, mixed> $context
     * @param string $expectedMarkup
     *
     * @return void
     */
    public function testComponentFunctionsRenderExpectedMarkup(
        string $template,
        array $context,
        string $expectedMarkup
    ): void {
        // Act
        $renderedMarkup = $this->renderTemplate($template, $context);

        // Assert
        $this->assertSame($expectedMarkup, $renderedMarkup);
    }

    /**
     * @dataProvider provideTemplatePathTemplates
     *
     * @param string $template
     * @param string $expectedTemplatePath
     *
     * @return void
     */
    public function testTemplatePathFunctionsBuildNamespacedTemplatePaths(
        string $template,
        string $expectedTemplatePath
    ): void {
        // Act
        $renderedTemplatePath = $this->renderTemplate($template);

        // Assert
        $this->assertSame($expectedTemplatePath, $renderedTemplatePath);
    }

    /**
     * @dataProvider provideQaAttributeTemplates
     *
     * @param string $template
     * @param array<string, mixed> $context
     * @param string $expectedAttribute
     *
     * @return void
     */
    public function testQaAttributeFunctionsRenderEscapedAttributes(
        string $template,
        array $context,
        string $expectedAttribute
    ): void {
        // Act
        $renderedAttribute = $this->renderTemplate($template, $context);

        // Assert
        $this->assertSame($expectedAttribute, $renderedAttribute);
    }

    public function testQaAttributeFunctionsRenderNothingWhenQaAttributesAreDisabled(): void
    {
        // Act
        $renderedAttribute = $this->renderTemplate(
            "{{ qa('product-item') }}{{ qa_action('add-to-cart') }}",
            [],
            $this->createExtension(false),
        );

        // Assert
        $this->assertSame('', $renderedAttribute);
    }

    public function testPublicPathPrependsDefaultAssetsFolderWhenNoProviderIsGiven(): void
    {
        // Act
        $renderedPath = $this->renderTemplate(sprintf("{{ publicPath('%s') }}", static::ASSET_RELATIVE_PATH));

        // Assert
        $this->assertSame('/assets/' . static::ASSET_RELATIVE_PATH, $renderedPath);
    }

    public function testPublicPathPrependsAssetsUrlFromProvider(): void
    {
        // Arrange
        $assetsUrlProviderMock = $this->createMock(AssetsUrlProviderInterface::class);
        $assetsUrlProviderMock->method('getAssetsUrl')->willReturn(static::ASSETS_URL);

        // Act
        $renderedPath = $this->renderTemplate(
            sprintf("{{ publicPath('%s') }}", static::ASSET_RELATIVE_PATH),
            [],
            $this->createExtension(true, static::LOCALE, $assetsUrlProviderMock),
        );

        // Assert
        $this->assertSame(static::ASSETS_URL . static::ASSET_RELATIVE_PATH, $renderedPath);
    }

    /**
     * @dataProvider provideTrimLocalePaths
     *
     * @param string $path
     * @param string $expectedPath
     *
     * @return void
     */
    public function testTrimLocaleRemovesOnlyTheCurrentLocalePrefix(string $path, string $expectedPath): void
    {
        // Act
        $trimmedPath = $this->renderTemplate(sprintf("{{ '%s' | trimLocale }}", $path));

        // Assert
        $this->assertSame($expectedPath, $trimmedPath);
    }

    public function testTrimLocaleResolvesCurrentLocaleOnlyOnce(): void
    {
        // Arrange
        $localeClientMock = $this->createMock(ShopUiToLocaleClientInterface::class);
        $localeClientMock->expects($this->once())->method('getCurrentLocale')->willReturn(static::LOCALE);
        $shopUiConfigMock = $this->createMock(ShopUiConfig::class);
        $shopUiConfigMock->method('isQaAttributesEnabled')->willReturn(true);

        // Act
        $trimmedPaths = $this->renderTemplate(
            "{{ '/en/one' | trimLocale }}|{{ '/en/two' | trimLocale }}|{{ '/en/three' | trimLocale }}",
            [],
            new ShopUiTwigExtension($localeClientMock, $shopUiConfigMock),
        );

        // Assert
        $this->assertSame('/one|/two|/three', $trimmedPaths);
    }

    /**
     * @return iterable<string, array{string, array<string, mixed>, string}>
     */
    public static function provideComponentMarkupTemplates(): iterable
    {
        yield 'component class with modifiers and extra classes' => [
            "{{ componentClass('icon', ['small', 'wide'], 'cell__icon') }}",
            [],
            'icon icon--small icon--wide cell__icon',
        ];

        yield 'component class skips blank modifiers' => [
            "{{ componentClass('icon', ['', '  ', 'small'], '') }}",
            [],
            'icon icon--small',
        ];

        yield 'component class without modifiers or extra classes' => [
            "{{ componentClass('icon') }}",
            [],
            'icon',
        ];

        yield 'component class escapes the extra class exactly once' => [
            '{{ componentClass(\'icon\', [], extraClass) }}',
            ['extraClass' => '" onload="alert(1)'],
            'icon &quot; onload=&quot;alert(1)',
        ];

        // The block class is trimmed but the modifier prefix deliberately is not, so the rendered
        // markup stays byte-identical to the Twig macro this function replaced.
        yield 'component class trims the block name but not the modifier prefix' => [
            "{{ componentClass('  icon  ', ['small'], '') }}",
            [],
            'icon   icon  --small',
        ];

        // `if ($extraClass)` is a truthiness check, so a class literally named "0" is dropped.
        yield 'component class drops a falsy extra class' => [
            "{{ componentClass('icon', [], '0') }}",
            [],
            'icon',
        ];

        yield 'component attributes render values and boolean attributes' => [
            "{{ componentAttributes({ title: 'Ok', disabled: true, hidden: false }) }}",
            [],
            " title='Ok' disabled",
        ];

        yield 'component attributes keep null and zero but drop only false' => [
            "{{ componentAttributes({ tabindex: 0, 'data-x': null, 'aria-hidden': false }) }}",
            [],
            " tabindex='0' data-x=''",
        ];

        yield 'component attributes escape values exactly once' => [
            '{{ componentAttributes({ title: title }) }}',
            ['title' => "Ben & Jerry's"],
            " title='Ben &amp; Jerry&#039;s'",
        ];

        yield 'component attributes do not escape values already marked safe' => [
            '{{ componentAttributes({ title: title }) }}',
            ['title' => new Markup('a &amp; b', 'UTF-8')],
            " title='a &amp; b'",
        ];

        yield 'component attributes escape attribute names' => [
            '{{ componentAttributes(attributes) }}',
            ['attributes' => ['data-x" onload="alert(1)' => 'y']],
            " data-x&quot; onload=&quot;alert(1)='y'",
        ];

        yield 'component attributes render nothing for an empty list' => [
            '{{ componentAttributes({}) }}',
            [],
            '',
        ];
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function provideTemplatePathTemplates(): iterable
    {
        yield 'model' => ["{{ model('component') }}", '@ShopUi/models/component.twig'];

        yield 'atom falls back to the ShopUi module' => [
            "{{ atom('icon') }}",
            '@ShopUi/components/atoms/icon/icon.twig',
        ];

        yield 'molecule with an explicit module' => [
            "{{ molecule('logo', 'CartPage') }}",
            '@CartPage/components/molecules/logo/logo.twig',
        ];

        yield 'organism' => [
            "{{ organism('header') }}",
            '@ShopUi/components/organisms/header/header.twig',
        ];

        yield 'template' => [
            "{{ template('page-layout-main') }}",
            '@ShopUi/templates/page-layout-main/page-layout-main.twig',
        ];

        yield 'view with an explicit module' => [
            "{{ view('cart', 'CartPage') }}",
            '@CartPage/views/cart/cart.twig',
        ];

        // Project overrides address the core copy of a same-named template through an
        // organization-qualified module, so the prefix must pass through untouched.
        yield 'organization-qualified module passes through' => [
            "{{ template('page-layout-main', '@SprykerShop:ShopUi') }}",
            '@@SprykerShop:ShopUi/templates/page-layout-main/page-layout-main.twig',
        ];
    }

    /**
     * @return iterable<string, array{string, array<string, mixed>, string}>
     */
    public static function provideQaAttributeTemplates(): iterable
    {
        yield 'single value' => ["{{ qa('product-item') }}", [], 'data-qa="product-item"'];

        yield 'several values are space separated' => [
            "{{ qa('product-item', 'teaser') }}",
            [],
            'data-qa="product-item teaser"',
        ];

        yield 'falsy values are skipped' => [
            "{{ qa('a', '', null, 'b') }}",
            [],
            'data-qa="a b"',
        ];

        yield 'no values render nothing' => ['{{ qa() }}', [], ''];

        yield 'only falsy values render an empty attribute' => ["{{ qa('') }}", [], 'data-qa=""'];

        yield 'named attribute' => [
            "{{ qa_action('add-to-cart') }}",
            [],
            'data-qa-action="add-to-cart"',
        ];

        yield 'values are escaped so they cannot break out of the attribute' => [
            '{{ qa(qaValue) }}',
            ['qaValue' => '" onload="alert(1)'],
            'data-qa="&quot; onload=&quot;alert(1)"',
        ];

        yield 'named attribute values are escaped too' => [
            '{{ qa_action(qaValue) }}',
            ['qaValue' => '" onload="alert(1)'],
            'data-qa-action="&quot; onload=&quot;alert(1)"',
        ];

        yield 'ampersands and apostrophes are escaped' => [
            '{{ qa(qaValue) }}',
            ['qaValue' => "Ben & Jerry's"],
            'data-qa="Ben &amp; Jerry&#039;s"',
        ];
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function provideTrimLocalePaths(): iterable
    {
        yield 'current locale prefix is removed' => ['/en/foo/bar', '/foo/bar'];

        yield 'another locale prefix is kept' => ['/de/foo', '/de/foo'];

        yield 'path without a locale prefix is unchanged' => ['/foo/bar', '/foo/bar'];

        yield 'locale is only removed at the beginning of the path' => ['/foo/en/bar', '/foo/en/bar'];
    }

    /**
     * Renders a template through a real Twig environment so the assertions cover the function
     * registration (`needs_environment`, `is_safe`, `is_variadic`) as well as the rendering itself.
     *
     * @param string $template
     * @param array<string, mixed> $context
     * @param \SprykerShop\Yves\ShopUi\Twig\ShopUiTwigExtension|null $shopUiTwigExtension
     *
     * @return string
     */
    protected function renderTemplate(
        string $template,
        array $context = [],
        ?ShopUiTwigExtension $shopUiTwigExtension = null
    ): string {
        $twig = new Environment(new ArrayLoader(['test.twig' => $template]), [
            'cache' => false,
            'autoescape' => 'html',
        ]);
        $twig->addExtension($shopUiTwigExtension ?? $this->createExtension(true));

        return $twig->render('test.twig', $context);
    }

    protected function createExtension(
        bool $isQaEnabled,
        string $locale = self::LOCALE,
        ?AssetsUrlProviderInterface $assetsUrlProvider = null
    ): ShopUiTwigExtension {
        $localeClientMock = $this->createMock(ShopUiToLocaleClientInterface::class);
        $localeClientMock->method('getCurrentLocale')->willReturn($locale);
        $shopUiConfigMock = $this->createMock(ShopUiConfig::class);
        $shopUiConfigMock->method('isQaAttributesEnabled')->willReturn($isQaEnabled);

        return new ShopUiTwigExtension($localeClientMock, $shopUiConfigMock, $assetsUrlProvider);
    }
}
