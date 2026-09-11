<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Twig\Node;

use SprykerShop\Yves\ShopUi\ShopUiConfig;
use Twig\Attribute\YieldReady;
use Twig\Compiler;
use Twig\Node\Expression\AbstractExpression;
use Twig\Node\Expression\ArrayExpression;
use Twig\Node\Expression\ConstantExpression;
use Twig\Node\Node;

#[YieldReady]
class ShopUiDefineTwigNode extends Node
{
    /**
     * @var string
     */
    public const REQUIRED_VALUE = '___REQUIRED___';

    /**
     * @var \SprykerShop\Yves\ShopUi\ShopUiConfig
     */
    protected $shopUiConfig;

    public function __construct(
        ShopUiConfig $shopUiConfig,
        string $name,
        AbstractExpression $value,
        int $line,
        ?string $tag = null
    ) {
        parent::__construct(['value' => $value], ['name' => $name], $line, $tag);

        $this->shopUiConfig = $shopUiConfig;
    }

    public function compile(Compiler $compiler): void
    {
        $key = "'" . $this->getAttribute('name') . "'";

        $compiler->addDebugInfo($this);

        $this->addDefaultValueSetter($compiler, $key);
        $this->addValueReplacer($compiler, $key);
        $this->addRequiredValueCheck($compiler, $key);
    }

    protected function addDefaultValueSetter(Compiler $compiler, string $key): Compiler
    {
        $compiler->raw('if (!array_key_exists(' . $key . ', $context)) {')
            ->raw('$context[' . $key . '] = [];')
            ->raw('}');

        return $compiler;
    }

    protected function addValueReplacer(Compiler $compiler, string $key): Compiler
    {
        $valueNode = $this->getNode('value');

        if ($this->isEmptyArrayDefault($valueNode)) {
            return $compiler;
        }

        $mergeFunction = $this->isFlatArrayDefault($valueNode) ? 'array_replace' : 'array_replace_recursive';

        $compiler->raw('$context[' . $key . '] = ' . $mergeFunction . '(')
            ->subcompile($valueNode)
            ->raw(', $context[' . $key . ']);');

        return $compiler;
    }

    protected function isEmptyArrayDefault(Node $valueNode): bool
    {
        return $valueNode instanceof ArrayExpression && $valueNode->getKeyValuePairs() === [];
    }

    protected function isFlatArrayDefault(Node $valueNode): bool
    {
        if (!$valueNode instanceof ArrayExpression) {
            return false;
        }

        foreach ($valueNode->getKeyValuePairs() as $pair) {
            if (!$pair['value'] instanceof ConstantExpression) {
                return false;
            }
        }

        return true;
    }

    protected function addRequiredValueCheck(Compiler $compiler, string $key): Compiler
    {
        if (!$this->shopUiConfig->isDevelopmentMode()) {
            return $compiler;
        }

        $requiredValue = "'" . static::REQUIRED_VALUE . "'";

        $compiler->raw('array_walk_recursive($context[' . $key . '], function($value, $key) {')
            ->raw('if ($value === ' . $requiredValue . ') {')
            ->raw('throw new RuntimeError(\'required <em>' . $this->getAttribute('name') . '</em> property "\'.$key.\'" is not defined for "' . (string)$this->getTemplateName() . ':' . $this->getTemplateLine() . '"\'); }')
            ->raw('});');

        return $compiler;
    }
}
