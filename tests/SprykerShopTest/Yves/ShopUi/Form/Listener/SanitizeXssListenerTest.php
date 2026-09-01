<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShopTest\Yves\ShopUi\Form\Listener;

use Codeception\Test\Unit;
use SprykerShop\Yves\ShopUi\Dependency\Service\ShopUiToUtilSanitizeXssServiceInterface;
use SprykerShop\Yves\ShopUi\Form\Listener\SanitizeXssListener;
use SprykerShop\Yves\ShopUi\Form\Type\Extension\SanitizeXssTypeExtension;
use Symfony\Component\Form\FormConfigInterface;
use Symfony\Component\Form\FormEvent;
use Symfony\Component\Form\FormEvents;
use Symfony\Component\Form\FormInterface;

/**
 * @group SprykerShop
 * @group Yves
 * @group ShopUi
 * @group Form
 * @group Listener
 * @group SanitizeXssListenerTest
 */
class SanitizeXssListenerTest extends Unit
{
    /**
     * @var string
     */
    protected const SUBMITTED_DATA = '<b onclick="alert(1)">text</b>';

    /**
     * @var string
     */
    protected const SANITIZED_DATA = '<b>text</b>';

    /**
     * @var list<string>
     */
    protected const ALLOWED_ATTRIBUTES = ['class'];

    /**
     * @var list<string>
     */
    protected const ALLOWED_HTML_TAGS = ['b'];

    public function testSanitizeSubmittedDataSanitizesDataInSinglePass(): void
    {
        // Arrange
        $utilSanitizeXssServiceMock = $this->createMock(ShopUiToUtilSanitizeXssServiceInterface::class);
        $formEvent = $this->createFormEvent(static::SUBMITTED_DATA);

        // Expect
        $utilSanitizeXssServiceMock->expects($this->once())
            ->method('sanitizeXss')
            ->with(
                static::SUBMITTED_DATA,
                static::ALLOWED_ATTRIBUTES,
                static::ALLOWED_HTML_TAGS,
            )
            ->willReturn(static::SANITIZED_DATA);

        // Act
        (new SanitizeXssListener($utilSanitizeXssServiceMock))->sanitizeSubmittedData($formEvent);

        // Assert
        $this->assertSame(static::SANITIZED_DATA, $formEvent->getData());
    }

    public function testSanitizeSubmittedDataDoesNotSanitizeNonStringData(): void
    {
        // Arrange
        $data = ['key' => 'value'];
        $utilSanitizeXssServiceMock = $this->createMock(ShopUiToUtilSanitizeXssServiceInterface::class);
        $formEvent = $this->createFormEvent($data);

        // Expect
        $utilSanitizeXssServiceMock->expects($this->never())
            ->method('sanitizeXss');

        // Act
        (new SanitizeXssListener($utilSanitizeXssServiceMock))->sanitizeSubmittedData($formEvent);

        // Assert
        $this->assertSame($data, $formEvent->getData());
    }

    public function testGetSubscribedEventsSubscribesToPreSubmit(): void
    {
        // Act
        $subscribedEvents = SanitizeXssListener::getSubscribedEvents();

        // Assert
        $this->assertSame([FormEvents::PRE_SUBMIT => ['sanitizeSubmittedData', 1000]], $subscribedEvents);
    }

    /**
     * @param mixed $data
     *
     * @return \Symfony\Component\Form\FormEvent
     */
    protected function createFormEvent($data): FormEvent
    {
        $formConfigMock = $this->createMock(FormConfigInterface::class);
        $formConfigMock->method('getOption')
            ->willReturnMap([
                [SanitizeXssTypeExtension::OPTION_ALLOWED_ATTRIBUTES, [], static::ALLOWED_ATTRIBUTES],
                [SanitizeXssTypeExtension::OPTION_ALLOWED_HTML_TAGS, [], static::ALLOWED_HTML_TAGS],
            ]);

        $formMock = $this->createMock(FormInterface::class);
        $formMock->method('getConfig')->willReturn($formConfigMock);

        return new FormEvent($formMock, $data);
    }
}
