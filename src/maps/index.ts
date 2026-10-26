import * as Phaser from 'phaser';
import { HEIGHT, HUD_HEIGHT, RES, WIDTH } from '@/config';
import { mulberry32, type GameMap, type MapId } from '@/maps/common';
import { COURTYARD } from '@/maps/courtyard';
import { RIVER } from '@/maps/river';
import { SNOW } from '@/maps/snow';
import { TOWN } from '@/maps/town';
import { LAVA } from '@/maps/lava';
import { GARDEN } from '@/maps/garden';
import { DOJO } from '@/maps/dojo';
import { PADDY } from '@/maps/paddy';
import { ICE } from '@/maps/ice';
import { DOCKS } from '@/maps/docks';
import { ONSEN } from '@/maps/onsen';
import { GRAVEYARD } from '@/maps/graveyard';
import { QUEST_MAPS } from '@/maps/hell';
import { DESERT } from '@/maps/desert';
import { SWAMP } from '@/maps/swamp';
import { MAZE } from '@/maps/maze';
import { CANYON } from '@/maps/canyon';
import { PEAK } from '@/maps/peak';
import { BEACH } from '@/maps/beach';
import { VOLCANO } from '@/maps/volcano';
import { PORTAL } from '@/maps/portal';
import { FESTIVAL } from '@/maps/festival';
import { ROCKSLIDE } from '@/maps/rockslide';
import { TRAPS_MAP } from '@/maps/traps';
import { CRYSTAL } from '@/maps/crystal';
import { CHASM } from '@/maps/chasm';
import { WORKSHOP } from '@/maps/workshop';
import { FOG_FOREST } from '@/maps/fog';
import { SKY } from '@/maps/sky';
import { ALTAR_MAP } from '@/maps/altar';
import { TIDAL } from '@/maps/tidal';
import { DOORS_MAP } from '@/maps/doors';
import { POWDER } from '@/maps/powder';
import { BELL } from '@/maps/bell';
import { BARRIER } from '@/maps/barrier';
import { WHIRLPOOL } from '@/maps/whirlpool';
import { HERB_GARDEN } from '@/maps/herbs';
import { TEA } from '@/maps/tea';
import { STORM } from '@/maps/storm';
import { SUNKEN } from '@/maps/sunken';
import { FROSTFIRE } from '@/maps/frostfire';
import { ORCHARD } from '@/maps/orchard';
import { ASTRAL } from '@/maps/astral';
import { polishMapArt } from '@/maps/finishArt';

export { QUEST_MAPS };

export * from '@/maps/common';

export const MAPS: GameMap[] = [COURTYARD, RIVER, SNOW, TOWN, LAVA, GARDEN, DOJO, PADDY, ICE, DOCKS, ONSEN, GRAVEYARD, DESERT, SWAMP, MAZE, CANYON, PEAK, BEACH, VOLCANO, PORTAL, FESTIVAL, ROCKSLIDE, TRAPS_MAP, CRYSTAL, CHASM, WORKSHOP, FOG_FOREST, SKY, ALTAR_MAP, TIDAL, DOORS_MAP, POWDER, BELL, BARRIER, WHIRLPOOL, HERB_GARDEN,
  TEA, STORM, SUNKEN, FROSTFIRE, ORCHARD, ASTRAL];

// Apply once so every consumer, including thumbnails, uses the same finished art.
for (const map of [...MAPS, ...QUEST_MAPS]) polishMapArt(map);

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
