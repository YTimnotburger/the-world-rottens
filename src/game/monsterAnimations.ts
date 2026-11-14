import * as THREE from 'three';
import { MONSTER_PROFILES } from './monsterAI';
import { EnemyModelRefs } from './models';
import {
  EnemyAIState,
  EnemyType,
  MonsterAnimStateName,
  MonsterAttackKind,
  MonsterWeightClass,
} from './types';

export interface MonsterAnimationState {
  animState: MonsterAnimStateName;
  stridePhase: number;
  lastStepIndex: number;
  smoothedSpeed: number;
  runBlend: number;
  attackKind: MonsterAttackKind;
  attackElapsed: number;
  attackDuration: number;
  attackWindupFired: boolean;
  attackHitFired: boolean;
  staggerTimer: number;
  staggerDuration: number;
  staggerZone: string;
  staggerSign: number;
  idleVariant: number;
  idleTimer: number;
  deathTimer: number;
  deathStarted: boolean;
  deathDir: number;
  sparkTimer: number;
  bodyBob: number;
  torsoPitch: number;
  torsoRoll: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  jawOpen: number;
  coreIntensity: number;
  lodTick: number;
}

export function createMonsterAnimState(): MonsterAnimationState {
  return {
    animState: 'IDLE',
    stridePhase: Math.random() * Math.PI * 2,
    lastStepIndex: 0,
    smoothedSpeed: 0,
    runBlend: 0,
    attackKind: 'claw',
    attackElapsed: 0,
    attackDuration: 0.9,
    attackWindupFired: false,
    attackHitFired: false,
    staggerTimer: 0,
    staggerDuration: 0.35,
    staggerZone: 'body',
    staggerSign: 1,
    idleVariant: Math.floor(Math.random() * 4),
    idleTimer: 2 + Math.random() * 3,
    deathTimer: 0,
    deathStarted: false,
    deathDir: Math.random() > 0.5 ? 1 : -1,
    sparkTimer: 0.5,
    bodyBob: 0,
    torsoPitch: 0,
    torsoRoll: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    jawOpen: 0,
    coreIntensity: 2.0,
    lodTick: 0,
  };
}

export function triggerMonsterAttack(
  anim: MonsterAnimationState,
  kind: MonsterAttackKind,
  weightClass: MonsterWeightClass
): void {
  anim.animState = 'ATTACK';
  anim.attackKind = kind;
  anim.attackElapsed = 0;
  anim.attackWindupFired = false;
  anim.attackHitFired = false;

  const weightScale =
    weightClass === 'boss'
      ? 1.38
      : weightClass === 'large'
        ? 1.18
        : weightClass === 'small'
          ? 0.78
          : 1.0;

  const baseDur =
    kind === 'heavy_slam'
      ? 1.15
      : kind === 'charge'
        ? 1.05
        : kind === 'grab'
          ? 1.08
          : kind === 'tendril'
            ? 0.92
            : kind === 'bite'
              ? 0.76
              : 0.82;

  anim.attackDuration = baseDur * weightScale;
}

export function triggerMonsterStagger(
  anim: MonsterAnimationState,
  hitZone: string,
  lateralSign: number,
  isHeavyHit: boolean
): void {
  anim.staggerZone = hitZone;
  anim.staggerSign = lateralSign >= 0 ? 1 : -1;
  anim.staggerDuration = isHeavyHit ? 0.48 : 0.28;
  anim.staggerTimer = anim.staggerDuration;
}

export interface MonsterAnimUpdateParams {
  dt: number;
  time: number;
  type: EnemyType;
  aiState: EnemyAIState;
  position: THREE.Vector3;
  yaw: number;
  actualHorizMoved: number;
  turnRate: number;
  targetPos: THREE.Vector3;
  healthRatio: number;
  legDamaged: boolean;
  isScreaming: boolean;
  distToCam: number;
  bossPhase: number;
  onFootstep?: (weight: MonsterWeightClass, speedRatio: number) => void;
  onAttackWindup?: (kind: MonsterAttackKind) => void;
  onAttackHit?: (kind: MonsterAttackKind, damageMult: number, reachBonus: number) => void;
  onMechSpark?: (pos: THREE.Vector3) => void;
}

export function updateMonsterAnimations(
  refs: EnemyModelRefs,
  anim: MonsterAnimationState,
  params: MonsterAnimUpdateParams
): void {
  const {
    dt,
    time,
    type,
    aiState,
    position,
    yaw,
    actualHorizMoved,
    turnRate,
    targetPos,
    healthRatio,
    legDamaged,
    isScreaming,
    distToCam,
    bossPhase,
  } = params;

  const profile = MONSTER_PROFILES[type];
  const weight = profile.weightClass;

  // LOD cull for ultra-distant ambient monsters (bosses always update)
  if (!profile.isBoss && distToCam > 88) {
    anim.lodTick += 1;
    if (anim.lodTick % 4 !== 0) return;
  }

  // -------------------------------------------------------------------------
  // 1. DEATH ANIMATION SYSTEM (Weight & Species Unique)
  // -------------------------------------------------------------------------
  if (aiState === 'DEAD') {
    anim.animState = 'DEAD';
    anim.deathTimer += dt;
    const t = Math.min(1, anim.deathTimer / (weight === 'boss' ? 1.7 : weight === 'large' ? 1.25 : 0.8));

    // Dim eyes & parasite cores on death (especially critical for Infected Mechs)
    if (refs.coreMaterials) {
      const targetGlow = profile.isMech ? 0.04 : 0.15;
      for (let i = 0; i < refs.coreMaterials.length; i++) {
        refs.coreMaterials[i].emissiveIntensity = THREE.MathUtils.damp(
          refs.coreMaterials[i].emissiveIntensity,
          targetGlow,
          profile.isMech ? 5.5 : 3.5,
          dt
        );
      }
    }

    // Mech death spark burst during power failure
    if (profile.isMech && t < 0.72) {
      anim.sparkTimer -= dt;
      if (anim.sparkTimer <= 0) {
        anim.sparkTimer = 0.18 + Math.random() * 0.15;
        params.onMechSpark?.(position);
      }
    }

    if (weight === 'small') {
      // Rapid twitching curl & collapse
      refs.group.rotation.x = THREE.MathUtils.damp(refs.group.rotation.x, Math.PI * 0.48, 10, dt);
      refs.group.rotation.z = THREE.MathUtils.damp(refs.group.rotation.z, anim.deathDir * 0.5, 9, dt);
      refs.group.position.y = THREE.MathUtils.damp(refs.group.position.y, 0.18, 10, dt);
      refs.legRigs.forEach((leg, i) => {
        const curl = Math.sin(anim.deathTimer * 24 + i) * (1 - t) * 0.4;
        leg.hip.rotation.x = THREE.MathUtils.damp(leg.hip.rotation.x, 0.8 + curl, 12, dt);
        leg.knee.rotation.x = THREE.MathUtils.damp(leg.knee.rotation.x, -0.9, 12, dt);
      });
    } else if (weight === 'large' || weight === 'boss') {
      // Heavy knee-first drop before slamming forward/sideways
      const phase1 = Math.min(1, t / 0.45);
      const phase2 = Math.max(0, (t - 0.42) / 0.58);
      const dropY = THREE.MathUtils.lerp(0, -0.45, phase1);
      refs.group.position.y = THREE.MathUtils.damp(
        refs.group.position.y,
        phase2 > 0.1 ? 0.35 : position.y + dropY,
        6,
        dt
      );
      refs.group.rotation.x = THREE.MathUtils.damp(
        refs.group.rotation.x,
        phase2 * (Math.PI * 0.48),
        5.5,
        dt
      );
      refs.group.rotation.z = THREE.MathUtils.damp(
        refs.group.rotation.z,
        anim.deathDir * phase2 * 0.24,
        5,
        dt
      );
      refs.legRigs.forEach((leg) => {
        leg.hip.rotation.x = THREE.MathUtils.damp(leg.hip.rotation.x, -0.75 * phase1, 7, dt);
        leg.knee.rotation.x = THREE.MathUtils.damp(leg.knee.rotation.x, 1.15 * phase1, 7, dt);
      });
    } else {
      // Medium / Mech stumble backward/forward and power shutdown
      const jitter = profile.isMech && t < 0.45 ? Math.sin(anim.deathTimer * 36) * 0.08 : 0;
      refs.group.rotation.x = THREE.MathUtils.damp(
        refs.group.rotation.x,
        Math.PI * 0.47 + jitter,
        profile.isMech ? 5 : 7.5,
        dt
      );
      refs.group.rotation.z = THREE.MathUtils.damp(refs.group.rotation.z, anim.deathDir * 0.25, 6, dt);
      refs.group.position.y = THREE.MathUtils.damp(refs.group.position.y, 0.22, 7, dt);
      refs.armRigs.forEach((arm) => {
        arm.shoulder.rotation.x = THREE.MathUtils.damp(arm.shoulder.rotation.x, 0.55, 6, dt);
      });
    }

    refs.mandibleFlaps.forEach((mf) => {
      mf.mesh.rotation[mf.axis] = THREE.MathUtils.damp(mf.mesh.rotation[mf.axis], mf.baseRot, 6, dt);
    });
    return;
  }

  // -------------------------------------------------------------------------
  // 2. DETERMINE ACTIVE ANIMATION STATE
  // -------------------------------------------------------------------------
  const instSpeed = dt > 0.0005 ? actualHorizMoved / dt : 0;
  anim.smoothedSpeed = THREE.MathUtils.damp(anim.smoothedSpeed, instSpeed, 11, dt);
  const isMoving = anim.smoothedSpeed > 0.25;
  const runNorm = THREE.MathUtils.clamp(
    (anim.smoothedSpeed - profile.walkSpeed) / Math.max(0.5, profile.runSpeed - profile.walkSpeed),
    0,
    1
  );
  anim.runBlend = THREE.MathUtils.damp(anim.runBlend, runNorm, 8, dt);

  if (anim.staggerTimer > 0) {
    anim.staggerTimer = Math.max(0, anim.staggerTimer - dt);
  }

  let attackProgress = 0;
  let attackActive = false;
  if (anim.animState === 'ATTACK') {
    anim.attackElapsed += dt;
    attackProgress = anim.attackElapsed / Math.max(0.1, anim.attackDuration);
    if (!anim.attackWindupFired && attackProgress >= 0.04) {
      anim.attackWindupFired = true;
      params.onAttackWindup?.(anim.attackKind);
    }
    if (!anim.attackHitFired && attackProgress >= 0.46) {
      anim.attackHitFired = true;
      const dmgMult =
        anim.attackKind === 'heavy_slam'
          ? 1.38
          : anim.attackKind === 'charge'
            ? 1.25
            : anim.attackKind === 'grab'
              ? 1.15
              : anim.attackKind === 'tendril'
                ? 0.92
                : 1.0;
      const reachBonus =
        anim.attackKind === 'tendril'
          ? 1.55
          : anim.attackKind === 'charge'
            ? 1.25
            : anim.attackKind === 'heavy_slam'
              ? 1.1
              : 0.75;
      params.onAttackHit?.(anim.attackKind, dmgMult, reachBonus);
    }
    if (attackProgress >= 1) {
      anim.animState = 'RECOVERY';
    } else {
      attackActive = true;
    }
  }

  if (!attackActive) {
    if (aiState === 'BOSS_INTRO') anim.animState = 'BOSS_INTRO';
    else if (anim.staggerTimer > 0 || aiState === 'STUNNED') anim.animState = 'STAGGER';
    else if (aiState === 'HIDING') anim.animState = 'HIDING';
    else if (aiState === 'RETREAT') anim.animState = 'RETREAT';
    else if (isMoving) anim.animState = anim.runBlend > 0.42 ? 'RUN' : 'WALK';
    else if (Math.abs(turnRate) > 0.85) anim.animState = 'TURN';
    else anim.animState = 'IDLE';
  }

  // Cycle idle behaviors naturally
  if (anim.animState === 'IDLE') {
    anim.idleTimer -= dt;
    if (anim.idleTimer <= 0) {
      anim.idleTimer = 2.6 + Math.random() * 3.4;
      anim.idleVariant = (anim.idleVariant + 1 + Math.floor(Math.random() * 2)) % 4;
    }
  }

  // -------------------------------------------------------------------------
  // 3. ZERO-SLIDE STRIDE PHASE & SYNCHRONIZED FOOTSTEP EMISSION
  // -------------------------------------------------------------------------
  const strideLen = profile.strideLength * (legDamaged ? 0.72 : 1.0);
  if (actualHorizMoved > 0.002) {
    anim.stridePhase += (actualHorizMoved / Math.max(0.4, strideLen)) * Math.PI * 2;
    const stepIdx = Math.floor(anim.stridePhase / Math.PI);
    if (stepIdx !== anim.lastStepIndex) {
      anim.lastStepIndex = stepIdx;
      params.onFootstep?.(weight, THREE.MathUtils.clamp(anim.smoothedSpeed / profile.runSpeed, 0.25, 1.3));
    }
  } else if (anim.animState === 'TURN') {
    // Stepping in place during rapid turns so feet don't slide!
    anim.stridePhase += Math.abs(turnRate) * dt * 2.2;
  }

  // -------------------------------------------------------------------------
  // 4. LOCOMOTION, WEIGHT SHIFTING, & POSTURE SYNTHESIS
  // -------------------------------------------------------------------------
  const moveFactor = THREE.MathUtils.clamp(anim.smoothedSpeed / Math.max(1, profile.walkSpeed), 0, 1.35);
  let targetTorsoPitch = 0;
  let targetTorsoRoll = 0;
  let targetBodyBob = 0;
  let targetJawOpen = 0.08 + Math.sin(time * 2.2) * 0.05;

  if (anim.animState === 'BOSS_INTRO') {
    // Threatening rear-up roar reveal
    targetTorsoPitch = -0.26;
    targetBodyBob = 0.14;
    targetJawOpen = 0.88;
  } else if (anim.animState === 'HIDING') {
    // Low crouched ambush silhouette behind cover
    targetTorsoPitch = 0.42;
    targetBodyBob = -0.24;
    targetJawOpen = 0.22;
  } else if (anim.animState === 'RETREAT') {
    // Hurt backward/side crouch
    targetTorsoPitch = 0.18;
    targetTorsoRoll = Math.sin(anim.stridePhase) * 0.08;
    targetJawOpen = 0.45;
  } else if (anim.animState === 'WALK' || anim.animState === 'RUN') {
    const leanBase =
      weight === 'small'
        ? 0.22
        : weight === 'medium'
          ? 0.16 + anim.runBlend * 0.26
          : weight === 'large' || weight === 'boss'
            ? 0.12 + anim.runBlend * 0.14
            : 0.08 + anim.runBlend * 0.12;
    targetTorsoPitch = leanBase;
    const rollMag = weight === 'large' || weight === 'boss' ? 0.095 : weight === 'medium' ? 0.065 : 0.04;
    targetTorsoRoll = Math.sin(anim.stridePhase) * rollMag * Math.min(1, moveFactor);
    const bobMag = weight === 'boss' ? 0.12 : weight === 'large' ? 0.075 : 0.045;
    targetBodyBob = Math.abs(Math.sin(anim.stridePhase)) * bobMag * Math.min(1, moveFactor) * (1 + anim.runBlend * 0.4);
    if (legDamaged) {
      targetTorsoRoll += 0.16;
      targetBodyBob -= 0.08;
    }
    targetJawOpen = 0.15 + anim.runBlend * 0.35;
  } else {
    // Idle multi-behavior breathing + twitches
    const breathAmp = weight === 'large' || weight === 'boss' ? 0.035 : 0.025;
    targetBodyBob = Math.sin(time * 2.1) * breathAmp;
    if (anim.idleVariant === 3) {
      // Crouched stalk watch
      targetTorsoPitch = 0.14;
      targetBodyBob -= 0.08;
    } else if (weight === 'small' && anim.idleVariant === 2) {
      // Nervous small monster twitch
      targetTorsoRoll = Math.sin(time * 18) * 0.05;
    }
  }

  // -------------------------------------------------------------------------
  // 5. 6 DISTINCT ATTACK ANIMATION CHOREOGRAPHIES
  // -------------------------------------------------------------------------
  let armAttackL = 0;
  let armAttackR = 0;
  let elbowAttackL = 0;
  let elbowAttackR = 0;
  let armSpread = 0;
  let headStrikePitch = 0;

  if (attackActive) {
    const p = attackProgress;
    const windup = p < 0.38 ? Math.sin((p / 0.38) * (Math.PI / 2)) : 0;
    const strike = p >= 0.38 && p < 0.65 ? Math.sin(((p - 0.38) / 0.27) * Math.PI) : 0;
    const recov = p >= 0.65 ? 1 - (p - 0.65) / 0.35 : 0;

    if (anim.attackKind === 'claw') {
      armAttackR = -1.35 * windup + 1.45 * strike + 0.35 * recov;
      elbowAttackR = -0.85 * windup + 0.65 * strike;
      targetTorsoRoll += -0.22 * windup + 0.34 * strike;
      targetTorsoPitch += -0.1 * windup + 0.35 * strike;
      targetJawOpen = 0.5 + 0.35 * strike;
    } else if (anim.attackKind === 'bite') {
      targetTorsoPitch += -0.25 * windup + 0.52 * strike;
      headStrikePitch = -0.45 * windup + 0.7 * strike;
      targetJawOpen = 0.85 * windup + 0.95 * (1 - strike * 0.8);
      armSpread = 0.35 * windup;
    } else if (anim.attackKind === 'charge') {
      targetTorsoPitch += 0.48 * (windup * 0.4 + strike + recov * 0.3);
      targetBodyBob = -0.14 * windup + 0.08 * strike;
      armAttackL = -0.6 * windup + 0.9 * strike;
      armAttackR = -0.6 * windup + 0.9 * strike;
      targetJawOpen = 0.72;
    } else if (anim.attackKind === 'heavy_slam') {
      armAttackL = -1.75 * windup + 1.55 * strike + 0.4 * recov;
      armAttackR = -1.75 * windup + 1.55 * strike + 0.4 * recov;
      elbowAttackL = -0.5 * windup + 0.45 * strike;
      elbowAttackR = -0.5 * windup + 0.45 * strike;
      targetTorsoPitch += -0.28 * windup + 0.58 * strike;
      targetBodyBob += 0.22 * windup - 0.28 * strike;
      targetJawOpen = 0.85;
    } else if (anim.attackKind === 'grab') {
      armSpread = 0.75 * windup - 0.55 * strike;
      armAttackL = -0.95 * windup + 0.85 * strike;
      armAttackR = -0.95 * windup + 0.85 * strike;
      targetTorsoPitch += 0.26 * strike;
      targetJawOpen = 0.65;
    } else {
      // tendril whip
      targetTorsoPitch += -0.18 * windup + 0.28 * strike;
      targetTorsoRoll += 0.25 * Math.sin(p * Math.PI * 2);
      armSpread = 0.45 * windup;
      targetJawOpen = 0.6;
    }
  }

  // -------------------------------------------------------------------------
  // 6. HIT-ZONE DAMAGE FLINCH / STAGGER OVERLAY
  // -------------------------------------------------------------------------
  if (anim.staggerTimer > 0) {
    const sEnv = anim.staggerTimer / Math.max(0.1, anim.staggerDuration);
    if (anim.staggerZone === 'head' || anim.staggerZone === 'neck') {
      headStrikePitch -= 0.55 * sEnv;
      targetTorsoPitch -= 0.24 * sEnv;
    } else if (anim.staggerZone === 'leg') {
      targetBodyBob -= 0.22 * sEnv;
      targetTorsoRoll += anim.staggerSign * 0.35 * sEnv;
    } else {
      targetTorsoRoll += anim.staggerSign * 0.28 * sEnv;
      targetTorsoPitch -= 0.16 * sEnv;
    }
  }

  // Apply smoothed posture transforms
  const dampRate = profile.isMech ? 15 : 10;
  anim.torsoPitch = THREE.MathUtils.damp(anim.torsoPitch, targetTorsoPitch, dampRate, dt);
  anim.torsoRoll = THREE.MathUtils.damp(anim.torsoRoll, targetTorsoRoll, dampRate, dt);
  anim.bodyBob = THREE.MathUtils.damp(anim.bodyBob, targetBodyBob, dampRate, dt);
  anim.jawOpen = THREE.MathUtils.damp(anim.jawOpen, isScreaming ? 0.95 : targetJawOpen, 14, dt);

  // Subtle vertical weight bob without drifting away from world Y
  if (type !== 'void_walker') {
    refs.group.position.y = position.y + anim.bodyBob;
  }
  if (refs.torsoPulse) {
    refs.torsoPulse.rotation.x = anim.torsoPitch;
    refs.torsoPulse.rotation.z = anim.torsoRoll;
    const breathScale =
      1 +
      Math.sin(time * (isScreaming ? 12 : aiState === 'CHASE' || aiState === 'ATTACK' ? 5.2 : 2.2)) *
        (isScreaming ? 0.14 : 0.032);
    refs.torsoPulse.scale.set(breathScale, 1, breathScale);
  }

  // -------------------------------------------------------------------------
  // 7. LEGS & ARMS (HYDRAULIC MECH VS ORGANIC MUSCLE)
  // -------------------------------------------------------------------------
  const maxAmp = (legDamaged ? 0.28 : 0.42 + anim.runBlend * 0.22) * THREE.MathUtils.clamp(moveFactor, 0, 1);
  const legDamp = profile.isMech ? 16 : 12;

  for (let i = 0; i < refs.legRigs.length; i++) {
    const leg = refs.legRigs[i];
    const phase = anim.stridePhase + leg.phaseOffset;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    // Hydraulic quantization adds subtle mechanical stiffness for infected mechs
    const gaitWave = profile.isMech ? Math.tanh(s * 1.65) : s;
    const limpFactor = legDamaged && i % 2 === 1 ? 0.55 : 1.0;

    const targetHip =
      anim.animState === 'HIDING'
        ? leg.baseHipX - 0.35
        : leg.baseHipX + gaitWave * maxAmp * limpFactor;
    const kneeLift = Math.max(0, -c) * maxAmp * 1.45 * limpFactor;
    const targetKnee =
      anim.animState === 'HIDING'
        ? leg.baseKneeX + 0.65
        : leg.baseKneeX + kneeLift;

    const axis = leg.hipAxis ?? 'x';
    leg.hip.rotation[axis] = THREE.MathUtils.damp(leg.hip.rotation[axis], targetHip, legDamp, dt);
    leg.knee.rotation.x = THREE.MathUtils.damp(leg.knee.rotation.x, targetKnee, legDamp, dt);
  }

  const malfunc = profile.isMech && healthRatio < 0.55 ? Math.sin(time * 28) * 0.14 : 0;
  for (let i = 0; i < refs.armRigs.length; i++) {
    const arm = refs.armRigs[i];
    const side = i % 2 === 0 ? -1 : 1;
    const swing = Math.sin(anim.stridePhase + arm.phaseOffset) * maxAmp * (0.65 + anim.runBlend * 0.35);
    const atkS = i % 2 === 0 ? armAttackL : armAttackR;
    const atkE = i % 2 === 0 ? elbowAttackL : elbowAttackR;
    const bossIntroLift = anim.animState === 'BOSS_INTRO' ? -0.9 : 0;
    const jitter = i === 1 ? malfunc : 0;

    const targetShoulderX = arm.baseShoulderX + swing + atkS + bossIntroLift + jitter;
    const targetElbowX = arm.baseElbowX + Math.cos(anim.stridePhase + arm.phaseOffset) * maxAmp * 0.35 + atkE;

    arm.shoulder.rotation.x = THREE.MathUtils.damp(arm.shoulder.rotation.x, targetShoulderX, 13, dt);
    arm.shoulder.rotation.z = THREE.MathUtils.damp(arm.shoulder.rotation.z, side * armSpread, 12, dt);
    arm.elbow.rotation.x = THREE.MathUtils.damp(arm.elbow.rotation.x, targetElbowX, 13, dt);
  }

  // -------------------------------------------------------------------------
  // 8. INFECTED MECH ROTATING ARMOR & CORE INTENSITY
  // -------------------------------------------------------------------------
  if (distToCam < 55) {
    if (refs.rotatableArmor && refs.rotatableArmor.length > 0) {
      for (let i = 0; i < refs.rotatableArmor.length; i++) {
        const part = refs.rotatableArmor[i];
        if (type === 'drowned_machine') {
          part.rotation.z += dt * (aiState === 'ATTACK' ? 3.2 : 1.1);
        } else if (type === 'helios_unit') {
          part.rotation.z =
            (i === 0 ? 0.28 : -0.28) + Math.sin(time * 3.5 + i * Math.PI) * (aiState === 'ATTACK' ? 0.16 : 0.05);
        } else if (type === 'sentinel' && i === 0) {
          part.rotation.x = THREE.MathUtils.damp(
            part.rotation.x,
            aiState === 'ATTACK' ? -0.15 : Math.sin(time * 1.4) * 0.12,
            8,
            dt
          );
        }
      }
    }

    if (profile.isMech && healthRatio < 0.55) {
      anim.sparkTimer -= dt;
      if (anim.sparkTimer <= 0) {
        anim.sparkTimer = 0.8 + Math.random() * 1.4;
        params.onMechSpark?.(position);
      }
    }

    if (refs.coreMaterials && refs.coreMaterials.length > 0) {
      const targetCore =
        anim.animState === 'BOSS_INTRO' || aiState === 'ATTACK'
          ? 3.1
          : aiState === 'CHASE'
            ? 2.6 + bossPhase * 0.25
            : aiState === 'SEARCH'
              ? 2.1
              : 1.45;
      const flicker =
        profile.isMech && healthRatio < 0.5 && Math.sin(time * 31) > 0.72 ? 0.35 : 1.0;
      anim.coreIntensity = THREE.MathUtils.damp(anim.coreIntensity, targetCore * flicker, 10, dt);
      for (let i = 0; i < refs.coreMaterials.length; i++) {
        refs.coreMaterials[i].emissiveIntensity = anim.coreIntensity;
      }
    }

    // -----------------------------------------------------------------------
    // 9. MONSTER FACES, EYE TRACKING, HEAD TILT & JAW ANIMATION
    // -----------------------------------------------------------------------
    if (refs.headGroup) {
      let desiredLocalYaw = 0;
      let desiredPitch = headStrikePitch;
      let desiredRoll = 0;

      if (aiState === 'CHASE' || aiState === 'ATTACK' || aiState === 'SEARCH') {
        const dx = targetPos.x - position.x;
        const dz = targetPos.z - position.z;
        let relYaw = Math.atan2(dx, dz) - yaw;
        while (relYaw > Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        desiredLocalYaw = THREE.MathUtils.clamp(relYaw, -0.68, 0.68);
        if (aiState === 'SEARCH') {
          desiredLocalYaw += Math.sin(time * 1.9) * 0.35;
          desiredRoll = Math.sin(time * 1.4) * 0.18;
        }
      } else if (anim.animState === 'IDLE') {
        if (anim.idleVariant === 1) {
          // Curious scanning
          desiredLocalYaw = Math.sin(time * 1.2) * 0.42;
          desiredRoll = Math.sin(time * 1.2) * 0.12;
        } else if (anim.idleVariant === 2) {
          // Sudden head twitch
          const pulse = Math.sin(time * 7.5);
          desiredLocalYaw = pulse > 0.78 ? 0.38 * anim.deathDir : 0;
          desiredRoll = pulse > 0.78 ? -0.22 * anim.deathDir : 0;
        }
      } else if (anim.animState === 'BOSS_INTRO') {
        desiredPitch = -0.35;
      }

      const headDamp = weight === 'small' ? 16 : 9;
      anim.headYaw = THREE.MathUtils.damp(anim.headYaw, desiredLocalYaw, headDamp, dt);
      anim.headPitch = THREE.MathUtils.damp(anim.headPitch, desiredPitch, headDamp, dt);
      anim.headRoll = THREE.MathUtils.damp(anim.headRoll, desiredRoll, headDamp, dt);

      refs.headGroup.rotation.y = anim.headYaw;
      refs.headGroup.rotation.x = anim.headPitch;
      refs.headGroup.rotation.z = anim.headRoll;
    }

    if (refs.jawGroup) {
      refs.jawGroup.rotation.x = 0.28 + anim.jawOpen * 0.55;
    }

    if (refs.mandibleFlaps.length > 0) {
      const flare = 0.14 + anim.jawOpen * 0.52 + Math.sin(time * 5.2) * 0.08;
      for (let i = 0; i < refs.mandibleFlaps.length; i++) {
        const mf = refs.mandibleFlaps[i];
        mf.mesh.rotation[mf.axis] = mf.baseRot + flare * mf.dir;
      }
    }

    if (refs.eyeMeshes && refs.eyeMeshes.length > 0) {
      const eyeScale = aiState === 'ATTACK' || aiState === 'CHASE' ? 1.15 : 0.95;
      for (let i = 0; i < refs.eyeMeshes.length; i++) {
        refs.eyeMeshes[i].scale.setScalar(eyeScale);
      }
    }

    if (refs.screamerSac) {
      const sPulse = 1 + Math.sin(time * (isScreaming ? 16 : 6)) * (isScreaming ? 0.28 : 0.06);
      refs.screamerSac.scale.set(1.05 * sPulse, 1.35 * sPulse, 0.9 * sPulse);
    }

    refs.tendrils.forEach((td) => {
      td.mesh.rotation.x = td.baseRotX + Math.sin(time * 5.2 + td.phaseOffset) * 0.24;
    });
  }
}
