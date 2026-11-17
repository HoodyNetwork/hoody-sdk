// useIpLookup: the countries of the visitor addresses a list shows now. It reads core's ipGeo as a store (version first,
// then a peek per address, so a render never moves the cache under itself) and asks for the addresses in view; the
// platform is asked only for public IPv4 and at most 25 at a time, which ipGeo decides, not this hook.
import { ipGeo, type GeoState, type IpGeo } from '@core';
import { useEffect, useSyncExternalStore } from 'react';

/** `ips` are the addresses of the rows drawn now (any text; ipGeo drops what it must not look up). `geo` is for tests. */
export function useIpLookup(ips: readonly string[], geo: IpGeo = ipGeo): (ip: string) => GeoState {
  const version = useSyncExternalStore(geo.subscribe, geo.version, geo.version);
  const key = ips.join('\n');
  // Asks again when the shown addresses change, and when the cache changed (an expired entry reads as pending until asked).
  useEffect(() => { geo.want(key ? key.split('\n') : []); }, [geo, key, version]);
  return (ip) => geo.peek(ip);
}
