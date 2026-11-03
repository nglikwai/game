import { mapPropSources, mapPropSignature } from '@/rendering/mapProps';
import { withMapProps } from '@/maps/art/renderedProps';
import * as Phaser from 'phaser';
import { HEIGHT, HUD_HEIGHT, RES, WIDTH } from '@/config';
import { mulberry32, type GameMap, type MapId } from '@/maps/common';
import { COURTYARD } from '@/maps/arenas/courtyard';
import { RIVER } from '@/maps/arenas/river';
import { SNOW } from '@/maps/arenas/snow';
import { TOWN } from '@/maps/arenas/town';
import { LAVA } from '@/maps/arenas/lava';
import { GARDEN } from '@/maps/arenas/garden';
import { DOJO } from '@/maps/arenas/dojo';
import { PADDY } from '@/maps/arenas/paddy';
import { ICE } from '@/maps/arenas/ice';
import { DOCKS } from '@/maps/arenas/docks';
import { ONSEN } from '@/maps/arenas/onsen';
import { GRAVEYARD } from '@/maps/arenas/graveyard';
import { QUEST_MAPS } from '@/maps/quest/underworld';
import { DESERT } from '@/maps/arenas/desert';
import { SWAMP } from '@/maps/arenas/swamp';
import { MAZE } from '@/maps/arenas/maze';
import { CANYON } from '@/maps/arenas/canyon';
import { PEAK } from '@/maps/arenas/peak';
import { BEACH } from '@/maps/arenas/beach';
import { VOLCANO } from '@/maps/arenas/volcano';
import { PORTAL } from '@/maps/arenas/portal';
import { FESTIVAL } from '@/maps/arenas/festival';
import { ROCKSLIDE } from '@/maps/arenas/rockslide';
import { TRAPS_MAP } from '@/maps/arenas/traps';
import { CRYSTAL } from '@/maps/arenas/crystal';
import { CHASM } from '@/maps/arenas/chasm';
import { WORKSHOP } from '@/maps/arenas/workshop';
import { FOG_FOREST } from '@/maps/arenas/fog';
import { SKY } from '@/maps/arenas/sky';
import { ALTAR_MAP } from '@/maps/arenas/altar';
import { TIDAL } from '@/maps/arenas/tidal';
import { DOORS_MAP } from '@/maps/arenas/doors';
import { POWDER } from '@/maps/arenas/powder';
import { BELL } from '@/maps/arenas/bell';
import { BARRIER } from '@/maps/arenas/barrier';
import { WHIRLPOOL } from '@/maps/arenas/whirlpool';
import { HERB_GARDEN } from '@/maps/arenas/herbs';
import { TEA } from '@/maps/arenas/tea';
import { STORM } from '@/maps/arenas/storm';
import { SUNKEN } from '@/maps/arenas/sunken';
import { FROSTFIRE } from '@/maps/arenas/frostfire';
import { ORCHARD } from '@/maps/arenas/orchard';
import { ASTRAL } from '@/maps/arenas/astral';
import { MAP_ART, polishMapArt } from '@/maps/art/finish';

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
  const props = mapPropSources(scene);
  const key = `arena-${map.id}${map.layout ? `-layout-${map.layout.seed}` : ''}-props-${mapPropSignature(props)}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.round(WIDTH * MAP_RES), Math.round((HEIGHT - HUD_HEIGHT) * MAP_RES))!;
  const ctx = tex.getContext();
  ctx.scale(MAP_RES, MAP_RES);
  // Paint in game coordinates (y measured from the top of the game, not the canvas).
  ctx.translate(0, -HUD_HEIGHT);
  const direction = map.id === 'expedition-forest' ? undefined : MAP_ART[map.id];
  const dark = direction?.material === 'ash' || direction?.motif === 'spirit';
  const filter = dark ? 'saturate(0.75) brightness(0.72)' : direction?.material === 'snow' ? 'saturate(0.6) brightness(1.12)' : 'saturate(1.18) brightness(0.83)';
  withMapProps(ctx, map, props, filter, () => map.paint(ctx, mulberry32(8)));
  tex.refresh();
  return key;
}

/** Adds the painted map below the HUD. */
export function addArenaImage(scene: Phaser.Scene, map: GameMap): Phaser.GameObjects.Image {
  return scene.add.image(0, HUD_HEIGHT, addArenaTexture(scene, map)).setOrigin(0, 0).setScale(1 / MAP_RES);
}
