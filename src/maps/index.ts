import * as Phaser from 'phaser';
import { HEIGHT, HUD_HEIGHT, RES, WIDTH } from '../config';
import { mulberry32, type GameMap, type MapId } from './common';
import { COURTYARD } from './courtyard';
import { RIVER } from './river';
import { SNOW } from './snow';
import { TOWN } from './town';
import { LAVA } from './lava';
import { GARDEN } from './garden';
import { DOJO } from './dojo';
import { PADDY } from './paddy';
import { ICE } from './ice';
import { DOCKS } from './docks';
import { ONSEN } from './onsen';
import { GRAVEYARD } from './graveyard';
import { QUEST_MAPS } from './hell';
import { DESERT } from './desert';
import { SWAMP } from './swamp';
import { MAZE } from './maze';
import { CANYON } from './canyon';
import { PEAK } from './peak';
import { BEACH } from './beach';
import { VOLCANO } from './volcano';
import { PORTAL } from './portal';
import { FESTIVAL } from './festival';
import { ROCKSLIDE } from './rockslide';
import { TRAPS_MAP } from './traps';
import { CRYSTAL } from './crystal';
import { CHASM } from './chasm';
import { WORKSHOP } from './workshop';
import { FOG_FOREST } from './fog';
import { SKY } from './sky';
import { ALTAR_MAP } from './altar';
import { TIDAL } from './tidal';
import { DOORS_MAP } from './doors';
import { POWDER } from './powder';
import { BELL } from './bell';
import { BARRIER } from './barrier';
import { WHIRLPOOL } from './whirlpool';
import { HERB_GARDEN } from './herbs';

export { QUEST_MAPS };

export * from './common';

export const MAPS: GameMap[] = [COURTYARD, RIVER, SNOW, TOWN, LAVA, GARDEN, DOJO, PADDY, ICE, DOCKS, ONSEN, GRAVEYARD, DESERT, SWAMP, MAZE, CANYON, PEAK, BEACH, VOLCANO, PORTAL, FESTIVAL, ROCKSLIDE, TRAPS_MAP, CRYSTAL, CHASM, WORKSHOP, FOG_FOREST, SKY, ALTAR_MAP, TIDAL, DOORS_MAP, POWDER, BELL, BARRIER, WHIRLPOOL, HERB_GARDEN];

/** Map textures are big; 2× is plenty sharp and keeps six of them affordable in GPU memory. */
export const MAP_RES = Math.min(RES, 2);

/** Any map by id, including the Quest-only ones (which map select and Random don't offer). */
export const getMap = (id: MapId | undefined): GameMap => [...MAPS, ...QUEST_MAPS].find((m) => m.id === id) ?? COURTYARD;

/** Paints a map's texture the first time and returns its key (also used for menu backdrops and previews). */
export function addArenaTexture(scene: Phaser.Scene, map: GameMap = COURTYARD): string {
  const key = `arena-${map.id}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.round(WIDTH * MAP_RES), Math.round((HEIGHT - HUD_HEIGHT) * MAP_RES))!;
  const ctx = tex.getContext();
  ctx.scale(MAP_RES, MAP_RES);
  // Paint in game coordinates (y measured from the top of the game, not the canvas).
  ctx.translate(0, -HUD_HEIGHT);
  map.paint(ctx, mulberry32(8));
  tex.refresh();
  return key;
}

/** Adds the painted map below the HUD. */
export function addArenaImage(scene: Phaser.Scene, map: GameMap): Phaser.GameObjects.Image {
  return scene.add.image(0, HUD_HEIGHT, addArenaTexture(scene, map)).setOrigin(0, 0).setScale(1 / MAP_RES);
}
