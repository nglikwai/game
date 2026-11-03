import type * as Phaser from 'phaser';
import pine from '@/assets/maps/pine.png';
import sakura from '@/assets/maps/sakura.png';
import bamboo from '@/assets/maps/bamboo.png';
import rock from '@/assets/maps/rock.png';
import pillar from '@/assets/maps/pillar.png';
import ruin from '@/assets/maps/ruin.png';
import lantern from '@/assets/maps/lantern.png';
import cursedTree from '@/assets/maps/cursed-tree.png';
import watchtower from '@/assets/maps/watchtower.png';
import fortress from '@/assets/maps/fortress.png';
import crate from '@/assets/maps/crate.png';
import barrel from '@/assets/maps/barrel.png';
import shrine from '@/assets/maps/shrine.png';
import type { Tower } from '@/battle/types';

/** Original Blender renders, shared by map thumbnails and battles. Vite fingerprints their URLs. */
export const MAP_PROPS = { pine, sakura, bamboo, rock, pillar, ruin, lantern, 'cursed-tree': cursedTree, watchtower, fortress, crate, barrel, shrine };
export type MapProp = keyof typeof MAP_PROPS;
export type MapPropSources = Partial<Record<MapProp, CanvasImageSource>>;
export const mapPropKey = (kind: MapProp) => `scenery-v1-${kind}`;

export function preloadMapProps(scene: Phaser.Scene) {
  for (const [kind, url] of Object.entries(MAP_PROPS)) {
    const key = mapPropKey(kind as MapProp);
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  }
}

export function mapPropSources(scene: Phaser.Scene): MapPropSources {
  const result: MapPropSources = {};
  // The map painter is also used by non-WebGL previews and logic tests.
  if (!scene.textures.get) return result;
  for (const kind of Object.keys(MAP_PROPS) as MapProp[]) if (scene.textures.exists(mapPropKey(kind))) {
    result[kind] = scene.textures.get(mapPropKey(kind)).getSourceImage() as CanvasImageSource;
  }
  return result;
}

/** Cache variants distinguish late-loaded art from the procedural fallback without repainting every frame. */
export function mapPropSignature(sources: MapPropSources) {
  return Object.keys(MAP_PROPS).map((kind) => sources[kind as MapProp] ? '1' : '0').join('');
}

const treeImages = new WeakMap<Tower, Phaser.GameObjects.Image>();

/** Live objectives use the same artwork but keep their original aura, eyes, HP and destruction effects. */
export function renderCursedTree(scene: Phaser.Scene & { lFloor: Phaser.GameObjects.Container }, tree: Tower, x: number, y: number, small = false): boolean {
  let image = treeImages.get(tree);
  if (!tree.alive) { image?.setVisible(false); return false; }
  if (!scene.textures?.exists(mapPropKey('cursed-tree'))) return false;
  if (!image) {
    image = scene.add.image(x, y, mapPropKey('cursed-tree'));
    scene.lFloor.add(image); treeImages.set(tree, image);
  }
  const size = tree.w * (small ? 1.35 : 2.35);
  const tint = tree.grove === 'respawn' ? 0xffa69c : tree.grove === 'illusion' ? 0xffe2a0 : 0xd1b1ff;
  image.setVisible(true).setPosition(x, y - tree.h * .05).setDisplaySize(size, size).setTint(tint);
  return true;
}
