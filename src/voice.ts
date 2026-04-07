import { spawn, execSync, type ChildProcess } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { Methods } from './shared';
import type { DaemonConnection } from './connect';
import { platform, tmpdir } from 'os';
import { join } from 'path';

let recording: ChildProcess | null = null;
let recordingFile = '';

const isMac = platform() === 'darwin';

function hasCommand(cmd: string): boolean {
    try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Start recording from microphone to a temp file.
 */
export function startRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
        recordingFile = join(tmpdir(), `vesuvio-rec-${Date.now()}.wav`);

        if (isMac) {
            const cmd = hasCommand('rec') ? 'rec' : hasCommand('ffmpeg') ? 'ffmpeg' : null;
            if (!cmd) {
                return reject(
                    new Error('Install sox (brew install sox) or ffmpeg for mic recording')
                );
            }
            if (cmd === 'rec') {
                recording = spawn(
                    'rec',
                    ['-q', '-r', '16000', '-c', '1', '-b', '16', recordingFile],
                    {
                        stdio: ['pipe', 'pipe', 'pipe'],
                    }
                );
            } else {
                // ffmpeg: use system default audio input
                recording = spawn(
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
                        '-y',
                        '-loglevel',
                        'quiet',
                        recordingFile,
                    ],
                    {
                        stdio: ['pipe', 'pipe', 'pipe'],
                    }
                );
            }
        } else {
            recording = spawn(
                'arecord',
                ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'wav', '-q', recordingFile],
                {
                    stdio: ['pipe', 'pipe', 'pipe'],
                }
            );
        }

        recording.on('error', (err) => {
            recording = null;
            reject(err);
        });

        setTimeout(resolve, 200);
    });
}

/**
 * Stop recording, return the audio buffer from the temp file.
 */
export function stopRecording(): Buffer {
    if (recording) {
        // SIGINT tells ffmpeg/rec/arecord to finalize the file properly
        recording.kill('SIGINT');
        recording = null;
    }

    // Give it a moment to finalize the file
    const start = Date.now();
    while (Date.now() - start < 1000) {
        try {
            const buf = readFileSync(recordingFile);
            if (buf.length > 100) {
                try {
                    unlinkSync(recordingFile);
                } catch {}
                return buf;
            }
        } catch {}
        // Busy wait briefly
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }

    return Buffer.alloc(0);
}

/**
 * Check if currently recording
 */
export function isRecording(): boolean {
    return recording !== null;
}

/**
 * Play audio buffer.
 */
export function playAudio(audio: Buffer): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (isMac) {
            const tmpPath = join(tmpdir(), `vesuvio-tts-${Date.now()}.wav`);
            const fs = await import('fs/promises');
            await fs.writeFile(tmpPath, audio);
            const player = spawn('afplay', [tmpPath], { stdio: ['pipe', 'pipe', 'pipe'] });
            player.on('close', async () => {
                await fs.unlink(tmpPath).catch(() => {});
                resolve();
            });
            player.on('error', reject);
        } else {
            const player = spawn('aplay', ['-q', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
            player.stdin?.write(audio);
            player.stdin?.end();
            player.on('close', () => resolve());
            player.on('error', reject);
        }
    });
}

/**
 * Speak text via TTS
 */
export async function speak(conn: DaemonConnection, text: string, voice?: string): Promise<void> {
    const clean = text
        .replace(/```[\s\S]*?```/g, 'code block')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n{2,}/g, '. ')
        .trim();

    if (!clean) return;

    const toSpeak = clean.length > 500 ? clean.slice(0, 500) + '...' : clean;

    const result = await conn.request<{ audio: string; format: string }>(Methods.VOICE_TTS, {
        text: toSpeak,
        voice,
    });

    const audioBuffer = Buffer.from(result.audio, 'base64');
    await playAudio(audioBuffer);
}
