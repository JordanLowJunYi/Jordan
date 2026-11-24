// The visualiser's audio graph, on the arcade's shared AudioContext.
//
//   demo synth ─┐
//   audio file ─┼─▶ analyser            (what the pictures are drawn from)
//   microphone ─┘
//   demo / file ──▶ output gain ──▶ speakers   (0 while the arcade is muted)
//
// The microphone only ever feeds the analyser, so it is never played back.
// A chosen file is played from an object URL on the visitor's own device.
import { Chiptune } from './chiptune';

export type SourceKind = 'demo' | 'mic' | 'file';

export class MicError extends Error {
  friendly: string;
  constructor(friendly: string) {
    super(friendly);
    this.friendly = friendly;
  }
}

export class Engine {
  readonly ac: AudioContext;
  readonly analyser: AnalyserNode;
  private out: GainNode;
  private demoBus: GainNode;
  private demo: Chiptune;
  private mic: { stream: MediaStream; node: MediaStreamAudioSourceNode } | null = null;
  private micReq = 0; // bumps on every start/stop, so a late permission grant can be dropped
  private el: HTMLAudioElement | null = null;
  private elNode: MediaElementAudioSourceNode | null = null;
  private url: string | null = null;
  onEnded: (() => void) | null = null;
  onFileError: (() => void) | null = null;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.78;
    this.analyser.minDecibels = -92;
    this.analyser.maxDecibels = -14;
    this.out = ac.createGain();
    this.out.connect(ac.destination);
    this.demoBus = ac.createGain();
    this.demoBus.connect(this.analyser);
    this.demoBus.connect(this.out);
    this.demo = new Chiptune(ac, this.demoBus);
  }

  setMuted(muted: boolean) {
    this.out.gain.setTargetAtTime(muted ? 0 : 1, this.ac.currentTime, 0.02);
  }

  setCalm(calm: boolean) {
    this.analyser.smoothingTimeConstant = calm ? 0.9 : 0.78;
  }

  get sampleRate() {
    return this.ac.sampleRate;
  }

  // ---------- demo ----------
  playDemo() {
    this.demo.start();
  }
  pauseDemo() {
    this.demo.stop();
  }

  // ---------- file ----------
  private ensureElement() {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = 'auto';
    el.addEventListener('ended', () => this.onEnded?.());
    el.addEventListener('error', () => {
      if (el.getAttribute('src')) this.onFileError?.();
    });
    this.el = el;
    this.elNode = this.ac.createMediaElementSource(el);
    this.elNode.connect(this.analyser);
    this.elNode.connect(this.out);
    return el;
  }

  loadFile(file: File) {
    const el = this.ensureElement();
    el.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    el.src = this.url;
    el.currentTime = 0;
  }

  get hasFile() {
    return !!this.url;
  }

  async playFile() {
    if (!this.el || !this.url) return;
    await this.el.play();
  }

  pauseFile() {
    this.el?.pause();
  }

  // ---------- microphone ----------
  /** Resolves true once listening, or false if stopped/replaced while asking. */
  async startMic(): Promise<boolean> {
    if (this.mic) return true;
    const req = ++this.micReq;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError("This browser can't use a microphone here. It needs a secure (https) page.");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError')
        throw new MicError(
          'Microphone access was blocked. You can allow it from the icon in the address bar, or enjoy the demo track instead.',
        );
      if (name === 'NotFoundError' || name === 'OverconstrainedError')
        throw new MicError('No microphone was found on this device.');
      if (name === 'NotReadableError')
        throw new MicError('Your microphone seems busy in another app. Close it there and try again.');
      throw new MicError("Couldn't start the microphone. Please try again.");
    }
    if (req !== this.micReq) {
      // the visitor moved on while the browser was asking: let the mic go
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    const node = this.ac.createMediaStreamSource(stream);
    node.connect(this.analyser); // analyser only: never to the speakers
    this.mic = { stream, node };
    return true;
  }

  stopMic() {
    this.micReq++;
    if (!this.mic) return;
    this.mic.stream.getTracks().forEach((t) => t.stop());
    this.mic.node.disconnect();
    this.mic = null;
  }

  /** Stop everything except `keep`. */
  stopAllBut(keep: SourceKind | null) {
    if (keep !== 'demo') this.pauseDemo();
    if (keep !== 'file') this.pauseFile();
    if (keep !== 'mic') this.stopMic();
  }

  dispose() {
    this.stopAllBut(null);
    if (this.el) {
      this.el.removeAttribute('src');
      this.el.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.elNode?.disconnect();
    this.demoBus.disconnect();
    this.analyser.disconnect();
    this.out.disconnect();
    this.onEnded = null;
    this.onFileError = null;
  }
}
