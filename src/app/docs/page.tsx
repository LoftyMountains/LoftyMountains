import { useLocale as __useLocale } from '@/i18n';
import DocsClient from './DocsClient';
import { ENDPOINT_COUNT } from './apiCatalog';
export default function DocsPage() {
    __useLocale();
    return <DocsClient />;
}
