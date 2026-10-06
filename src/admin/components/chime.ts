// A short two-note chime for something that just arrived (a guest's GCash
// receipt). Made with Web Audio, so there is no sound file to load. Browsers
// only play sound after someone has clicked or typed on the page; before that
// it stays quiet, and the pop-up and the bell still show it.

let audio: AudioContext | null = null;

export function chime(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const start = audio.currentTime;
    [880, 1318.5].forEach((frequency, index) => {
      const ctx = audio as AudioContext;
      const at = start + index * 0.14;
      const tone = ctx.createOscillator();
      const volume = ctx.createGain();
      tone.type = 'sine';
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      tone.connect(volume).connect(ctx.destination);
      tone.start(at);
      tone.stop(at + 0.5);
    });
  } catch {
    // No audio in this browser: the pop-up and the bell are enough.
  }
}
