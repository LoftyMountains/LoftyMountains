import type { AnchorHTMLAttributes } from 'react';
export default function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  const { prefetch: _prefetch, ...anchor } = props;
  return <a href={href} {...anchor}>{children}</a>;
}
