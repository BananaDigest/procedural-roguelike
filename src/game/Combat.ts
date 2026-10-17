import { Enemy } from "./Enemy.ts";
import { Player } from "./Player.ts";

/**
 * Combat — SCAFFOLD for Week 2 (Day 9). Classic bump-to-attack: moving into
 * an occupied tile resolves an attack instead of a move.
 */

export function playerAttacks(player: Player, enemy: Enemy): void {
  enemy.hp -= player.attack;
}

export function enemyAttacks(enemy: Enemy, player: Player): void {
  player.hp -= enemy.attack;
}

export function isDead(actor: { hp: number }): boolean {
  return actor.hp <= 0;
}
