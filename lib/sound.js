// Griot's sounds: short plucked notes, like a kalimba, made by the browser's audio engine.
// There are no audio files and nothing is downloaded. Used by the popup and by
// offscreen/offscreen.html (which plays the welcome back chime when you return to a window).

let griotAudio = null;

// One plucked note: a soft sine with a quick, natural fade, plus a faint metallic "tine" on top.
function pluck(freq, when, options = {}) {
  const { length = 0.9, volume = 0.18, tine = 0.05, bright = 2600 } = options;
  const start = griotAudio.currentTime + when;

  const out = griotAudio.createGain();
  const filter = griotAudio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = bright;
  out.connect(filter).connect(griotAudio.destination);
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, start + length);

  const body = griotAudio.createOscillator();
  body.type = 'sine';
  body.frequency.value = freq;
  body.connect(out);
  body.start(start);
  body.stop(start + length + 0.05);

  if (tine > 0) {
    const ring = griotAudio.createGain();
    ring.gain.setValueAtTime(tine, start);
    ring.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    ring.connect(out);
    const high = griotAudio.createOscillator();
    high.type = 'sine';
    high.frequency.value = freq * 5.4;
    high.connect(ring);
    high.start(start);
    high.stop(start + 0.15);
  }
}

// Notes from a D major pentatonic scale, so any two sound good together.
const NOTE = { D3: 146.8, A4: 440, D5: 587.3, E5: 659.3, Fs5: 740, A5: 880 };

// Each sound Griot can make.
const GRIOT_SOUNDS = {
  park: () => { pluck(NOTE.E5, 0); pluck(NOTE.A4, 0.11, { volume: 0.16 }); },          // "tuck away"
  pickup: () => { pluck(NOTE.A4, 0); pluck(NOTE.E5, 0.1); },                           // "here we go"
  welcome: () => {                                                                     // soft three notes
    pluck(NOTE.D5, 0, { volume: 0.13 });
    pluck(NOTE.Fs5, 0.16, { volume: 0.12 });
    pluck(NOTE.A5, 0.32, { volume: 0.11, length: 1.4 });
  },
  done: () => { pluck(NOTE.A5, 0, { volume: 0.14 }); },                                // one bright note
  delete: () => { pluck(NOTE.D3, 0, { volume: 0.22, length: 0.35, tine: 0, bright: 700 }); }, // low tap
  tick: () => { pluck(1760, 0, { volume: 0.05, length: 0.05, tine: 0 }); }             // tiny click
};

// Play one of Griot's sounds by name. If the browser has no sound, stay silent.
function playSound(name) {
  try {
    griotAudio = griotAudio || new AudioContext();
    if (griotAudio.state === 'suspended') griotAudio.resume();
    GRIOT_SOUNDS[name]();
  } catch (error) {
    // No sound available: nothing to do.
  }
}
