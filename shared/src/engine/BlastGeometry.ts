import type { ExplosionStyle } from '../types/GameState.ts';

export const BLAST_REACH = 1.8;
export const CLUSTER_REACH = 1.4;

export function blastReach(style: ExplosionStyle): number {
  return style === 'cluster' ? CLUSTER_REACH : BLAST_REACH;
}

export function blastReachRadius(baseRadius: number, style: ExplosionStyle): number {
  return Math.max(0, baseRadius) * blastReach(style);
}
