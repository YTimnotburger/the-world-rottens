import * as THREE from 'three';
import { ProceduralTextureSet } from '../textures';
import { BuiltWorld } from '../worldBuilder';
import {
  addConsoleInteractable,
  addDestructibleBarricade,
  addDetailedPillar,
  addDynamicDoor,
  addFloorDecal,
  addLevelExitGate,
  addPickup,
  addPipeConduit,
  addRoomLighting,
  addSaveAndWorkbench,
  addSolidBox,
  addStandardFloor,
  addStructuralArchRibs,
  addWallXWithDoor,
  createLevelContext,
  finalizeLevelWorld,
  LevelBuildContext,
  makeTiledMat,
} from './levelShared';

function addBallisticTargetPylon(
  ctx: LevelBuildContext,
  x: number,
  z: number,
  steelMat: THREE.Material,
  accentColor: number
): void {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 1.0), steelMat);
  base.position.y = 0.11;
  base.castShadow = true;
  base.receiveShadow = true;

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.8, 10), steelMat);
  mast.position.y = 1.0;
  mast.castShadow = true;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 0.16), steelMat);
  frame.position.y = 1.75;
  frame.castShadow = true;

  const targetPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 1.1, 0.2),
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.45,
      metalness: 0.55,
    })
  );
  targetPlate.position.y = 1.75;

  const centerRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.24, 16),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    })
  );
  centerRing.rotation.x = Math.PI / 2;
  centerRing.position.set(0, 1.75, 0.02);

  const headTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.24, 12),
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.7,
      roughness: 0.25,
    })
  );
  headTarget.rotation.x = Math.PI / 2;
  headTarget.position.set(0, 2.22, 0.02);

  grp.add(base, mast, frame, targetPlate, centerRing, headTarget);
  grp.position.set(x, 0, z);
  ctx.scene.add(grp);

  ctx.colliders.push({
    minX: x - 0.7,
    maxX: x + 0.7,
    minY: 0,
    maxY: 2.4,
    minZ: z - 0.5,
    maxZ: z + 0.5,
  });
}

export function buildTutorialWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet
): BuiltWorld {
  const ctx = createLevelContext(scene, textures, 0x05070b, 0x070a10, 0.014);

  const floorMat = makeTiledMat(ctx, {
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    roughnessMap: textures.concreteRoughness,
    repeatX: 10,
    repeatY: 20,
    color: 0x262c36,
    roughness: 0.8,
    metalness: 0.18,
  });

  const wallMat = makeTiledMat(ctx, {
    map: textures.wallPanelMap,
    normalMap: textures.wallPanelNormal,
    roughnessMap: textures.wallPanelRoughness,
    repeatX: 10,
    repeatY: 3,
    color: 0x242c38,
    roughness: 0.58,
    metalness: 0.45,
  });

  const steelMat = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    roughnessMap: textures.metalRoughness,
    metalnessMap: textures.metalMetalness,
    repeatX: 4,
    repeatY: 4,
    color: 0x2a3342,
    roughness: 0.38,
    metalness: 0.82,
  });

  const ceilMat = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    repeatX: 10,
    repeatY: 16,
    color: 0x11151d,
    roughness: 0.7,
    metalness: 0.5,
  });

  const hazMat = new THREE.MeshStandardMaterial({
    map: textures.hazardStripeMap,
    roughness: 0.42,
    metalness: 0.4,
  });
  ctx.disposeables.push(hazMat);

  // Main Training Bay Hall: X [-18..18], Z [-52..22], Ceiling 7.0
  addStandardFloor(ctx, 36, 74, 0, -15, floorMat, 7.0, ceilMat);

  // Perimeter Walls
  addSolidBox(ctx, -18.5, 3.5, -15, 1, 7, 74, wallMat);
  addSolidBox(ctx, 18.5, 3.5, -15, 1, 7, 74, wallMat);
  addSolidBox(ctx, 0, 3.5, 22.5, 38, 7, 1, wallMat);
  addSolidBox(ctx, 0, 3.5, -52.5, 38, 7, 1, wallMat);

  // Structural Arch Ribs & Overhead Conduits
  addStructuralArchRibs(ctx, -18, 18, [14, 2, -10, -22, -34, -44], 7.0, steelMat, hazMat);
  addPipeConduit(ctx, -16.8, 5.8, 20, -16.8, 5.8, -50, 0.22, steelMat);
  addPipeConduit(ctx, 16.8, 5.8, 20, 16.8, 5.8, -50, 0.22, steelMat);

  // Surface zones (industrial grating in firing range & center lane)
  ctx.surfaceZones.push({ minX: -18, maxX: 18, minZ: -52, maxZ: 22, surface: 'industrial' });

  // Floor hazard guide markings along the central training spine
  addFloorDecal(ctx, 0, 14, 4.2, 4.2, textures.hazardStripeMap, 0.45);
  addFloorDecal(ctx, 0, -15, 3.2, 22, textures.hazardStripeMap, 0.25);

  // Zone 1: Jump Hurdle & Crouch Cover (z = 9.5 & z = 4.5)
  const hurdle = addSolidBox(ctx, 0, 0.28, 9.5, 5.6, 0.56, 0.42, hazMat);
  hurdle.castShadow = true;
  addSolidBox(ctx, -4.4, 0.55, 4.5, 2.8, 1.1, 0.7, steelMat);
  addSolidBox(ctx, 4.4, 0.55, 4.5, 2.8, 1.1, 0.7, steelMat);

  // Zone 2 (West): Breach Alcove with Destructible Barricade + Ammo/Battery
  addSolidBox(ctx, -14.5, 3.5, -1.5, 7, 7, 0.8, wallMat);
  addSolidBox(ctx, -7.8, 3.5, -5.5, 0.8, 7, 8, wallMat);
  addDestructibleBarricade(ctx, 'tut_barricade_1', -9.6, -1.5, 3.2, 1.5, 0.65, 0x92400e);
  addPickup(ctx, 'tut_ammo_1', 'ammo', 'RECOVER AMMO CRATE', -12.5, 0.2, -5.0, 0xf59e0b);
  addPickup(ctx, 'tut_batt_1', 'battery', 'RECOVER BATTERY CELL', -10.0, 0.25, -5.5, 0x38bdf8);

  // Zone 2 (East): Combat Firing Lane + Cover + Target Pylons + Live Drone Targets
  addDetailedPillar(ctx, 3.2, -9.5, 1.2, 7.0, 1.2, wallMat, steelMat, 0xef4444);
  addSolidBox(ctx, 9.0, 0.52, -10.5, 8.5, 1.04, 0.55, steelMat);
  addBallisticTargetPylon(ctx, 7.2, -16.5, steelMat, 0xef4444);
  addBallisticTargetPylon(ctx, 12.2, -18.5, steelMat, 0xf59e0b);

  ctx.enemySpawns.push(
    {
      id: 'tut_target_crawler',
      type: 'crawler',
      position: new THREE.Vector3(9.8, 0, -14.5),
      patrolTarget: new THREE.Vector3(12.2, 0, -14.5),
      initiallyActive: true,
    },
    {
      id: 'tut_target_scrapper',
      type: 'scrapper',
      position: new THREE.Vector3(4.5, 0, -24.0),
      patrolTarget: new THREE.Vector3(9.5, 0, -24.0),
      initiallyActive: true,
    }
  );

  // Zone 3: Field Survival, Lore Primer, Save Terminal & Armory Workbench
  addPickup(ctx, 'tut_medkit_1', 'medkit', 'PICK UP FIELD MEDKIT', -5.0, 0.16, -24.5, 0xef4444);
  addPickup(ctx, 'tut_lore_1', 'lore', 'READ LAST DEFENCE FIELD PRIMER', 5.0, 0.12, -24.5, 0x38bdf8, {
    loreId: 'doc_tutorial_manual',
  });
  addSaveAndWorkbench(ctx, 'tut', -12.5, -28.5, 12.5, -28.5);

  // Zone 4: Partition Wall + Airlock Door + Practice Math Relay & Airlock Override + Extraction Gate
  addWallXWithDoor(ctx, -36, -18, 18, 7.0, 0.85, 0, 4.8, 3.9, wallMat);
  addDynamicDoor(ctx, 'door_tut_exit', 0, -36, 4.6, 3.8, 0.5, 0x1e293b, 0x38bdf8);

  addConsoleInteractable(
    ctx,
    'tut_math_relay',
    'puzzle',
    'PRACTICE GENERATOR MATH OVERRIDE',
    -4.6,
    -33.2,
    0xf59e0b,
    {
      puzzleId: 'puz_tutorial_relay',
      doorId: 'door_tut_exit',
    }
  );

  addConsoleInteractable(
    ctx,
    'tut_gate_override',
    'gate_panel',
    'OPEN EXTRACTION AIRLOCK DOOR',
    4.6,
    -33.2,
    0x22c55e,
    {
      doorId: 'door_tut_exit',
    }
  );

  // Extraction Airlock in North Chamber
  addLevelExitGate(ctx, 'tut_exit', 'COMPLETE TRAINING & EXTRACT', 0, -48.5, 0);

  // Clean Tactical Lighting Rig
  addRoomLighting(ctx, [
    [0, 5.8, 15, 0xbae6fd, false],
    [0, 5.8, 4, 0xfde68a, false],
    [-11, 5.4, -4, 0xf59e0b, true],
    [9, 5.8, -14, 0xfca5a5, false],
    [0, 5.8, -24, 0xbae6fd, false],
    [0, 5.8, -33, 0x38bdf8, false],
    [0, 5.6, -44, 0x4ade80, false],
  ]);

  ctx.sparkEmitters.push({
    position: new THREE.Vector3(-16.5, 4.2, -1.5),
    rate: 2.5,
  });

  return finalizeLevelWorld(ctx, new THREE.Vector3(0, 0.05, 16.5), 0);
}
