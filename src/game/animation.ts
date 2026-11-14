import * as THREE from 'three';
import { EnemyModelRefs, TentacleChainRig } from './models';
import { EnemyAIState, EnemyType } from './types';

// Zero-GC module-level scratch math objects
const _wPos = new THREE.Vector3();
const _ownerPos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

export interface SimpleCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export interface SimpleFireHeatZone {
  position: THREE.Vector3;
  heatRadius: number;
  intensity: number;
}

export type NeckAttackKind =
  | 'none'
  | 'forward_lunge'
  | 'sideways_whip'
  | 'crushing_strike'
  | 'wide_sweep'
  | 'twisting_bite';

export interface TitanforgedNeckState {
  currentYaw: number;
  currentPitch: number;
  yawVel: number;
  pitchVel: number;
  attackKind: NeckAttackKind;
  attackTimer: number;
  attackDuration: number;
  attackCooldown: number;
  attackHitFired: boolean;
  attackDir: number;
  roarTimer: number;
  recoilTimer: number;
  trackingImpairTimer: number;
  neckDamageRatio: number; // 0 = undamaged, 1 = heavily damaged
  restrictedSide: number;
  sparkBurstPending: boolean;
  suddenGlanceTimer: number;
  suddenGlanceYaw: number;
  mouthOpen: number;
}

export function createTitanforgedNeckState(): TitanforgedNeckState {
  return {
    currentYaw: 0,
    currentPitch: 0,
    yawVel: 0,
    pitchVel: 0,
    attackKind: 'none',
    attackTimer: 0,
    attackDuration: 1.35,
    attackCooldown: 1.8,
    attackHitFired: false,
    attackDir: 1,
    roarTimer: 0,
    recoilTimer: 0,
    trackingImpairTimer: 0,
    neckDamageRatio: 0,
    restrictedSide: 1,
    sparkBurstPending: false,
    suddenGlanceTimer: 3.5,
    suddenGlanceYaw: 0,
    mouthOpen: 0.15,
  };
}

export interface TentaclePhysicsState {
  velX: number[];
  velY: number[];
  posX: number[];
  posY: number[];
  attackTimer: number;
  attackCooldown: number;
  attackHitFired: boolean;
  heatRecoil: number[];
}

export function createTentaclePhysicsState(refs: EnemyModelRefs): TentaclePhysicsState {
  const n = refs.tentacleChains.length;
  return {
    velX: new Array(n).fill(0),
    velY: new Array(n).fill(0),
    posX: new Array(n).fill(0),
    posY: new Array(n).fill(0),
    attackTimer: 0,
    attackCooldown: 1.4,
    attackHitFired: false,
    heatRecoil: new Array(n).fill(0),
  };
}

export function triggerNeckDamageReaction(
  state: TitanforgedNeckState,
  damageFraction: number,
  sideHint: number
): void {
  state.neckDamageRatio = Math.min(1, state.neckDamageRatio + damageFraction * 1.4);
  state.recoilTimer = 0.58;
  state.trackingImpairTimer = 1.65;
  state.restrictedSide = sideHint >= 0 ? 1 : -1;
  state.sparkBurstPending = true;
}

export function updateTitanforgedNeckAnimation(
  refs: EnemyModelRefs,
  state: TitanforgedNeckState,
  params: {
    dt: number;
    time: number;
    ownerPos: THREE.Vector3;
    ownerYaw: number;
    targetPos: THREE.Vector3;
    lastKnownPos: THREE.Vector3;
    targetOccluded: boolean;
    aiState: EnemyAIState;
    hollowExposed: boolean;
    bossPhase: number;
    onStrikeHit?: (kind: NeckAttackKind, headWorldPos: THREE.Vector3, range: number) => void;
    onNeckSpark?: (worldPos: THREE.Vector3) => void;
  }
): void {
  const joints = refs.neckJoints;
  if (!joints || joints.length === 0) return;

  const { dt, time, ownerPos, ownerYaw, targetPos, lastKnownPos, targetOccluded, aiState, bossPhase } = params;

  // 1. Occasional sudden predatory head glance / inspection turns during idle/search
  state.suddenGlanceTimer -= dt;
  if (state.suddenGlanceTimer <= 0) {
    state.suddenGlanceTimer = 2.4 + ((Math.sin(time * 7.1) + 1) * 0.5) * 3.8;
    state.suddenGlanceYaw = Math.sin(time * 13.7) * 0.28;
  }

  if (state.roarTimer > 0) state.roarTimer = Math.max(0, state.roarTimer - dt);
  if (state.recoilTimer > 0) state.recoilTimer = Math.max(0, state.recoilTimer - dt);
  if (state.trackingImpairTimer > 0) state.trackingImpairTimer = Math.max(0, state.trackingImpairTimer - dt);
  if (state.attackCooldown > 0) state.attackCooldown = Math.max(0, state.attackCooldown - dt);

  // 2. Smooth Target Tracking vs Cover Investigation
  const focusPos = targetOccluded ? lastKnownPos : targetPos;
  _toTarget.copy(focusPos).sub(ownerPos);
  const horizDist = Math.hypot(_toTarget.x, _toTarget.z) || 0.001;

  let desiredYaw = 0;
  let desiredPitch = 0;

  if (aiState === 'CHASE' || aiState === 'ATTACK' || aiState === 'SEARCH') {
    const worldAngle = Math.atan2(_toTarget.x, _toTarget.z);
    let relYaw = worldAngle - ownerYaw;
    while (relYaw > Math.PI) relYaw -= Math.PI * 2;
    while (relYaw < -Math.PI) relYaw += Math.PI * 2;
    // Clamp realistic spine turning limits so head never twists through neck
    desiredYaw = THREE.MathUtils.clamp(relYaw, -0.82, 0.82);

    // Lower head to inspect player when close or investigating behind cover
    const headHeight = ownerPos.y + 6.4;
    const pitchToPlayer = Math.atan2(focusPos.y + 1.3 - headHeight, horizDist);
    const closeBow = horizDist < 12 ? -0.18 * (1 - horizDist / 12) : 0;
    const coverScanYaw = targetOccluded ? Math.sin(time * 1.8) * 0.34 : 0;
    const coverScanPitch = targetOccluded ? -0.16 : 0;

    desiredYaw = THREE.MathUtils.clamp(desiredYaw + coverScanYaw, -0.88, 0.88);
    desiredPitch = THREE.MathUtils.clamp(-pitchToPlayer * 0.65 + closeBow + coverScanPitch, -0.45, 0.58);
  } else {
    desiredYaw = Math.sin(time * 0.53) * 0.24 + state.suddenGlanceYaw * 0.6;
    desiredPitch = Math.sin(time * 0.41) * 0.14;
  }

  // Tracking inaccuracy & twitch when neck is injured
  if (state.trackingImpairTimer > 0) {
    desiredYaw += Math.sin(time * 19.3) * 0.24 * (state.trackingImpairTimer / 1.65);
    desiredPitch += Math.cos(time * 15.7) * 0.16 * (state.trackingImpairTimer / 1.65);
  }

  // Second-order spring tracking for heavy biological head weight
  const stiffness = state.trackingImpairTimer > 0 ? 12 : 24;
  const damping = state.trackingImpairTimer > 0 ? 4.5 : 8.5;
  state.yawVel += (-stiffness * (state.currentYaw - desiredYaw) - damping * state.yawVel) * dt;
  state.pitchVel += (-stiffness * (state.currentPitch - desiredPitch) - damping * state.pitchVel) * dt;
  state.currentYaw = THREE.MathUtils.clamp(state.currentYaw + state.yawVel * dt, -0.95, 0.95);
  state.currentPitch = THREE.MathUtils.clamp(state.currentPitch + state.pitchVel * dt, -0.58, 0.65);

  // 3. Trigger Neck Attacks during close/mid combat
  if (
    state.attackKind === 'none' &&
    state.attackCooldown <= 0 &&
    aiState === 'ATTACK' &&
    horizDist < 11.5 &&
    !targetOccluded
  ) {
    const attacks: NeckAttackKind[] = [
      'forward_lunge',
      'sideways_whip',
      'crushing_strike',
      'wide_sweep',
      'twisting_bite',
    ];
    const pick = attacks[Math.floor((time * 13.3 + bossPhase) % attacks.length)];
    state.attackKind = pick;
    state.attackTimer = 0;
    state.attackDuration = pick === 'wide_sweep' || pick === 'crushing_strike' ? 1.48 : 1.28;
    state.attackCooldown = bossPhase >= 3 ? 2.1 : 2.9;
    state.attackHitFired = false;
    state.attackDir = Math.sin(time * 9.7) >= 0 ? 1 : -1;
  }

  // 4. Evaluate Attack Phase Envelope (Anticipation -> Execution -> Overshoot -> Recovery)
  let atkCoilZ = 0;
  let atkPitch = 0;
  let atkYaw = 0;
  let atkRoll = 0;
  let atkMouthTarget = 0.18;

  if (state.attackKind !== 'none') {
    state.attackTimer += dt;
    const p = state.attackTimer / state.attackDuration;

    if (p < 0.34) {
      // Anticipation: pull back, compress vertebrae, expand Blood-Worm mouth wide
      const a = Math.sin((p / 0.34) * (Math.PI / 2));
      atkMouthTarget = 0.45 + 0.55 * a;
      if (state.attackKind === 'forward_lunge' || state.attackKind === 'twisting_bite') {
        atkCoilZ = -0.35 * a;
        atkPitch = -0.34 * a;
        atkRoll = state.attackKind === 'twisting_bite' ? state.attackDir * 0.55 * a : 0;
      } else if (state.attackKind === 'sideways_whip' || state.attackKind === 'wide_sweep') {
        atkYaw = -state.attackDir * 0.72 * a;
        atkCoilZ = -0.2 * a;
      } else if (state.attackKind === 'crushing_strike') {
        atkPitch = -0.58 * a;
        atkCoilZ = -0.25 * a;
      }
    } else if (p < 0.56) {
      // Execution: explosive thrust / whip / crush
      const e = (p - 0.34) / 0.22;
      const snap = Math.sin(e * Math.PI * 0.5);
      atkMouthTarget = 1.0 - e * 0.35;
      if (state.attackKind === 'forward_lunge') {
        atkCoilZ = -0.35 + snap * 1.15;
        atkPitch = -0.34 + snap * 0.62;
      } else if (state.attackKind === 'twisting_bite') {
        atkCoilZ = -0.35 + snap * 1.05;
        atkPitch = -0.25 + snap * 0.52;
        atkRoll = state.attackDir * (0.55 - snap * 1.25);
      } else if (state.attackKind === 'sideways_whip') {
        atkYaw = state.attackDir * (-0.72 + snap * 1.56);
        atkCoilZ = snap * 0.42;
      } else if (state.attackKind === 'wide_sweep') {
        atkYaw = state.attackDir * (-0.78 + snap * 1.72);
        atkPitch = 0.22 * snap;
        atkCoilZ = snap * 0.48;
      } else if (state.attackKind === 'crushing_strike') {
        atkPitch = -0.58 + snap * 1.16;
        atkCoilZ = snap * 0.52;
      }

      if (!state.attackHitFired && e >= 0.55 && params.onStrikeHit) {
        state.attackHitFired = true;
        const tipNode = refs.jawTeethRing ?? joints[joints.length - 1].pivot;
        tipNode.getWorldPosition(_wPos);
        params.onStrikeHit(state.attackKind, _wPos, 5.2);
      }
    } else if (p < 1.0) {
      // Overshoot + damped biological recovery settle
      const r = (p - 0.56) / 0.44;
      const settle = Math.exp(-3.8 * r) * Math.cos(r * Math.PI * 1.4);
      atkMouthTarget = 0.2 + 0.3 * Math.max(0, 1 - r * 2);
      if (state.attackKind === 'forward_lunge' || state.attackKind === 'twisting_bite') {
        atkCoilZ = 0.8 * settle;
        atkPitch = 0.28 * settle;
      } else if (state.attackKind === 'sideways_whip' || state.attackKind === 'wide_sweep') {
        atkYaw = state.attackDir * 0.85 * settle;
      } else if (state.attackKind === 'crushing_strike') {
        atkPitch = 0.58 * settle;
      }
    } else {
      state.attackKind = 'none';
    }
  }

  // Roar sequence overrides mouth openness
  if (state.roarTimer > 0) {
    atkMouthTarget = Math.max(atkMouthTarget, 0.95);
  }
  state.mouthOpen = THREE.MathUtils.damp(state.mouthOpen, atkMouthTarget, 9, dt);

  // 5. Distribute Layered Organic Movement + Tracking + Attack + Damage Recoil across 7 Neck Joints
  const recoilNorm = state.recoilTimer / 0.58;
  const dmgLimit = 1 - state.neckDamageRatio * 0.32; // injured neck loses some smooth range
  const perJointYaw = (state.currentYaw * dmgLimit + atkYaw) / joints.length;
  const perJointPitch = (state.currentPitch * dmgLimit + atkPitch) / joints.length;

  // Sparks from damaged metallic vertebra
  if (state.sparkBurstPending && params.onNeckSpark) {
    state.sparkBurstPending = false;
    const midJoint = joints[Math.min(3, joints.length - 1)].pivot;
    midJoint.getWorldPosition(_wPos);
    params.onNeckSpark(_wPos);
  } else if (state.neckDamageRatio > 0.35 && Math.sin(time * 23.7) > 0.97 && params.onNeckSpark) {
    const midJoint = joints[Math.min(2, joints.length - 1)].pivot;
    midJoint.getWorldPosition(_wPos);
    params.onNeckSpark(_wPos);
  }

  for (let s = 0; s < joints.length; s++) {
    const j = joints[s];
    const phase = s * 0.72;

    // Non-pendulum layered biological sway (incommensurate frequencies)
    const swayY =
      Math.sin(time * 1.13 + phase) * 0.055 +
      Math.sin(time * 2.31 - phase * 0.6) * 0.028 +
      Math.cos(time * 0.57 + s * 0.35) * 0.032;
    const swayX =
      Math.cos(time * 0.89 + phase * 0.9) * 0.045 +
      Math.sin(time * 1.97 + phase) * 0.022;
    const twistZ =
      Math.sin(time * 0.73 + phase * 1.1) * 0.05 +
      (atkRoll / joints.length);

    // Peristaltic muscular compression/extension wave travelling base -> head
    const peristalsis = Math.sin(time * 3.4 - s * 0.85);
    const stretchZ = 1 + atkCoilZ * 0.28 + peristalsis * 0.065;
    const muscleBulge = 1 + (1 - stretchZ) * 0.45 + peristalsis * 0.08;

    // Damage recoil kink + asymmetric restriction
    const recoilPitch = recoilNorm > 0 ? -Math.sin(recoilNorm * Math.PI) * 0.14 : 0;
    const recoilYaw = recoilNorm > 0 ? state.restrictedSide * Math.sin(recoilNorm * Math.PI * 2) * 0.1 : 0;

    j.pivot.position.set(
      j.restPos.x,
      j.restPos.y * (1 + atkCoilZ * 0.08),
      j.restPos.z * stretchZ
    );
    j.pivot.rotation.set(
      THREE.MathUtils.clamp(j.restRotX + perJointPitch + swayX + recoilPitch, -0.48, 0.48),
      THREE.MathUtils.clamp(perJointYaw + swayY + recoilYaw, -0.38, 0.38),
      twistZ + state.neckDamageRatio * state.restrictedSide * 0.04
    );

    j.muscleMesh.scale.set(muscleBulge, 1, muscleBulge);
    j.tendonL.scale.set(1, 1 + Math.max(0, perJointYaw) * 1.4, 1);
    j.tendonR.scale.set(1, 1 + Math.max(0, -perJointYaw) * 1.4, 1);
    const veinPulse = 1 + Math.max(0, Math.sin(time * 5.2 - s * 0.9)) * 0.16;
    j.veinRing.scale.set(veinPulse, veinPulse, 1);
  }

  // Visible bruised/charred color shift on damaged neck tissue
  if (refs.neckMaterials && refs.neckMaterials[0]) {
    const mat = refs.neckMaterials[0];
    const dmg = state.neckDamageRatio;
    mat.color.setRGB(
      THREE.MathUtils.lerp(0.46, 0.24, dmg),
      THREE.MathUtils.lerp(0.08, 0.04, dmg),
      THREE.MathUtils.lerp(0.12, 0.06, dmg)
    );
  }

  // 6. Blood-Worm Mouth Expansion, Inner Throat & Concentric Tooth Rings
  if (refs.jawTeethRing) {
    const breatheMaw = Math.sin(time * 3.8) * 0.05;
    const expand = 0.88 + state.mouthOpen * 0.46 + breatheMaw;
    refs.jawTeethRing.scale.set(expand, expand, 1 + state.mouthOpen * 0.18);
  }
  if (refs.innerThroatRing) {
    const swallow = 0.85 + Math.sin(time * 6.4) * 0.18 + state.mouthOpen * 0.22;
    refs.innerThroatRing.scale.set(swallow, swallow, 1);
  }
  if (refs.toothRings) {
    refs.toothRings.forEach((tr, idx) => {
      const dir = idx % 2 === 0 ? 1 : -1;
      tr.rotation.z += dt * dir * (0.45 + state.mouthOpen * 1.5);
      const flare = 1 + state.mouthOpen * (0.22 - idx * 0.04);
      tr.scale.set(flare, flare, 1);
    });
  }
  refs.mandibleFlaps.forEach((mf, idx) => {
    const roarFlare = state.mouthOpen * 0.65;
    mf.mesh.rotation[mf.axis] =
      mf.baseRot + (roarFlare + Math.sin(time * 5.6 + idx * 0.9) * 0.16) * mf.dir;
  });
  refs.tendrils.forEach((td) => {
    td.mesh.rotation.x = td.baseRotX + Math.sin(time * 5.4 + td.phaseOffset) * (0.2 + state.mouthOpen * 0.22);
  });
}

export function updateMonsterTentacles(
  refs: EnemyModelRefs,
  phys: TentaclePhysicsState,
  params: {
    dt: number;
    time: number;
    enemyType: EnemyType;
    aiState: EnemyAIState;
    moveSpeed: number;
    turnRate: number;
    distToCam: number;
    hollowExposed?: boolean;
    isScreaming?: boolean;
    colliders?: SimpleCollider[];
    fireZones?: SimpleFireHeatZone[];
    onTentacleAttackHit?: (worldTipPos: THREE.Vector3) => void;
  }
): void {
  const chains = refs.tentacleChains;
  if (!chains || chains.length === 0) return;

  const { dt, time, enemyType, aiState, moveSpeed, turnRate, distToCam } = params;
  refs.group.getWorldPosition(_ownerPos);

  // Trigger attack whip for offensive monsters
  if (phys.attackCooldown > 0) phys.attackCooldown = Math.max(0, phys.attackCooldown - dt);
  if (aiState === 'ATTACK' && phys.attackTimer <= 0 && phys.attackCooldown <= 0) {
    const hasAttackTentacle = chains.some((c) => c.role === 'attack');
    if (hasAttackTentacle) {
      phys.attackTimer = 0.85;
      phys.attackCooldown = enemyType === 'titanforged' ? 2.4 : 2.1;
      phys.attackHitFired = false;
    }
  }
  let whipFactor = 0;
  if (phys.attackTimer > 0) {
    phys.attackTimer = Math.max(0, phys.attackTimer - dt);
    const p = 1 - phys.attackTimer / 0.85;
    whipFactor = p < 0.35 ? -Math.sin((p / 0.35) * (Math.PI / 2)) * 0.5 : Math.sin(((p - 0.35) / 0.65) * Math.PI);
  }

  // Distance LOD: far monsters (> 52m) update lightweight base-joint sway only
  const isNear = distToCam <= 34;
  const isMid = distToCam <= 56;

  for (let cIdx = 0; cIdx < chains.length; cIdx++) {
    const chain: TentacleChainRig = chains[cIdx];

    // Check nearby fire heat recoil (within 5m of open fire)
    let targetHeat = 0;
    if (isNear && params.fireZones && params.fireZones.length > 0 && chain.pivots[0]) {
      chain.pivots[0].getWorldPosition(_wPos);
      for (let f = 0; f < params.fireZones.length; f++) {
        const fz = params.fireZones[f];
        const d = _wPos.distanceTo(fz.position);
        if (d < Math.max(3.8, fz.heatRadius * 0.85)) {
          targetHeat = Math.max(targetHeat, fz.intensity * (1 - d / Math.max(3.8, fz.heatRadius)));
        }
      }
    }
    phys.heatRecoil[cIdx] = THREE.MathUtils.damp(phys.heatRecoil[cIdx] ?? 0, targetHeat, 7, dt);
    const heatShrink = phys.heatRecoil[cIdx];

    // Chest tether parting when Hollow is exposed in Phase 3
    const chestPartingYaw = chain.chestTetherSide ? (params.hollowExposed ? chain.chestTetherSide * 0.88 : 0) : 0;

    // Alertness & role modulation
    const alerted = aiState === 'CHASE' || aiState === 'ATTACK';
    const roleSpeed =
      chain.role === 'colossus'
        ? 0.38
        : chain.role === 'sensory'
          ? (alerted ? 1.85 : 1.1)
          : chain.role === 'balance'
            ? 0.9 + moveSpeed * 0.16
            : chain.role === 'stabilizer'
              ? 0.65
              : 1.15;
    const tRate = (chain.speedMult * roleSpeed) * (params.isScreaming && enemyType === 'screamer' ? 2.4 : 1.0);

    // Second-order spring inertia for movement drag & sharp turns
    const targetLagX = -Math.min(0.45, moveSpeed * 0.055) - heatShrink * 0.38;
    const targetLagY = THREE.MathUtils.clamp(-turnRate * 0.18 * chain.sideSign, -0.45, 0.45);
    phys.velX[cIdx] += (-18 * (phys.posX[cIdx] - targetLagX) - 7 * phys.velX[cIdx]) * dt;
    phys.velY[cIdx] += (-18 * (phys.posY[cIdx] - targetLagY) - 7 * phys.velY[cIdx]) * dt;
    phys.posX[cIdx] += phys.velX[cIdx] * dt;
    phys.posY[cIdx] += phys.velY[cIdx] * dt;

    const segCount = isMid ? chain.pivots.length : 2;
    for (let s = 0; s < segCount; s++) {
      const piv = chain.pivots[s];
      const frac = s / Math.max(1, chain.pivots.length - 1);
      const wTime = time * tRate + chain.phaseOffset;

      // Multi-frequency un-synchronized organic curl + search twitch
      const waveA = Math.sin(wTime * 1.17 - s * 0.78);
      const waveB = Math.cos(wTime * 1.89 - s * 1.05) * 0.55;
      const twitch = Math.sin(wTime * 5.3 + s * 1.9) > 0.92 ? 0.14 : 0;

      const amp = chain.amplitude * (0.55 + frac * 0.85) * (alerted ? 1.25 : 1.0);
      const gravityDroop = (chain.role === 'colossus' ? 0.16 : 0.06) * frac;

      let pitchOff = (waveA + waveB * 0.5) * amp + gravityDroop + phys.posX[cIdx] * 0.35 + twitch;
      let yawOff = Math.sin(wTime * 0.83 + s * 0.95 + chain.sideSign) * amp * 0.9 + phys.posY[cIdx] * 0.4;

      if (chain.role === 'attack' && whipFactor !== 0) {
        pitchOff += whipFactor * (0.38 - frac * 0.15);
        yawOff += -chain.sideSign * whipFactor * 0.34;
      }
      if (s === 0 && chestPartingYaw !== 0) {
        yawOff += chestPartingYaw;
      }

      // Clamp bending angle to natural biological range
      const maxA = chain.maxAngle;
      if (s === 0) {
        piv.rotation.x = chain.baseRotEuler.x + THREE.MathUtils.clamp(pitchOff, -maxA, maxA);
        piv.rotation.y = chain.baseRotEuler.y + THREE.MathUtils.clamp(yawOff, -maxA * 1.4, maxA * 1.4);
        piv.rotation.z = chain.baseRotEuler.z;
      } else {
        piv.rotation.x = THREE.MathUtils.clamp(pitchOff, -maxA, maxA);
        piv.rotation.y = THREE.MathUtils.clamp(yawOff, -maxA, maxA);
      }

      // Near-camera Floor, Wall/Vehicle Collider & Self-Collision Prevention
      if (isNear && s >= 1) {
        piv.getWorldPosition(_wPos);
        // Prevent floor pass-through
        if (_wPos.y < 0.14) {
          piv.rotation.x = Math.max(-maxA, piv.rotation.x - (0.14 - _wPos.y) * 1.1);
        }
        // Prevent passing through self torso core
        const dxSelf = _wPos.x - _ownerPos.x;
        const dzSelf = _wPos.z - _ownerPos.z;
        const horizSelf = Math.hypot(dxSelf, dzSelf);
        if (horizSelf < refs.torsoExclusionRadius && _wPos.y > _ownerPos.y + 0.35) {
          piv.rotation.y += chain.sideSign * 0.28;
        }
        // Deflect away from nearby solid colliders (walls/cars/pillars)
        if (params.colliders) {
          for (let ci = 0; ci < params.colliders.length; ci++) {
            const box = params.colliders[ci];
            if (_wPos.y < box.minY || _wPos.y > box.maxY) continue;
            if (
              _wPos.x > box.minX - 0.15 &&
              _wPos.x < box.maxX + 0.15 &&
              _wPos.z > box.minZ - 0.15 &&
              _wPos.z < box.maxZ + 0.15
            ) {
              piv.rotation.x -= 0.35;
              piv.rotation.y += chain.sideSign * 0.32;
              break;
            }
          }
        }
      }
    }

    // Combat hit trigger at peak attack extension
    if (
      chain.role === 'attack' &&
      whipFactor > 0.86 &&
      !phys.attackHitFired &&
      params.onTentacleAttackHit &&
      chain.pivots.length > 0
    ) {
      phys.attackHitFired = true;
      chain.pivots[chain.pivots.length - 1].getWorldPosition(_wPos);
      params.onTentacleAttackHit(_wPos);
    }

    // Vein ring peristaltic pulse + secondary tip micro-flicker
    for (let v = 0; v < chain.veinRings.length; v++) {
      const pulse = 1 + Math.max(0, Math.sin(time * 5.0 + chain.phaseOffset - v * 0.9)) * 0.18;
      chain.veinRings[v].scale.set(pulse, pulse, 1);
    }
    for (let t = 0; t < chain.secondaryTips.length; t++) {
      chain.secondaryTips[t].rotation.x =
        Math.PI / 2 + 0.24 + Math.sin(time * 6.5 + chain.phaseOffset + t * 1.4) * 0.26;
    }
  }
}
