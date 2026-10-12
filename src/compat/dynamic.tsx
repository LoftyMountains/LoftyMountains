import { lazy, Suspense, type ComponentType } from 'react';
export default function dynamic<P extends object = Record<string, unknown>>(loader: () => Promise<{ default: ComponentType<P> }>, options?: { ssr?: boolean; loading?: ComponentType }) {
  const Component = lazy(loader);
  const Loading = options?.loading;
  return function DynamicComponent(props: P) {
    return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>;
  };
}
