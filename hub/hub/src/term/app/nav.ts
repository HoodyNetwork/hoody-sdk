// In-app navigation for terminal siblings: a Hub href ("/logs?sel=a", or "#/logs") to the router.
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';

export function useGoTerm(): (href: string) => void {
  const router = useRouter();
  return useCallback((href: string) => {
    const to = href.startsWith('#') ? href.slice(1) : href;
    if (to.startsWith('/') && !to.startsWith('/auth/')) void router.navigate({ href: to } as never);
  }, [router]);
}
