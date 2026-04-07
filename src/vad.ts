import { spawn, execSync } from 'child_process';
import { platform } from 'os';

const isMac = platform() === 'darwin';

function hasCommand(cmd: string): boolean {
    try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export interface VADOptions {
    /** RMS threshold to detect speech (0-32768). Default: 500 */
    speechThreshold?: number;
    /** Silence duration (ms) after speech to trigger send. Default: 1200 */
    silenceDuration?: number;
    /** Min speech duration (ms) to avoid false triggers. Default: 500 */
    minSpeechDuration?: number;
    /** Called when speech segment is detected and ready */
    onSpeech: (audio: Buffer) => void;
    /** Called when speech starts */
    onSpeechStart?: () => void;
    /** Called when listening (silence) */
    onListening?: () => void;
    /** Called with current RMS level for visualization */
    onLevel?: (rms: number) => void;
}

export class ContinuousVAD {
    private proc: ChildProcess | null = null;
    private options: Required<VADOptions>;
    private isSpeaking = false;
    private speechStart = 0;
    private lastSpeechTime = 0;
    private chunks: Buffer[] = [];
    private silenceTimer: Timer | null = null;
    private levelTimer: Timer | null = null;
    private active = false;

    constructor(opts: VADOptions) {
        this.options = {
            speechThreshold: opts.speechThreshold ?? 500,
            silenceDuration: opts.silenceDuration ?? 1200,
            minSpeechDuration: opts.minSpeechDuration ?? 500,
            onSpeech: opts.onSpeech,
            onSpeechStart: opts.onSpeechStart ?? (() => {}),
            onListening: opts.onListening ?? (() => {}),
            onLevel: opts.onLevel ?? (() => {}),
        };
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.chunks = [];

        // Record continuously to stdout as raw PCM (no WAV header issues)
        if (isMac) {
            const cmd = hasCommand('rec') ? 'rec' : hasCommand('ffmpeg') ? 'ffmpeg' : null;
            if (!cmd) throw new Error('Install sox (brew install sox) or ffmpeg');

            if (cmd === 'rec') {
                this.proc = spawn(
                    'rec',
                    [
                        '-q',
                        '-r',
                        '16000',
                        '-c',
                        '1',
                        '-b',
                        '16',
                        '-t',
                        'raw',
                        '-e',
                        'signed-integer',
                        '-',
                    ],
                    { stdio: ['pipe', 'pipe', 'pipe'] }
                );
            } else {
                this.proc = spawn(
                    'ffmpeg',
                    [
                        '-f',
                        'avfoundation',
                        '-i',
                        ':default',
                        '-ar',
                        '16000',
                        '-ac',
                        '1',
                        '-f',
                        's16le',
                        '-loglevel',
                        'quiet',
                        'pipe:1',
                    ],
                    { stdio: ['pipe', 'pipe', 'pipe'] }
                );
            }
        } else {
            this.proc = spawn(
                'arecord',
                ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'raw', '-q', '-'],
                { stdio: ['pipe', 'pipe', 'pipe'] }
            );
        }

        this.proc.stdout?.on('data', (chunk: Buffer) => {
            this.processAudio(chunk);
        });

        this.proc.on('error', () => {
            this.active = false;
        });

        this.options.onListening();
    }

    stop() {
        this.active = false;
        if (this.proc) {
            this.proc.kill('SIGINT');
            this.proc = null;
        }
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        if (this.levelTimer) {
            clearInterval(this.levelTimer as any);
            this.levelTimer = null;
        }
    }

    private processAudio(chunk: Buffer) {
        if (!this.active || this.muted) return;

        // Calculate RMS of this chunk
        const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sum / samples.length);

        this.options.onLevel(rms);

        const now = Date.now();

        if (rms > this.options.speechThreshold) {
            // Speech detected
            if (!this.isSpeaking) {
                this.isSpeaking = true;
                this.speechStart = now;
                this.chunks = [];
                this.options.onSpeechStart();
            }
            this.lastSpeechTime = now;

            // Clear any pending silence timer
            if (this.silenceTimer) {
                clearTimeout(this.silenceTimer);
                this.silenceTimer = null;
            }
        }

        // Always collect chunks while speaking
        if (this.isSpeaking) {
            this.chunks.push(Buffer.from(chunk));

            // Check for silence after speech
            if (rms <= this.options.speechThreshold && !this.silenceTimer) {
                this.silenceTimer = setTimeout(() => {
                    this.silenceTimer = null;
                    const speechDuration = now - this.speechStart;

                    if (
                        speechDuration >= this.options.minSpeechDuration &&
                        this.chunks.length > 0
                    ) {
                        // Convert raw PCM to WAV and emit
                        const pcm = Buffer.concat(this.chunks);
                        const wav = this.pcmToWav(pcm, 16000, 1, 16);
                        this.options.onSpeech(wav);
                    }

                    this.isSpeaking = false;
                    this.chunks = [];
                    this.options.onListening();
                }, this.options.silenceDuration);
            }
        }
    }

    /** Convert raw PCM to WAV buffer */
    private pcmToWav(
        pcm: Buffer,
        sampleRate: number,
        channels: number,
        bitsPerSample: number
    ): Buffer {
        const byteRate = (sampleRate * channels * bitsPerSample) / 8;
        const blockAlign = (channels * bitsPerSample) / 8;
        const header = Buffer.alloc(44);

        header.write('RIFF', 0);
        header.writeUInt32LE(36 + pcm.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20); // PCM
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(pcm.length, 40);

        return Buffer.concat([header, pcm]);
    }

    /** Temporarily mute — ignore all audio (e.g. while TTS is playing) */
    mute() {
        this.muted = true;
    }
    unmute() {
        this.muted = false;
    }
    private muted = false;

    get isActive() {
        return this.active;
    }
    get speaking() {
        return this.isSpeaking;
    }
}
