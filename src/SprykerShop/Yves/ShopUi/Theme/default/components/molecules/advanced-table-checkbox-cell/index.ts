import './style.scss';
import register from 'ShopUi/app/registry';
export default register(
    'advanced-table-checkbox-cell',
    () =>
        import(
            /* webpackMode: "lazy" */
            /* webpackChunkName: "advanced-table-checkbox-cell" */
            './advanced-table-checkbox-cell'
        ),
);
