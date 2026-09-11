<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Twig;

use Spryker\Shared\Twig\TwigExtension;
use SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToLocaleClientInterface;
use SprykerShop\Yves\ShopUi\ShopUiConfig;
use SprykerShop\Yves\ShopUi\Twig\Assets\AssetsUrlProviderInterface;
use SprykerShop\Yves\ShopUi\Twig\Node\ShopUiDefineTwigNode;
use SprykerShop\Yves\ShopUi\Twig\TokenParser\ShopUiDefineTwigTokenParser;
use Twig\Environment;
use Twig\Runtime\EscaperRuntime;
use Twig\TwigFilter;
use Twig\TwigFunction;

class ShopUiTwigExtension extends TwigExtension
{
    /**
     * @var string
     */
    public const FUNCTION_GET_PUBLIC_FOLDER_PATH = 'publicPath';

    /**
     * @var string
     */
    public const FUNCTION_GET_QA_ATTRIBUTE = 'qa';

    /**
     * @var string
     */
    public const FUNCTION_GET_QA_ATTRIBUTE_SUB = 'qa_*';

    /**
     * @var string
     */
    public const FUNCTION_GET_UI_MODEL_COMPONENT_TEMPLATE = 'model';

    /**
     * @var string
     */
    public const FUNCTION_GET_UI_ATOM_COMPONENT_TEMPLATE = 'atom';

    /**
     * @var string
     */
    public const FUNCTION_GET_UI_MOLECULE_COMPONENT_TEMPLATE = 'molecule';

    /**
     * @var string
     */
    public const FUNCTION_GET_UI_ORGANISM_COMPONENT_TEMPLATE = 'organism';

    /**
     * @var string
     */
    public const FUNCTION_GET_UI_TEMPLATE_COMPONENT_TEMPLATE = 'template';

    /**
     * @var string
     */
    public const FUNCTION_GET_UI_VIEW_COMPONENT_TEMPLATE = 'view';

    public const string FUNCTION_RENDER_COMPONENT_CLASS = 'componentClass';

    public const string FUNCTION_RENDER_COMPONENT_ATTRIBUTES = 'componentAttributes';

    /**
     * @var string
     */
    public const DEFAULT_MODULE = 'ShopUi';

    /**
     * @var string
     */
    protected const FILTER_TRIM_LOCALE = 'trimLocale';

    /**
     * @var \SprykerShop\Yves\ShopUi\Dependency\Client\ShopUiToLocaleClientInterface
     */
    protected $localeClient;

    /**
     * @var \SprykerShop\Yves\ShopUi\Twig\Assets\AssetsUrlProviderInterface|null
     */
    protected $assetsUrlProvider;

    /**
     * @var string
     */
    protected $localesFilterPattern;

    /**
     * @var \SprykerShop\Yves\ShopUi\ShopUiConfig
     */
    protected $shopUiConfig;

    public function __construct(
        ShopUiToLocaleClientInterface $localeClient,
        ShopUiConfig $shopUiConfig,
        ?AssetsUrlProviderInterface $assetsUrlProvider = null
    ) {
        $this->localeClient = $localeClient;
        $this->assetsUrlProvider = $assetsUrlProvider;
        $this->shopUiConfig = $shopUiConfig;
    }

    /**
     * @return array<string, mixed>
     */
    public function getGlobals(): array
    {
        return [
            'required' => ShopUiDefineTwigNode::REQUIRED_VALUE,
            'isQaEnabled' => $this->shopUiConfig->isQaAttributesEnabled(),
        ];
    }

    /**
     * @return array<\Twig\TwigFilter>
     */
    public function getFilters(): array
    {
        return [
            new TwigFilter(static::FILTER_TRIM_LOCALE, function (string $filterValue): string {
                return $this->trimLocale($filterValue);
            }),
        ];
    }

    /**
     * @return array<\Twig\TwigFunction>
     */
    public function getFunctions(): array
    {
        return [
            new TwigFunction(static::FUNCTION_GET_PUBLIC_FOLDER_PATH, function ($relativePath) {
                $publicFolderPath = $this->getPublicFolderPath();

                return $publicFolderPath . $relativePath;
            }, [
                $this,
                static::FUNCTION_GET_PUBLIC_FOLDER_PATH,
            ]),

            new TwigFunction(static::FUNCTION_GET_QA_ATTRIBUTE, function (Environment $twig, array $qaValues = []) {
                return $this->getQaAttribute($twig, $qaValues);
            }, [
                $this,
                static::FUNCTION_GET_QA_ATTRIBUTE,
                'is_safe' => ['html'],
                'is_variadic' => true,
                'needs_environment' => true,
            ]),

            new TwigFunction(static::FUNCTION_GET_QA_ATTRIBUTE_SUB, function (Environment $twig, $qaName, array $qaValues = []) {
                return $this->getQaAttribute($twig, $qaValues, $qaName);
            }, [
                $this,
                static::FUNCTION_GET_QA_ATTRIBUTE_SUB,
                'is_safe' => ['html'],
                'is_variadic' => true,
                'needs_environment' => true,
            ]),

            new TwigFunction(static::FUNCTION_GET_UI_MODEL_COMPONENT_TEMPLATE, function ($modelName) {
                return $this->getModelTemplate($modelName);
            }, [
                $this,
                static::FUNCTION_GET_UI_MODEL_COMPONENT_TEMPLATE,
            ]),

            new TwigFunction(static::FUNCTION_GET_UI_ATOM_COMPONENT_TEMPLATE, function ($componentName, $componentModule = self::DEFAULT_MODULE) {
                return $this->getComponentTemplate($componentModule, 'atoms', $componentName);
            }, [
                $this,
                static::FUNCTION_GET_UI_ATOM_COMPONENT_TEMPLATE,
            ]),

            new TwigFunction(static::FUNCTION_GET_UI_MOLECULE_COMPONENT_TEMPLATE, function ($componentName, $componentModule = self::DEFAULT_MODULE) {
                return $this->getComponentTemplate($componentModule, 'molecules', $componentName);
            }, [
                $this,
                static::FUNCTION_GET_UI_MOLECULE_COMPONENT_TEMPLATE,
            ]),

            new TwigFunction(static::FUNCTION_GET_UI_ORGANISM_COMPONENT_TEMPLATE, function ($componentName, $componentModule = self::DEFAULT_MODULE) {
                return $this->getComponentTemplate($componentModule, 'organisms', $componentName);
            }, [
                $this,
                static::FUNCTION_GET_UI_ORGANISM_COMPONENT_TEMPLATE,
            ]),

            new TwigFunction(static::FUNCTION_GET_UI_TEMPLATE_COMPONENT_TEMPLATE, function ($templateName, $templateModule = self::DEFAULT_MODULE) {
                return $this->getTemplateTemplate($templateModule, $templateName);
            }, [
                $this,
                static::FUNCTION_GET_UI_TEMPLATE_COMPONENT_TEMPLATE,
            ]),

            new TwigFunction(static::FUNCTION_GET_UI_VIEW_COMPONENT_TEMPLATE, function ($viewName, $viewModule = self::DEFAULT_MODULE) {
                return $this->getViewTemplate($viewModule, $viewName);
            }, [
                $this,
                static::FUNCTION_GET_UI_VIEW_COMPONENT_TEMPLATE,
            ]),

            new TwigFunction(static::FUNCTION_RENDER_COMPONENT_CLASS, function (Environment $twig, $componentName, $modifiers = [], $extraClass = '') {
                return $this->renderComponentClass($twig, $componentName, $modifiers, $extraClass);
            }, [
                'is_safe' => ['html'],
                'needs_environment' => true,
            ]),

            new TwigFunction(static::FUNCTION_RENDER_COMPONENT_ATTRIBUTES, function (Environment $twig, $attributes = []) {
                return $this->renderComponentAttributes($twig, $attributes);
            }, [
                'is_safe' => ['html'],
                'needs_environment' => true,
            ]),
        ];
    }

    /**
     * @return array<\Twig\TokenParser\AbstractTokenParser>
     */
    public function getTokenParsers(): array
    {
        return [
            new ShopUiDefineTwigTokenParser($this->shopUiConfig),
        ];
    }

    protected function getPublicFolderPath(): string
    {
        if ($this->assetsUrlProvider) {
            return $this->assetsUrlProvider->getAssetsUrl();
        }

        return '/assets/';
    }

    /**
     * Values are escaped because the function is registered as `is_safe => ['html']`, so Twig
     * emits the returned attribute verbatim — an unescaped value would break out of the quoted
     * attribute and inject markup.
     *
     * @param array<string> $qaValues
     */
    protected function getQaAttribute(Environment $twig, array $qaValues = [], ?string $qaName = null): string
    {
        $value = '';

        if (!$this->shopUiConfig->isQaAttributesEnabled()) {
            return '';
        }

        if (!$qaValues) {
            return '';
        }

        foreach ($qaValues as $qaValue) {
            if ($qaValue) {
                $value .= $this->escapeHtml($twig, $qaValue) . ' ';
            }
        }

        if (!$qaName) {
            return 'data-qa="' . trim($value) . '"';
        }

        return 'data-qa-' . $qaName . '="' . trim($value) . '"';
    }

    /**
     * Renders the BEM class list of a component: the block name, one `--modifier` class per
     * non-empty modifier, then any extra classes supplied by the caller.
     *
     * Behaviourally identical to the `renderClass()` macro in `@ShopUi/models/component.twig`,
     * which is retained as a thin wrapper around this function for templates that call it
     * directly. Values are escaped explicitly because the function is registered as
     * `is_safe => ['html']`.
     *
     * @param mixed $componentName
     * @param iterable<mixed> $modifiers
     * @param mixed $extraClass
     */
    protected function renderComponentClass(Environment $twig, $componentName, iterable $modifiers, $extraClass): string
    {
        $renderedClass = $this->escapeHtml($twig, trim((string)$componentName));

        foreach ($modifiers as $modifier) {
            $modifier = trim((string)$modifier);

            if ($modifier === '') {
                continue;
            }

            // The replaced macro trimmed the name for the block class but not for the modifier
            // classes. Kept as-is so the rendered markup does not change; component names are
            // never padded in practice.
            $renderedClass .= ' ' . $this->escapeHtml($twig, $componentName) . '--' . $this->escapeHtml($twig, $modifier);
        }

        if ($extraClass) {
            $renderedClass .= ' ' . $this->escapeHtml($twig, $extraClass);
        }

        return $renderedClass;
    }

    /**
     * Renders an attribute list. A `true` value renders the bare attribute name, a `false` value
     * omits the attribute entirely, and any other value renders `name='value'`.
     *
     * Behaviourally identical to the `renderAttributes()` macro in
     * `@ShopUi/models/component.twig`, including its strict `true`/`false` comparisons — a `null`
     * or `0` value renders an attribute, only a literal `false` drops it.
     *
     * @param iterable<mixed> $attributes
     */
    protected function renderComponentAttributes(Environment $twig, iterable $attributes): string
    {
        $renderedAttributes = '';

        foreach ($attributes as $name => $value) {
            if ($value === true) {
                $renderedAttributes .= ' ' . $this->escapeHtml($twig, $name);

                continue;
            }

            if ($value === false) {
                continue;
            }

            $renderedAttributes .= ' ' . $this->escapeHtml($twig, $name) . "='" . $this->escapeHtml($twig, $value) . "'";
        }

        return $renderedAttributes;
    }

    /**
     * Delegates to Twig's own escaper so this output cannot drift from what an autoescaped
     * `{{ value }}` in a template produces — including the charset in use and the exemption for
     * values already marked safe (`\Twig\Markup`).
     *
     * @param mixed $value
     */
    protected function escapeHtml(Environment $twig, $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        return (string)$twig->getRuntime(EscaperRuntime::class)->escape($value, 'html', null, true);
    }

    protected function getModelTemplate(string $modelName): string
    {
        return '@ShopUi/models/' . $modelName . '.twig';
    }

    protected function getComponentTemplate(string $componentModule, string $componentType, string $componentName): string
    {
        return '@' . $componentModule . '/components/' . $componentType . '/' . $componentName . '/' . $componentName . '.twig';
    }

    protected function getTemplateTemplate(string $templateModule, string $templateName): string
    {
        return '@' . $templateModule . '/templates/' . $templateName . '/' . $templateName . '.twig';
    }

    protected function getViewTemplate(string $viewModule, string $viewName): string
    {
        return '@' . $viewModule . '/views/' . $viewName . '/' . $viewName . '.twig';
    }

    protected function trimLocale(string $filterValue): string
    {
        return preg_replace(
            $this->getLocalePattern(),
            '/',
            $filterValue,
        );
    }

    protected function getLocalePattern(): string
    {
        if ($this->localesFilterPattern) {
            return $this->localesFilterPattern;
        }

        $locale = $this->localeClient->getCurrentLocale();
        $this->localesFilterPattern = '#^\/(' . strtok($locale, '_') . ')\/#';

        return $this->localesFilterPattern;
    }
}
