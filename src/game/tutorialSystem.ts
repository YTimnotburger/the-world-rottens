import { CHARACTERS } from './data';
import { CharacterId, TutorialHudState, TutorialInputCheck } from './types';

export const TUTORIAL_COMPLETED_KEY = 'twhr_tutorial_done_v1';

export type TutorialInputId =
  | 'look_yaw'
  | 'look_pitch'
  | 'move_w'
  | 'move_a'
  | 'move_s'
  | 'move_d'
  | 'sprint'
  | 'crouch'
  | 'jump'
  | 'flashlight'
  | 'aim'
  | 'fire'
  | 'reload'
  | 'melee'
  | 'swap'
  | 'ability'
  | 'heal'
  | 'logs'
  | 'interact';

interface TutorialStepBlueprint {
  title: string;
  instruction: string;
  touchInstruction: string;
  tip: string;
  inputs: Omit<TutorialInputCheck, 'done'>[];
  objectiveTarget?: { x: number; z: number };
}

function buildStepBlueprints(characterId: CharacterId): TutorialStepBlueprint[] {
  const charDef = CHARACTERS[characterId];
  return [
    {
      title: 'CAMERA & MOUSE LOOK',
      instruction:
        'Click the viewport to engage mouse look, then pan left/right and look up/down (or use Arrow Keys).',
      touchInstruction:
        'Drag across the right half of the screen to aim horizontally and vertically.',
      tip: 'Press ESC anytime to release the cursor or open the pause menu.',
      inputs: [
        { id: 'look_yaw', key: 'MOUSE ◀▶', touchKey: 'LOOK PAD ◀▶', label: 'Turn View' },
        { id: 'look_pitch', key: 'MOUSE ▲▼', touchKey: 'LOOK PAD ▲▼', label: 'Pitch View' },
      ],
      objectiveTarget: { x: 0, z: 10 },
    },
    {
      title: 'TACTICAL MOVEMENT',
      instruction: 'Move in all four directions using W, A, S, and D.',
      touchInstruction: 'Use the bottom-left virtual thumbstick to move in all directions.',
      tip: 'Footsteps generate acoustic ripples that nearby monsters can hear.',
      inputs: [
        { id: 'move_w', key: 'W', touchKey: 'STICK ▲', label: 'Forward' },
        { id: 'move_a', key: 'A', touchKey: 'STICK ◀', label: 'Strafe Left' },
        { id: 'move_s', key: 'S', touchKey: 'STICK ▼', label: 'Backward' },
        { id: 'move_d', key: 'D', touchKey: 'STICK ▶', label: 'Strafe Right' },
      ],
      objectiveTarget: { x: 0, z: 6 },
    },
    {
      title: 'SPRINT, CROUCH & JUMP',
      instruction:
        'Hold SHIFT while moving to sprint, hold C or CTRL to crouch silently, and press SPACE to jump over the hurdle.',
      touchInstruction:
        'Sprint at full stick tilt, crouch for stealth, and tap JUMP to clear low obstacles.',
      tip: 'Crouching silences footsteps and reduces enemy visual detection range.',
      inputs: [
        { id: 'sprint', key: 'SHIFT', touchKey: 'FULL TILT', label: 'Sprint' },
        { id: 'crouch', key: 'C / CTRL', touchKey: 'CROUCH', label: 'Stealth Crouch' },
        { id: 'jump', key: 'SPACE', touchKey: 'JUMP', label: 'Jump' },
      ],
      objectiveTarget: { x: 0, z: 2 },
    },
    {
      title: 'TACTICAL FLASHLIGHT',
      instruction: 'Press F to toggle your helmet flashlight off and on.',
      touchInstruction: 'Tap LIGHT to toggle your helmet flashlight.',
      tip: 'Dark corridors hide threats, but an active beam extends enemy sightlines.',
      inputs: [{ id: 'flashlight', key: 'F', touchKey: 'LIGHT', label: 'Toggle Light' }],
      objectiveTarget: { x: 4, z: -6 },
    },
    {
      title: 'AIM, FIRE & RELOAD',
      instruction:
        'Hold RMB to aim down sights, press LMB to fire at the firing-lane targets, then press R to reload.',
      touchInstruction:
        'Tap AIM, press FIRE at the downrange targets, then tap RELOAD.',
      tip: 'Aiming tightens bullet spread. Headshots deal critical bonus damage.',
      inputs: [
        { id: 'aim', key: 'RMB', touchKey: 'AIM', label: 'Aim Sights' },
        { id: 'fire', key: 'LMB', touchKey: 'FIRE', label: 'Fire Weapon' },
        { id: 'reload', key: 'R', touchKey: 'RELOAD', label: 'Reload' },
      ],
      objectiveTarget: { x: 4, z: -12 },
    },
    {
      title: 'MELEE & BREACHING',
      instruction:
        'Press V (or Middle Mouse) to strike with a melee bash. Break the supply barricade in the West alcove!',
      touchInstruction: 'Approach the West alcove barricade and breach it with close-quarters fire.',
      tip: 'Melee staggers nearby monsters and shatters wooden crates, glass, and weak barriers.',
      inputs: [{ id: 'melee', key: 'V / MMB', touchKey: 'MELEE', label: 'Melee Strike' }],
      objectiveTarget: { x: -11, z: -2 },
    },
    {
      title: 'WEAPON SWAP & ABILITY',
      instruction: `Press 1 or 2 (or Scroll) to swap weapons, then press Q to activate ${charDef.ability.name}.`,
      touchInstruction: `Tap SWITCH to swap weapons, then tap SKILL to trigger ${charDef.ability.name}.`,
      tip: `${charDef.callsign}: ${charDef.ability.description}`,
      inputs: [
        { id: 'swap', key: '1 / 2', touchKey: 'SWITCH', label: 'Swap Weapon' },
        { id: 'ability', key: 'Q', touchKey: 'SKILL', label: charDef.ability.name },
      ],
      objectiveTarget: { x: 0, z: -22 },
    },
    {
      title: 'FIELD HEALING & ARCHIVE',
      instruction:
        'Press H to apply a Tactical Medkit (+35 HP) and press TAB to inspect your Inventory & Lore Logs.',
      touchInstruction:
        'Tap HEAL to use a Tactical Medkit and open [TAB] LOGS at the top-right.',
      tip: 'Recover Lore Logs and Salvage Cores to upgrade weapons at Workbenches.',
      inputs: [
        { id: 'heal', key: 'H', touchKey: 'HEAL', label: 'Use Medkit' },
        { id: 'logs', key: 'TAB', touchKey: 'LOGS', label: 'Open Logs' },
      ],
      objectiveTarget: { x: 0, z: -30 },
    },
    {
      title: 'INTERACT & EXTRACTION',
      instruction:
        'Press E near highlighted terminals, pickups, or doors to interact. Unlock the airlock and extract!',
      touchInstruction:
        'Approach any highlighted terminal or pickup and tap USE to interact and extract.',
      tip: 'You can toggle this input guide anytime in campaign chapters with [F1].',
      inputs: [{ id: 'interact', key: 'E', touchKey: 'USE', label: 'Interact / Use' }],
      objectiveTarget: { x: 0, z: -48 },
    },
  ];
}

export function isTutorialPreviouslyCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialCompleted(): void {
  try {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

export class InGameTutorialTracker {
  private readonly isTrainingBay: boolean;
  private active: boolean;
  private steps: TutorialStepBlueprint[];
  private stepIndex = 0;
  private completedFlags = new Set<TutorialInputId>();
  private completed = false;
  private lookYawAccum = 0;
  private lookPitchAccum = 0;

  constructor(characterId: CharacterId, isTrainingBay: boolean, startActive: boolean) {
    this.isTrainingBay = isTrainingBay;
    this.active = startActive;
    this.steps = buildStepBlueprints(characterId);
  }

  public isActive(): boolean {
    return this.active;
  }

  public setActive(val: boolean): void {
    this.active = val;
  }

  public toggle(): boolean {
    this.active = !this.active;
    return this.active;
  }

  public isCompleted(): boolean {
    return this.completed;
  }

  public getStepIndex(): number {
    return this.stepIndex;
  }

  public getCurrentObjectiveTarget(): { x: number; z: number } | null {
    if (!this.active || this.completed) return null;
    return this.steps[this.stepIndex]?.objectiveTarget ?? null;
  }

  public recordLookDelta(dYaw: number, dPitch: number): boolean {
    if (!this.active || this.completed || this.stepIndex !== 0) return false;
    this.lookYawAccum += Math.abs(dYaw);
    this.lookPitchAccum += Math.abs(dPitch);
    let advanced = false;
    if (this.lookYawAccum >= 0.65) {
      advanced = this.recordInput('look_yaw') || advanced;
    }
    if (this.lookPitchAccum >= 0.22) {
      advanced = this.recordInput('look_pitch') || advanced;
    }
    return advanced;
  }

  /**
   * Records a performed player input. Returns true if the current step just completed and advanced!
   */
  public recordInput(id: TutorialInputId): boolean {
    if (!this.active || this.completed) return false;
    const step = this.steps[this.stepIndex];
    if (!step) return false;

    const matchesStep = step.inputs.some((inp) => inp.id === id);
    if (!matchesStep || this.completedFlags.has(id)) return false;

    this.completedFlags.add(id);
    const allDone = step.inputs.every((inp) => this.completedFlags.has(inp.id as TutorialInputId));
    if (allDone) {
      return this.advanceStep();
    }
    return false;
  }

  public skipStep(): boolean {
    if (!this.active || this.completed) return false;
    return this.advanceStep();
  }

  private advanceStep(): boolean {
    this.completedFlags.clear();
    if (this.stepIndex + 1 < this.steps.length) {
      this.stepIndex += 1;
      return true;
    }
    this.completed = true;
    markTutorialCompleted();
    return true;
  }

  public toHudState(useTouchLabels: boolean): TutorialHudState | null {
    if (!this.active) return null;
    const step = this.steps[Math.min(this.stepIndex, this.steps.length - 1)];
    if (!step) return null;

    return {
      active: this.active,
      isTrainingBay: this.isTrainingBay,
      stepIndex: this.stepIndex,
      totalSteps: this.steps.length,
      title: this.completed ? 'TRAINING PROTOCOL COMPLETE' : step.title,
      instruction: this.completed
        ? this.isTrainingBay
          ? 'All field controls verified! Proceed through the green Extraction Airlock north of the bay.'
          : 'All controls verified. You can toggle this guide anytime with F1.'
        : useTouchLabels
          ? step.touchInstruction
          : step.instruction,
      tip: step.tip,
      inputs: step.inputs.map((inp) => ({
        ...inp,
        done: this.completed || this.completedFlags.has(inp.id as TutorialInputId),
      })),
      completed: this.completed,
    };
  }
}
