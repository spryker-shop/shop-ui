import register from 'ShopUi/app/registry';
export default register('self-include', () => import('./self-include'));
