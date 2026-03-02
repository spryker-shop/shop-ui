<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi\Dependency\Service;

use Generated\Shared\Transfer\NumberFormatConfigTransfer;
use Generated\Shared\Transfer\NumberFormatFloatRequestTransfer;
use Generated\Shared\Transfer\NumberFormatIntRequestTransfer;

class ShopUiToUtilNumberServiceBridge implements ShopUiToUtilNumberServiceInterface
{
    /**
     * @var \Spryker\Service\UtilNumber\UtilNumberServiceInterface
     */
    protected $utilNumberService;

    /**
     * @param \Spryker\Service\UtilNumber\UtilNumberServiceInterface $utilNumberService
     */
    public function __construct($utilNumberService)
    {
        $this->utilNumberService = $utilNumberService;
    }

    public function formatInt(NumberFormatIntRequestTransfer $numberFormatIntRequestTransfer): string
    {
        return $this->utilNumberService->formatInt($numberFormatIntRequestTransfer);
    }

    public function formatFloat(NumberFormatFloatRequestTransfer $numberFormatFloatRequestTransfer): string
    {
        return $this->utilNumberService->formatFloat($numberFormatFloatRequestTransfer);
    }

    public function getNumberFormatConfig(?string $locale = null): NumberFormatConfigTransfer
    {
        return $this->utilNumberService->getNumberFormatConfig($locale);
    }
}
