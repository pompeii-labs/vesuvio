import type { DaemonConfig } from '../daemon/config';

export interface VoiceConfig {
    voice: string;
    speed: number;
}

const defaults: VoiceConfig = {
    voice: 'af_heart',
    speed: 1.0,
};

/**
 * Text-to-Speech via Kokoro
 * Returns raw audio bytes (WAV format)
 */
export async function textToSpeech(
    config: DaemonConfig,
    text: string,
    voiceConfig?: Partial<VoiceConfig>
): Promise<Buffer> {
    const vc = { ...defaults, ...voiceConfig };
    const url = `http://${config.tts.host}:${config.tts.port}/v1/audio/speech`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'kokoro',
            input: text,
            voice: vc.voice,
            speed: vc.speed,
            response_format: 'wav',
        }),
        signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
        throw new Error(`TTS error ${res.status}: ${await res.text()}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
}

/**
 * Speech-to-Text via Whisper
 * Takes raw audio bytes, returns transcribed text
 */
export async function speechToText(
    config: DaemonConfig,
    audio: Buffer,
    format: string = 'wav'
): Promise<string> {
    const url = `http://${config.stt.host}:${config.stt.port}/v1/audio/transcriptions`;

    // Save for debugging

    const formData = new FormData();
    const blob = new Blob([audio], { type: `audio/${format}` });
    formData.append('file', blob, `recording.${format}`);
    formData.append('model', 'Systran/faster-whisper-base');

    const res = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
        throw new Error(`STT error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { text: string };
    return data.text?.trim() || '';
}

/**
 * List available Kokoro voices
 */
export async function listVoices(config: DaemonConfig): Promise<string[]> {
    const url = `http://${config.tts.host}:${config.tts.port}/v1/audio/voices`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { voices: string[] } | string[];
    if (Array.isArray(data)) return data;
    return data.voices || [];
}
