<?php

/**
 * Copyright © 2016-present Spryker Systems GmbH. All rights reserved.
 * Use of this software requires acceptance of the Evaluation License Agreement. See LICENSE file.
 */

namespace SprykerShop\Yves\ProductDetailPage\ResourceCreator;

use Pyz\Yves\Collector\Creator\AbstractResourceCreator;
use Silex\Application;
use Spryker\Shared\Product\ProductConfig;
use Spryker\Yves\Kernel\BundleControllerAction;
use Spryker\Yves\Kernel\Controller\BundleControllerActionRouteNameResolver;
use SprykerShop\Yves\ProductDetailPage\Controller\ProductController;

class ProductDetailPageResourceCreator extends AbstractResourceCreator
{

    /**
     * @return string
     */
    public function getType()
    {
        return ProductConfig::RESOURCE_TYPE_PRODUCT_ABSTRACT;
    }

    /**
     * @param \Silex\Application $application
     * @param array $productData
     *
     * @return array
     */
    public function createResource(Application $application, array $productData)
    {
        $bundleControllerAction = new BundleControllerAction('ProductDetailPage', 'Product', 'detail');
        $routeResolver = new BundleControllerActionRouteNameResolver($bundleControllerAction);
        $service = $this->createServiceForController($application, $bundleControllerAction, $routeResolver);

        return [
            '_controller' => $service,
            '_route' => $routeResolver->resolve(),
            ProductController::ATTRIBUTE_PRODUCT_DATA => $productData,
        ];
    }

}