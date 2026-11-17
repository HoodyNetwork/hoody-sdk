// LaunchHold for a Board tile as the Board keeps it: its computer row and its tile record, mapped to a target and
// a place here so the Board's mount stays one line. Only terminal and display program tiles and http port tiles
// can show a launch; every other tile (agent, files, a web address, an exec script) is its frame, untouched.
import type { Target } from '@core';
import type { ReactNode } from 'react';
import { LaunchHold } from './LaunchHold';
import { placeOfTile, type AnyTile, type HoldComputer } from './match';

export interface TileHoldProps {
  computer: HoldComputer | null;
  tile: AnyTile | null;
  children: ReactNode;
}

export function TileHold({ computer, tile, children }: TileHoldProps) {
  const at = placeOfTile(tile);
  if (!computer || !at) return <>{children}</>;
  const target: Target = { project: { id: computer.project_id }, container: { id: computer.id, ...(computer.server_name ? { server_name: computer.server_name } : {}) } };
  return (
    <LaunchHold target={target} at={at}>
      {children}
    </LaunchHold>
  );
}
