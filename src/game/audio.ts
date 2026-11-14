import {
  EnemyType,
  GameSettings,
  MonsterAttackKind,
  MonsterVocalCategory,
  MonsterWeightClass,
  SurfaceKind,
  WeaponId,
} from './types';

export class HorrorAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientStarted = false;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private bossMode = false;
  private bossPulseTimer: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private masterVol = 0.75;
  private sfxVol = 0.85;
  private musicVol = 0.6;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.masterGain.gain.value = this.masterVol;
      this.sfxGain.gain.value = this.sfxVol;
      this.musicGain.gain.value = this.musicVol;

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(1.5);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.ambientStarted && this.ctx) {
      this.startAmbientDrone();
    }
  }

  public applySettings(settings: GameSettings): void {
    this.masterVol = settings.masterVolume;
    this.sfxVol = settings.sfxVolume;
    this.musicVol = settings.musicVolume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVol, this.ctx.currentTime, 0.05);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.05);
    }
  }

  private createNoiseBuffer(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private startAmbientDrone(): void {
    if (!this.ctx || !this.musicGain) return;
    this.ambientStarted = true;
    const now = this.ctx.currentTime;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.001, now);
    this.droneGain.gain.exponentialRampToValueAtTime(0.18, now + 3);

    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.value = 41.2; // Low E1

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 61.7; // B1 dissonant industrial hum

    this.droneOsc1.connect(filter);
    this.droneOsc2.connect(filter);
    filter.connect(this.droneGain);
    this.droneGain.connect(this.musicGain);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
  }

  public setBossMusic(active: boolean): void {
    if (this.bossMode === active) return;
    this.bossMode = active;
    if (this.bossPulseTimer !== null) {
      window.clearInterval(this.bossPulseTimer);
      this.bossPulseTimer = null;
    }
    if (active) {
      this.bossPulseTimer = window.setInterval(() => {
        this.playBossPulse();
      }, 480);
    }
  }

  private playBossPulse(): void {
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 280;
    osc.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playGunshot(weaponId: WeaponId): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    if (weaponId === 'energy_rifle') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(125, now + 0.17);
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);

      // Subharmonic arc discharge
      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      sg.gain.setValueAtTime(0.22, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      sub.connect(sg);
      sg.connect(this.sfxGain);
      sub.start(now);
      sub.stop(now + 0.16);
      return;
    }

    // Ballistic punch + sub-bass + noise crack + mechanical bolt clack
    const dur = weaponId === 'sniper_rifle' ? 0.38 : weaponId === 'heavy_mg' ? 0.18 : 0.14;
    const pitchStart = weaponId === 'sniper_rifle' ? 245 : weaponId === 'heavy_mg' ? 160 : 215;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchStart, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + dur * 0.72);
    oscGain.gain.setValueAtTime(0.38, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // Crisp mechanical bolt-clack transient
    const bolt = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    bolt.type = 'square';
    bolt.frequency.setValueAtTime(weaponId === 'sniper_rifle' ? 1450 : 2150, now + 0.012);
    bolt.frequency.exponentialRampToValueAtTime(680, now + 0.042);
    bGain.gain.setValueAtTime(0.09, now + 0.012);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    bolt.connect(bGain);
    bGain.connect(this.sfxGain);
    bolt.start(now + 0.012);
    bolt.stop(now + 0.05);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = weaponId === 'sniper_rifle' ? 1350 : 1950;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(weaponId === 'sniper_rifle' ? 0.48 : 0.32, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      src.start(now);
      src.stop(now + dur + 0.02);
    }
  }

  public playBossStomp(distance = 12, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.12, Math.min(1, 18 / (distance + 6)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(68, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.32);
    g.gain.setValueAtTime(0.42 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(g);
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      osc.connect(g);
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playReload(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [0, 0.35, 0.88, 0.96].forEach((offset, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx >= 2 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(idx === 3 ? 880 : idx === 2 ? 640 : 420, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx >= 2 ? 320 : 180, now + offset + 0.065);
      g.gain.setValueAtTime(idx >= 2 ? 0.14 : 0.11, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.075);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.085);
    });
  }

  public playFootstep(sprint = false, crouch = false): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const vol = crouch ? 0.04 : sprint ? 0.14 : 0.08;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playClick(high = true): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(high ? 1100 : 620, now);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playHitMarker(crit = false): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(crit ? 1500 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playPlayerHurt(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playEnemyRoar(distance = 10, heavy = false, pan = 0, hydraulic = true): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.08, Math.min(1, 15 / (distance + 4)));
    const now = this.ctx.currentTime;

    const routeOut = (node: AudioNode) => {
      if (this.ctx && typeof this.ctx.createStereoPanner === 'function') {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        node.connect(panner);
        panner.connect(this.sfxGain!);
      } else {
        node.connect(this.sfxGain!);
      }
    };

    // Layer 1: Distorted biological roar
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 88 : 220, now);
    osc.frequency.linearRampToValueAtTime(heavy ? 46 : 95, now + 0.52);
    g.gain.setValueAtTime(0.24 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = heavy ? 210 : 620;
    osc.connect(f);
    f.connect(g);
    routeOut(g);
    osc.start(now);
    osc.stop(now + 0.58);

    // Layer 2: Metallic hydraulic actuator whine
    if (hydraulic) {
      const servo = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      servo.type = 'triangle';
      servo.frequency.setValueAtTime(heavy ? 310 : 680, now + 0.04);
      servo.frequency.exponentialRampToValueAtTime(heavy ? 185 : 410, now + 0.34);
      sg.gain.setValueAtTime(0.09 * atten, now + 0.04);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      servo.connect(sg);
      routeOut(sg);
      servo.start(now + 0.04);
      servo.stop(now + 0.4);
    }

    // Layer 3: Wet organic mandible clicks
    for (let c = 0; c < 3; c++) {
      const t = now + c * 0.065;
      const clk = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      clk.type = 'square';
      clk.frequency.setValueAtTime(heavy ? 420 : 1250 - c * 180, t);
      clk.frequency.exponentialRampToValueAtTime(160, t + 0.03);
      cg.gain.setValueAtTime(0.07 * atten, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      clk.connect(cg);
      routeOut(cg);
      clk.start(t);
      clk.stop(t + 0.04);
    }
  }

  public playScreamerShriek(distance = 12, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.1, Math.min(1, 20 / (distance + 5)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(1780, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.72);
    osc2.frequency.setValueAtTime(960, now);
    osc2.frequency.exponentialRampToValueAtTime(2400, now + 0.25);
    osc2.frequency.exponentialRampToValueAtTime(1100, now + 0.72);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24 * atten, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.76);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1450;
    bp.Q.value = 2.4;

    osc.connect(bp);
    osc2.connect(bp);
    bp.connect(g);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.78);
    osc2.stop(now + 0.78);
  }

  public playArmorShatter(distance = 10, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.14, Math.min(1, 18 / (distance + 4)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.26);
    g.gain.setValueAtTime(0.32 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc.stop(now + 0.3);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 950;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.28 * atten, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.24);
    }
  }

  public playAmbientCreak(pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110 + Math.random() * 55, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 1.1);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.06, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(g);
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      osc.connect(g);
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc.stop(now + 1.2);
  }

  public playAlarmBeep(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.12);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playAbility(accent: 'overdrive' | 'shadow' | 'fortress' | 'reboot' | 'pulse'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (accent === 'pulse') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.6);
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.66);
    } else {
      osc.type = 'sine';
      const base = accent === 'shadow' ? 320 : accent === 'fortress' ? 160 : 440;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.28);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.34);
    }
  }

  public playRadioStatic(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100;
    bp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.36);
  }

  public isUnlocked(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  public setCutsceneDrone(mode: 'space' | 'ruins' | 'lab' | 'signal' | 'apc' | 'normal'): void {
    if (!this.ctx || !this.droneOsc1 || !this.droneOsc2 || !this.droneGain) return;
    const now = this.ctx.currentTime;
    if (mode === 'space') {
      this.droneOsc1.frequency.setTargetAtTime(34.6, now, 0.8);
      this.droneOsc2.frequency.setTargetAtTime(51.9, now, 0.8);
      this.droneGain.gain.setTargetAtTime(0.22, now, 0.6);
    } else if (mode === 'ruins') {
      this.droneOsc1.frequency.setTargetAtTime(38.9, now, 0.6);
      this.droneOsc2.frequency.setTargetAtTime(58.3, now, 0.6);
      this.droneGain.gain.setTargetAtTime(0.25, now, 0.5);
    } else if (mode === 'lab') {
      this.droneOsc1.frequency.setTargetAtTime(46.2, now, 0.5);
      this.droneOsc2.frequency.setTargetAtTime(49.0, now, 0.5); // tense beating dissonance
      this.droneGain.gain.setTargetAtTime(0.24, now, 0.4);
    } else if (mode === 'signal') {
      this.droneOsc1.frequency.setTargetAtTime(55.0, now, 0.7);
      this.droneOsc2.frequency.setTargetAtTime(82.4, now, 0.7);
      this.droneGain.gain.setTargetAtTime(0.26, now, 0.5);
    } else if (mode === 'apc') {
      this.droneOsc1.frequency.setTargetAtTime(36.7, now, 0.4);
      this.droneOsc2.frequency.setTargetAtTime(55.0, now, 0.4);
      this.droneGain.gain.setTargetAtTime(0.2, now, 0.3);
    } else {
      this.droneOsc1.frequency.setTargetAtTime(41.2, now, 0.8);
      this.droneOsc2.frequency.setTargetAtTime(61.7, now, 0.8);
      this.droneGain.gain.setTargetAtTime(0.18, now, 0.6);
    }
  }

  public playMeteorEntry(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, now);
    bp.frequency.exponentialRampToValueAtTime(240, now + 1.3);
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 1.4);
  }

  public playMeteorImpact(intensity = 1.0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 1.1);
    g.gain.setValueAtTime(0.42 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1.3);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(620, now);
      lp.frequency.exponentialRampToValueAtTime(110, now + 1.0);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.28 * intensity, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 1.2);
    }
  }

  public playLabFlicker(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    g.gain.setValueAtTime(0.06, now);
    g.gain.setValueAtTime(0.01, now + 0.04);
    g.gain.setValueAtTime(0.08, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playSilhouetteStinger(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Heavy sub thud + dissonant metallic horror scrape
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 0.7);
    sg.gain.setValueAtTime(0.45, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    sub.connect(sg);
    sg.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.78);

    [311, 329, 622].forEach((freq) => {
      if (!this.ctx || !this.sfxGain) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, now);
      o.frequency.linearRampToValueAtTime(freq * 0.92, now + 1.4);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 950;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
      o.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      o.start(now);
      o.stop(now + 1.5);
    });
  }

  public playHeliosSignalPulse(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(440, now);
    carrier.frequency.exponentialRampToValueAtTime(660, now + 0.45);
    carrier.frequency.exponentialRampToValueAtTime(293, now + 1.3);
    mod.type = 'sine';
    mod.frequency.value = 14;
    modGain.gain.value = 48;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    carrier.connect(g);
    g.connect(this.sfxGain);
    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 1.4);
    mod.stop(now + 1.4);
  }

  public playRadioSquelch(disconnect = false): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    if (disconnect) {
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.42);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    } else {
      osc.frequency.setValueAtTime(1750, now);
      osc.frequency.setValueAtTime(1250, now + 0.04);
      g.gain.setValueAtTime(0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    }
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (disconnect ? 0.46 : 0.1));

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = disconnect ? 1600 : 2400;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(disconnect ? 0.22 : 0.1, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + (disconnect ? 0.55 : 0.22));
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + (disconnect ? 0.56 : 0.24));
    }
  }

  public playVehicleImpact(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Colossal hull slam + metal shriek + debris rattle
    const boom = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(24, now + 0.85);
    bg.gain.setValueAtTime(0.55, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    boom.connect(lp);
    lp.connect(bg);
    bg.connect(this.sfxGain);
    boom.start(now);
    boom.stop(now + 1.0);

    const clang = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    clang.type = 'square';
    clang.frequency.setValueAtTime(520, now);
    clang.frequency.exponentialRampToValueAtTime(135, now + 0.55);
    cg.gain.setValueAtTime(0.24, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    clang.connect(cg);
    cg.connect(this.sfxGain);
    clang.start(now);
    clang.stop(now + 0.6);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 780;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.45, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.82);
    }
  }

  public playDoorHydraulicOpen(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const motor = this.ctx.createOscillator();
    const mg = this.ctx.createGain();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(58, now);
    motor.frequency.linearRampToValueAtTime(74, now + 1.6);
    motor.frequency.linearRampToValueAtTime(48, now + 2.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    mg.gain.setValueAtTime(0.001, now);
    mg.gain.linearRampToValueAtTime(0.18, now + 0.25);
    mg.gain.exponentialRampToValueAtTime(0.001, now + 2.9);
    motor.connect(lp);
    lp.connect(mg);
    mg.connect(this.sfxGain);
    motor.start(now);
    motor.stop(now + 2.95);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2200;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.14, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.95);
    }
  }

  public playPuzzleSolve(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [440, 587, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      g.gain.setValueAtTime(0.18, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.24);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.26);
    });
  }

  public playPuzzleError(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(95, now + 0.26);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playSaveChime(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [520, 780].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      g.gain.setValueAtTime(0.16, now + idx * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.32);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.34);
    });
  }

  public playWaterDrain(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(900, now);
      bp.frequency.exponentialRampToValueAtTime(220, now + 1.4);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 1.5);
    }
  }

  public playMachineCrusher(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.2);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1.3);
  }

  public playEndingStinger(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [110, 165, 220, 330].forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.96, now + 2.5);
      const lp = this.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 2.9);
    });
  }

  private routeSpatial(
    node: AudioNode,
    pan: number,
    occludedWalls: number,
    distance: number,
    addReverb = false
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    let tail: AudioNode = node;

    // Acoustic wall occlusion muffling (solid barriers absorb high frequencies)
    if (occludedWalls > 0) {
      const lpf = this.ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = Math.max(320, 2100 - occludedWalls * 520);
      tail.connect(lpf);
      tail = lpf;
    }

    let target: AudioNode = this.sfxGain;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(panner);
      panner.connect(this.sfxGain);
      target = panner;
    } else {
      tail.connect(this.sfxGain);
    }

    // Subtle distance corridor echo/reverb tail for distant horror sounds
    if (addReverb && distance > 8 && distance < 55) {
      const delay = this.ctx.createDelay(0.4);
      delay.delayTime.value = Math.min(0.24, 0.055 + distance * 0.003);
      const revGain = this.ctx.createGain();
      revGain.gain.value = 0.22;
      const revLpf = this.ctx.createBiquadFilter();
      revLpf.type = 'lowpass';
      revLpf.frequency.value = occludedWalls > 0 ? 550 : 1250;
      tail.connect(delay);
      delay.connect(revLpf);
      revLpf.connect(revGain);
      revGain.connect(target === this.sfxGain ? this.sfxGain : target);
    }
  }

  public playSurfaceFootstep(
    surface: SurfaceKind,
    weight: MonsterWeightClass,
    speedRatio = 1.0,
    distance = 4,
    pan = 0,
    occludedWalls = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 42) return;
    const now = this.ctx.currentTime;
    const wallAtten = Math.pow(0.7, occludedWalls);
    const distAtten = Math.max(0.04, Math.min(1, 12 / (distance + 4))) * wallAtten;
    const speedGain = 0.55 + Math.min(1.3, speedRatio) * 0.45;
    const weightGain =
      weight === 'boss'
        ? 0.44
        : weight === 'large'
          ? 0.34
          : weight === 'mech'
            ? 0.28
            : weight === 'medium'
              ? 0.18
              : 0.11;
    const vol = weightGain * distAtten * speedGain;
    if (vol < 0.01) return;

    const pitchVar = 0.9 + Math.random() * 0.22;
    const baseFreq =
      weight === 'boss'
        ? 52
        : weight === 'large'
          ? 74
          : weight === 'mech'
            ? 105
            : weight === 'medium'
              ? 135
              : 240;

    // 1. Primary impact body thud
    const thud = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thud.type = surface === 'metal' || surface === 'industrial' ? 'triangle' : 'sine';
    thud.frequency.setValueAtTime(baseFreq * pitchVar, now);
    thud.frequency.exponentialRampToValueAtTime(Math.max(20, baseFreq * 0.32), now + (weight === 'boss' ? 0.28 : 0.11));
    tg.gain.setValueAtTime(vol, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + (weight === 'boss' ? 0.32 : 0.13));
    thud.connect(tg);
    this.routeSpatial(tg, pan, occludedWalls, distance, weight === 'boss');
    thud.start(now);
    thud.stop(now + 0.34);

    // 2. Surface texture layer (noise burst shaped per surface)
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      const ng = this.ctx.createGain();
      let dur = 0.08;
      let nVol = vol * 0.65;

      if (surface === 'metal' || surface === 'industrial') {
        filter.type = 'bandpass';
        filter.frequency.value = (surface === 'metal' ? 1150 : 780) * pitchVar;
        filter.Q.value = 3.2;
        dur = 0.14;
      } else if (surface === 'gravel') {
        filter.type = 'bandpass';
        filter.frequency.value = 2200 * pitchVar;
        filter.Q.value = 1.2;
        dur = 0.12;
        nVol *= 1.15;
      } else if (surface === 'dirt') {
        filter.type = 'lowpass';
        filter.frequency.value = 540 * pitchVar;
        dur = 0.09;
      } else if (surface === 'water') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1450 * pitchVar, now);
        filter.frequency.exponentialRampToValueAtTime(420, now + 0.18);
        filter.Q.value = 1.8;
        dur = 0.19;
        nVol *= 1.25;
      } else if (surface === 'glass') {
        filter.type = 'highpass';
        filter.frequency.value = 3100 * pitchVar;
        dur = 0.11;
        nVol *= 1.1;
      } else {
        // concrete
        filter.type = 'bandpass';
        filter.frequency.value = 620 * pitchVar;
        filter.Q.value = 1.0;
        dur = 0.07;
      }

      ng.gain.setValueAtTime(nVol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(ng);
      this.routeSpatial(ng, pan, occludedWalls, distance, false);
      src.start(now);
      src.stop(now + dur + 0.02);
    }

    // 3. Infected Mech / Boss metallic servo + hydraulic hiss + clank
    if (weight === 'mech' || weight === 'boss') {
      const clank = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      clank.type = 'square';
      clank.frequency.setValueAtTime((weight === 'boss' ? 280 : 480) * pitchVar, now);
      clank.frequency.exponentialRampToValueAtTime(140, now + 0.07);
      cg.gain.setValueAtTime(vol * 0.34, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      clank.connect(cg);
      this.routeSpatial(cg, pan, occludedWalls, distance, false);
      clank.start(now);
      clank.stop(now + 0.09);

      if (this.noiseBuffer) {
        const hiss = this.ctx.createBufferSource();
        hiss.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2600;
        const hg = this.ctx.createGain();
        hg.gain.setValueAtTime(vol * 0.22, now + 0.02);
        hg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        hiss.connect(hp);
        hp.connect(hg);
        this.routeSpatial(hg, pan, occludedWalls, distance, false);
        hiss.start(now + 0.02);
        hiss.stop(now + 0.16);
      }
    }
  }

  public playMonsterVocal(
    enemyType: EnemyType,
    category: MonsterVocalCategory,
    distance = 10,
    pan = 0,
    occludedWalls = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 58) return;

    const now = this.ctx.currentTime;
    const wallAtten = Math.pow(0.72, occludedWalls);
    const atten = Math.max(0.05, Math.min(1, 18 / (distance + 5))) * wallAtten;
    const jitter = 0.88 + Math.random() * 0.24;

    const isSmall = enemyType === 'crawler' || enemyType === 'hollow_dweller';
    const isScreamer = enemyType === 'screamer' || enemyType === 'watcher';
    const isMech =
      enemyType === 'sentinel' ||
      enemyType === 'scrapper' ||
      enemyType === 'drowned_machine' ||
      enemyType === 'helios_unit';
    const isBoss =
      enemyType === 'titan' ||
      enemyType === 'titanforged' ||
      enemyType === 'forgemaster' ||
      enemyType === 'guardian' ||
      enemyType === 'origin';

    let baseFreq = isBoss ? 66 : isMech ? 155 : isScreamer ? 580 : isSmall ? 340 : 125;
    let endFreq = baseFreq * 0.58;
    let dur = isBoss ? 0.85 : isScreamer ? 0.65 : isSmall ? 0.28 : 0.48;
    let gainScale = category === 'idle' ? 0.1 : category === 'damage' ? 0.22 : 0.28;

    if (category === 'warning') {
      endFreq = baseFreq * (isScreamer ? 1.85 : 1.15);
      dur *= 1.15;
    } else if (category === 'attack') {
      baseFreq *= 1.22;
      endFreq = baseFreq * 0.48;
      dur *= 0.85;
    } else if (category === 'damage') {
      baseFreq *= 1.38;
      endFreq = baseFreq * 0.65;
      dur *= 0.65;
    } else if (category === 'death') {
      baseFreq *= 0.92;
      endFreq = Math.max(24, baseFreq * 0.24);
      dur *= 1.55;
      gainScale = 0.32;
    } else {
      // idle low breath / chitter
      dur *= 0.7;
    }

    baseFreq *= jitter;
    endFreq *= jitter;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const bp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = isScreamer ? 'sawtooth' : isMech ? 'square' : 'sawtooth';
    osc2.type = isSmall ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(22, endFreq), now + dur);

    osc2.frequency.setValueAtTime(baseFreq * (isBoss ? 0.5 : 1.48), now);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(18, endFreq * (isBoss ? 0.5 : 1.35)), now + dur);

    bp.type = 'bandpass';
    bp.frequency.value = isBoss ? 220 : isScreamer ? 1550 : isMech ? 680 : 480;
    bp.Q.value = isScreamer ? 2.8 : 1.5;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gainScale * atten, now + Math.min(0.09, dur * 0.22));
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(bp);
    osc2.connect(bp);
    bp.connect(g);
    this.routeSpatial(g, pan, occludedWalls, distance, true);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + dur + 0.03);
    osc2.stop(now + dur + 0.03);

    // Organic throat rasp / mech servo layer
    if (isMech || category === 'death') {
      const servo = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      servo.type = 'triangle';
      servo.frequency.setValueAtTime(isMech ? 520 * jitter : 160, now + 0.03);
      servo.frequency.exponentialRampToValueAtTime(isMech ? (category === 'death' ? 45 : 290) : 40, now + dur * 0.9);
      sg.gain.setValueAtTime(0.1 * atten, now + 0.03);
      sg.gain.exponentialRampToValueAtTime(0.001, now + dur);
      servo.connect(sg);
      this.routeSpatial(sg, pan, occludedWalls, distance, false);
      servo.start(now + 0.03);
      servo.stop(now + dur + 0.03);
    }
  }

  public playAttackWindupSound(
    kind: MonsterAttackKind,
    isMech: boolean,
    distance = 6,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.08, Math.min(1, 14 / (distance + 4)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = isMech ? 'square' : 'sawtooth';
    const f0 = kind === 'heavy_slam' ? 95 : kind === 'charge' ? 140 : 280;
    const f1 = kind === 'heavy_slam' ? 180 : kind === 'charge' ? 320 : 520;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + 0.16);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.14 * atten, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, false);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playAttackImpactSound(
    kind: MonsterAttackKind,
    distance = 4,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.1, Math.min(1, 14 / (distance + 3)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = kind === 'heavy_slam' || kind === 'charge' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(kind === 'heavy_slam' ? 110 : 220, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + (kind === 'heavy_slam' ? 0.34 : 0.16));
    g.gain.setValueAtTime((kind === 'heavy_slam' ? 0.42 : 0.26) * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'heavy_slam' ? 0.36 : 0.18));
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, kind === 'heavy_slam');
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playDestructionSound(
    kind: 'barricade' | 'crate' | 'glass' | 'weak_door',
    distance = 8,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.12, Math.min(1, 20 / (distance + 4)));
    const now = this.ctx.currentTime;

    if (kind === 'glass' && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.32 * atten, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      src.connect(hp);
      hp.connect(ng);
      this.routeSpatial(ng, pan, 0, distance, true);
      src.start(now);
      src.stop(now + 0.4);
      return;
    }

    this.playArmorShatter(distance, pan);
  }

  public playAmbientHorrorEvent(
    kind:
      | 'distant_shriek'
      | 'corridor_steps'
      | 'metal_creak'
      | 'elec_buzz'
      | 'machinery_hum'
      | 'heavy_breath'
      | 'wind_gust'
      | 'distant_impact',
    pan = 0,
    distance = 28
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.06, Math.min(0.45, 14 / (distance + 8)));

    if (kind === 'distant_shriek') {
      this.playMonsterVocal('screamer', 'warning', distance, pan, 1);
      return;
    }
    if (kind === 'corridor_steps') {
      [0, 0.42, 0.86].forEach((off, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(88 - idx * 4, now + off);
        osc.frequency.exponentialRampToValueAtTime(32, now + off + 0.12);
        g.gain.setValueAtTime(0.14 * atten, now + off);
        g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.14);
        osc.connect(g);
        this.routeSpatial(g, pan, 1, distance, true);
        osc.start(now + off);
        osc.stop(now + off + 0.15);
      });
      return;
    }
    if (kind === 'metal_creak') {
      this.playAmbientCreak(pan);
      return;
    }
    if (kind === 'elec_buzz') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      g.gain.setValueAtTime(0.05 * atten, now);
      g.gain.setValueAtTime(0.01, now + 0.08);
      g.gain.setValueAtTime(0.07 * atten, now + 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(g);
      this.routeSpatial(g, pan, 0, distance, false);
      osc.start(now);
      osc.stop(now + 0.38);
      return;
    }
    if (kind === 'distant_impact') {
      this.playBossStomp(distance, pan);
      return;
    }
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = kind === 'heavy_breath' ? 'bandpass' : 'lowpass';
      bp.frequency.value = kind === 'heavy_breath' ? 520 : kind === 'wind_gust' ? 380 : 210;
      const dur = kind === 'wind_gust' ? 1.4 : 0.75;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.12 * atten, now + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(bp);
      bp.connect(g);
      this.routeSpatial(g, pan, 0, distance, false);
      src.start(now);
      src.stop(now + dur + 0.03);
    }
  }

  public dispose(): void {
    if (this.bossPulseTimer !== null) {
      window.clearInterval(this.bossPulseTimer);
    }
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
  }
}
