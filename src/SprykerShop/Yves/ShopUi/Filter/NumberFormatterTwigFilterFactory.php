<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Filter;

use Generated\Shared\Transfer\NumberFormatFilterTransfer;
use Generated\Shared\Transfer\NumberFormatFloatRequestTransfer;
use Generated\Shared\Transfer\NumberFormatIntRequestTransfer;
use SprykerShop\Yves\ShopUi\Dependency\Service\ShopUiToUtilNumberServiceInterface;
use Twig\TwigFilter;

class NumberFormatterTwigFilterFactory implements NumberFormatterTwigFilterFactoryInterface
{
    /**
     * @var string
     */
    protected const FORMAT_INT_FILTER_NAME = 'formatInt';

    /**
     * @var string
     */
    protected const FORMAT_FLOAT_FILTER_NAME = 'formatFloat';

    /**
     * @var \SprykerShop\Yves\ShopUi\Dependency\Service\ShopUiToUtilNumberServiceInterface
     */
    protected ShopUiToUtilNumberServiceInterface $utilNumberService;

    public function __construct(ShopUiToUtilNumberServiceInterface $utilNumberService)
    {
        $this->utilNumberService = $utilNumberService;
    }

    public function createFormatIntFilter(): TwigFilter
    {
        return new TwigFilter(
            static::FORMAT_INT_FILTER_NAME,
            function (int $value, ?string $locale = null, ?int $numberFormatStyle = null, ?int $maxFractionDigits = null): string {
                return $this->utilNumberService->formatInt(
                    $this->createNumberFormatIntRequest($value, $locale, $numberFormatStyle, $maxFractionDigits),
                );
            },
        );
    }

    public function createFormatFloatFilter(): TwigFilter
    {
        return new TwigFilter(
            static::FORMAT_FLOAT_FILTER_NAME,
            function (float $value, ?string $locale = null, ?int $numberFormatStyle = null, ?int $maxFractionDigits = null): string {
                return $this->utilNumberService->formatFloat(
                    $this->createNumberFormatFloatRequest($value, $locale, $numberFormatStyle, $maxFractionDigits),
                );
            },
        );
    }

    protected function createNumberFormatIntRequest(
        int $value,
        ?string $locale = null,
        ?int $numberFormatStyle = null,
        ?int $maxFractionDigits = null
    ): NumberFormatIntRequestTransfer {
        return (new NumberFormatIntRequestTransfer())
            ->setNumber($value)
            ->setNumberFormatFilter(
                $this->createNumberFormatFilter($locale, $numberFormatStyle, $maxFractionDigits),
            );
    }

    protected function createNumberFormatFloatRequest(
        float $value,
        ?string $locale = null,
        ?int $numberFormatStyle = null,
        ?int $maxFractionDigits = null
    ): NumberFormatFloatRequestTransfer {
        return (new NumberFormatFloatRequestTransfer())
            ->setNumber($value)
            ->setNumberFormatFilter(
                $this->createNumberFormatFilter($locale, $numberFormatStyle, $maxFractionDigits),
            );
    }

    protected function createNumberFormatFilter(
        ?string $locale = null,
        ?int $numberFormatStyle = null,
        ?int $maxFractionDigits = null
    ): NumberFormatFilterTransfer {
        return (new NumberFormatFilterTransfer())
            ->setLocale($locale)
            ->setNumberFormatStyle($numberFormatStyle)
            ->setMaxFractionDigits($maxFractionDigits);
    }
}
