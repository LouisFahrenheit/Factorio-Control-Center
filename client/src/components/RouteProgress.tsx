import { nprogress } from '@mantine/nprogress';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteProgress() {
  const { pathname } = useLocation();

  useEffect(() => {
    nprogress.start();
    const t = window.setTimeout(() => nprogress.complete(), 320);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
