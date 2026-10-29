<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ShopUi;

use Spryker\Yves\Kernel\AbstractBundleConfig;
use SprykerShop\Shared\ShopUi\ShopUiConstants;

class ShopUiConfig extends AbstractBundleConfig
{
    /**
     * Specification:
     * - Reads a single configuration value by its full setting key.
     * - Returns `$default` when the key is not found or the Configuration module is unavailable.
     *
     * @api
     *
     * @param array<\Generated\Shared\Transfer\ConfigurationScopeTransfer> $configurationScopes
     */
    public function getModuleConfig(string $key, mixed $default = null, array $configurationScopes = []): mixed
    {
        return parent::getModuleConfig($key, $default, $configurationScopes);
    }

    /**
     * Specification:
     * - Reads all configuration values whose keys share the given prefix.
     * - Returns relative sub-keys (prefix stripped) mapped to their resolved values.
     * - Returns an empty array when no settings match the prefix or the Configuration module is unavailable.
     *
     * @api
     *
     * @param array<\Generated\Shared\Transfer\ConfigurationScopeTransfer> $configurationScopes
     *
     * @return array<string, mixed>
     */
    public function getModuleConfigValues(string $prefix, array $configurationScopes = []): array
    {
        return parent::getModuleConfigValues($prefix, $configurationScopes);
    }

    /**
     * Specification:
     * - Returns the path pattern to be used to build the path for Yves assets.
     * - When the path pattern contains the placeholder %theme% it will be replaced with the current theme name e.g. default.
     * - When the path pattern contains the placeholder %namespace%, it is replaced with the current store name
     *   when that store is listed in getYvesAssetsNamespaces(), otherwise the %namespace% path segment is removed.
     *
     * @api
     */
    public function getYvesAssetsUrlPattern(): string
    {
        return $this->get(ShopUiConstants::YVES_ASSETS_URL_PATTERN, '/assets/');
    }

    /**
     * Specification:
     * - Returns the list of store names for which a dedicated asset namespace was built.
     * - Used to resolve the %namespace% placeholder in getYvesAssetsUrlPattern(): a store not in this list
     *   never gets %namespace% substituted, so the asset URL always falls back to the pattern without it.
     *
     * @api
     *
     * @return array<string>
     */
    public function getYvesAssetsNamespaces(): array
    {
        return $this->get(ShopUiConstants::YVES_ASSETS_NAMESPACES, []);
    }

    /**
     * @api
     */
    public function isDevelopmentMode(): bool
    {
        return APPLICATION_ENV === 'development';
    }

    /**
     * Specification:
     * - Returns true if the store routing is enabled.
     *
     * @api
     */
    public function isStoreRoutingEnabled(): bool
    {
        return $this->get(ShopUiConstants::IS_STORE_ROUTING_ENABLED, false);
    }

    /**
     * Specification:
     * - Returns true when components should render `data-qa` test-automation attributes.
     *
     * @api
     */
    public function isQaAttributesEnabled(): bool
    {
        return $this->get(ShopUiConstants::IS_QA_ATTRIBUTES_ENABLED, true);
    }
}
