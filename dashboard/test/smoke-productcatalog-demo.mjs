import { listProductsWithAssets } from '../server/lib/productCatalog.js';

const products = listProductsWithAssets();
console.log(JSON.stringify(products, null, 2));
