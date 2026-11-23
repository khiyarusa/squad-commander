'use strict';
/* ============================================================
   04 — AUDIO (fully synthesized, Web Audio API)
   ============================================================ */
const AudioSys = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, ambBus = null;
  let unlocked = false;
  let noiseBuf = null;
  let ambientNodes = [];
  let musicTimer = 0, musicStep = 0, tension = 0, ambientOn = false;
  let vol = { master: 0.85, sfx: 0.85, music: 0.5 };
  const last = {};
  let voices = 0, voiceReset = 0;

  const nowT = () => (ctx ? ctx.currentTime : 0);

  function makeNoise() {
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 5;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.connect(master);
      ambBus = ctx.createGain(); ambBus.connect(master);
      noiseBuf = makeNoise();
      applyVolume();
      return true;
    } catch (e) { console.warn('audio unavailable', e); return false; }
  }

  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    unlocked = true;
    if (!ambientOn) startAmbient();
  }

  function applyVolume() {
    if (!ctx) return;
    master.gain.value = vol.master;
    sfxBus.gain.value = vol.sfx * 0.9;
    musicBus.gain.value = vol.music * 0.5;
    ambBus.gain.value = vol.master * 0.35;
  }
  function setVolume(k, v) { vol[k] = clamp(v, 0, 1); applyVolume(); }
  function setVolumesVals(v) { Object.assign(vol, v); applyVolume(); }

  function spatial(x, cam, range = 900) {
    let g = 1, pan = 0;
    if (cam) {
      const d = Math.abs(x - cam.x);
      g = clamp(1 - d / (range * 1.6), 0.08, 1);
      pan = clamp((x - cam.x) / (range * 0.8), -0.8, 0.8);
    }
    return { g, pan };
  }

  function throttle(key, ms) {
    const t = performance.now();
    if (last[key] && t - last[key] < ms) return false;
    last[key] = t;
    return true;
  }

  function panner(panVal) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = panVal || 0; p.connect(sfxBus); return p; }
    return sfxBus;
  }

  function noiseSrc() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    return src;
  }

  function env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function gunshot(weapon, x, cam) {
    if (!ctx || !unlocked) return;
    if (!throttle('gun' + weapon, 26)) return;
    const t0 = ctx.currentTime;
    const sp = spatial(x, cam, 1200);
    const out = panner(sp.pan);
    const cfg = {
      rifle: { dur: 0.16, lo: 700, hi: 2200, gain: 0.5, thump: 110 },
      smg: { dur: 0.11, lo: 900, hi: 2600, gain: 0.32, thump: 140 },
      shotgun: { dur: 0.34, lo: 280, hi: 1400, gain: 0.7, thump: 70 },
      sniper: { dur: 0.42, lo: 420, hi: 1700, gain: 0.8, thump: 60 },
      lmg: { dur: 0.14, lo: 520, hi: 1800, gain: 0.5, thump: 90 },
      pistol: { dur: 0.12, lo: 800, hi: 2400, gain: 0.3, thump: 160 },
      gl: { dur: 0.25, lo: 300, hi: 1200, gain: 0.55, thump: 80 }
    }[weapon] || { dur: 0.16, lo: 700, hi: 2200, gain: 0.45, thump: 110 };
    // crack
    const src = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass'; bp.frequency.value = cfg.hi; bp.Q.value = 0.8;
    const g = ctx.createGain();
    env(g, t0, cfg.gain * sp.g * 0.7, 0.004, cfg.dur);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t0); src.stop(t0 + cfg.dur + 0.05);
    // low thump
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(cfg.thump, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + cfg.dur * 0.9);
    const g2 = ctx.createGain(); env(g2, t0, cfg.gain * sp.g * 0.8, 0.003, cfg.dur * 0.7);
    o.connect(g2); g2.connect(out); o.start(t0); o.stop(t0 + cfg.dur);
    if (weapon === 'sniper' || weapon === 'shotgun') {
      // tail slap
      const s2 = noiseSrc();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g3 = ctx.createGain(); env(g3, t0 + 0.02, cfg.gain * 0.25 * sp.g, 0.01, 0.35);
      s2.connect(lp); lp.connect(g3); g3.connect(out); s2.start(t0 + 0.02); s2.stop(t0 + 0.5);
    }
  }

  function explosion(x, cam, big = 1) {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    const sp = spatial(x, cam, 1600);
    const out = panner(sp.pan);
    const src = noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400 * big, t0);
    lp.frequency.exponentialRampToValueAtTime(80, t0 + 0.6);
    const g = ctx.createGain(); env(g, t0, 0.75 * sp.g * big, 0.01, 0.75);
    src.connect(lp); lp.connect(g); g.connect(out); src.start(t0); src.stop(t0 + 0.9);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90 * big, t0); o.frequency.exponentialRampToValueAtTime(24, t0 + 0.5);
    const g2 = ctx.createGain(); env(g2, t0, 0.55 * sp.g, 0.01, 0.6);
    o.connect(g2); g2.connect(out); o.start(t0); o.stop(t0 + 0.7);
  }

  function impact(x, cam, material = 'dirt') {
    if (!ctx || !unlocked) return;
    if (!throttle('imp', 45)) return;
    const t0 = ctx.currentTime;
    const sp = spatial(x, cam, 700);
    const src = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = material === 'metal' ? 2600 : material === 'wood' ? 600 : 1800;
    bp.Q.value = 1.4;
    const g = ctx.createGain(); env(g, t0, 0.14 * sp.g, 0.002, 0.07);
    src.connect(bp); bp.connect(g); g.connect(panner(sp.pan)); src.start(t0); src.stop(t0 + 0.12);
  }

  function whizz(x, cam) {
    if (!ctx || !unlocked) return;
    if (!throttle('whizz', 60)) return;
    const t0 = ctx.currentTime;
    const sp = spatial(x, cam, 600);
    const src = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(2400, t0);
    bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.12);
    const g = ctx.createGain(); env(g, t0, 0.09 * sp.g, 0.005, 0.12);
    src.connect(bp); bp.connect(g); g.connect(panner(sp.pan)); src.start(t0); src.stop(t0 + 0.2);
  }

  function click(up = true) {
    if (!ctx || !unlocked) return;
    if (!throttle('click', 18)) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.value = up ? 660 : 440;
    const g = ctx.createGain(); env(g, t0, 0.035, 0.002, 0.05);
    o.connect(g); g.connect(sfxBus); o.start(t0); o.stop(t0 + 0.08);
  }

  function ui(kind = 'tap') {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = kind === 'confirm' ? 520 : kind === 'deny' ? 180 : kind === 'alert' ? 880 : 700;
    o.frequency.setValueAtTime(f, t0);
    if (kind === 'confirm') o.frequency.exponentialRampToValueAtTime(980, t0 + 0.09);
    const g = ctx.createGain(); env(g, t0, kind === 'deny' ? 0.09 : 0.05, 0.004, 0.12);
    o.connect(g); g.connect(sfxBus); o.start(t0); o.stop(t0 + 0.2);
  }

  function reload(x, cam) {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    const sp = spatial(x, cam, 500);
    const out = panner(sp.pan);
    [0, 0.16, 0.34].forEach((d, i) => {
      const s = noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = i === 0 ? 900 : 1500; bp.Q.value = 2;
      const g = ctx.createGain(); env(g, t0 + d, 0.12 * sp.g, 0.002, 0.05);
      s.connect(bp); bp.connect(g); g.connect(out); s.start(t0 + d); s.stop(t0 + d + 0.08);
    });
  }

  function heal(x, cam) {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(320, t0);
    o.frequency.linearRampToValueAtTime(520, t0 + 0.5);
    const g = ctx.createGain(); env(g, t0, 0.05, 0.05, 0.55);
    const sp = spatial(x, cam, 300);
    o.connect(g); g.connect(panner(sp.pan)); o.start(t0); o.stop(t0 + 0.7);
  }

  function radio(text) {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = 1200 + i * 300;
      const g = ctx.createGain(); env(g, t0 + i * 0.09, 0.025, 0.002, 0.04);
      o.connect(g); g.connect(sfxBus); o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.06);
    }
    if (text === 'alarm') {
      const src = noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 2;
      const g = ctx.createGain(); env(g, t0 + 0.2, 0.06, 0.02, 0.4);
      src.connect(bp); bp.connect(g); g.connect(sfxBus); src.start(t0 + 0.2); src.stop(t0 + 0.7);
    }
  }

  function death(x, cam) {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    const sp = spatial(x, cam, 500);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t0); o.frequency.exponentialRampToValueAtTime(60, t0 + 0.4);
    const g = ctx.createGain(); env(g, t0, 0.05 * sp.g, 0.01, 0.45);
    o.connect(g); g.connect(panner(sp.pan)); o.start(t0); o.stop(t0 + 0.5);
  }

  function startAmbient() {
    if (!ctx || ambientOn) return;
    ambientOn = true;
    // wind bed
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.075;
    src.connect(lp); lp.connect(g); g.connect(ambBus); src.start();
    // low drone
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 48;
    const og = ctx.createGain(); og.gain.value = 0.02;
    o.connect(og); og.connect(ambBus); o.start();
    ambientNodes = [{ src, g }, { o, g: og }];
  }

  function setAmbientTheme(theme, weather) {
    if (!ctx || !ambientOn || !ambientNodes[0]) return;
    const base = theme === 'forest' ? 520 : theme === 'industrial' ? 260 : 380;
    ambientNodes[0].g.gain.setTargetAtTime(0.05 + (weather ? 0.04 : 0), ctx.currentTime, 1.5);
    try { ambientNodes[0].src.playbackRate.setTargetAtTime(theme === 'forest' ? 0.8 : 0.7, ctx.currentTime, 1); } catch (e) { }
  }

  function setTension(v) { tension = clamp(v, 0, 1); }
  function setMusic(on) {
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(on ? vol.music * 0.5 : 0, ctx.currentTime, 0.5);
  }

  // Generative score: minor pads, slow heartbeat when tense.
  function updateMusic(dt, inBattle) {
    if (!ctx || !unlocked) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = tension > 0.4 ? 4.2 : 7.5;
    if (!inBattle) return;
    const t0 = ctx.currentTime;
    const roots = [55, 51.9, 43.7, 49]; // A1, G#1, F1, G1
    const root = roots[musicStep % roots.length];
    const chord = [root, root * 1.5, root * 2.0, root * 2.52];
    chord.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520 + i * 90;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.035 + (i === 0 ? 0.02 : 0), t0 + 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.2);
      o.connect(lp); lp.connect(g); g.connect(musicBus);
      o.start(t0); o.stop(t0 + 7.4);
    });
    // distant pulse
    if (tension > 0.35) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.07 * tension, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g); g.connect(musicBus); o.start(t0); o.stop(t0 + 0.55);
    }
    musicStep++;
  }

  return {
    init, unlock, gunshot, explosion, impact, whizz, click, ui, reload, heal, radio, death,
    setVolume, setVolumesVals, setAmbientTheme, setTension, setMusic, updateMusic,
    get ctx() { return ctx; }
  };
})();
