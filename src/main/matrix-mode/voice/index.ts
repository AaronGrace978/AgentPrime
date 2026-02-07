/**
 * Matrix Mode Voice System
 * Wake word detection, speech-to-text, and text-to-speech
 */

import { EventEmitter } from 'events';
import { app } from 'electron';
import path from 'path';

// Types
export interface VoiceConfig {
  wakeWord: string;
  wakeWordSensitivity: number;
  sttProvider: 'whisper' | 'azure' | 'google' | 'local';
  ttsProvider: 'elevenlabs' | 'azure' | 'google' | 'local';
  ttsVoice?: string;
  sampleRate: number;
  vadEnabled: boolean;
  vadThreshold: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  duration: number;
}

export interface SpeechSynthesisOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
}

const DEFAULT_CONFIG: VoiceConfig = {
  wakeWord: 'matrix',
  wakeWordSensitivity: 0.5,
  sttProvider: 'local',
  ttsProvider: 'local',
  sampleRate: 16000,
  vadEnabled: true,
  vadThreshold: 0.5
};

/**
 * Voice Activity Detection
 */
export class VAD extends EventEmitter {
  private threshold: number;
  private sampleRate: number;
  private active: boolean = false;
  private silenceFrames: number = 0;
  private maxSilenceFrames: number = 30;

  constructor(threshold: number = 0.5, sampleRate: number = 16000) {
    super();
    this.threshold = threshold;
    this.sampleRate = sampleRate;
  }

  processAudio(buffer: Float32Array): boolean {
    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    
    const isSpeech = rms > this.threshold;

    if (isSpeech) {
      if (!this.active) {
        this.active = true;
        this.emit('speechStart');
      }
      this.silenceFrames = 0;
    } else {
      this.silenceFrames++;
      if (this.active && this.silenceFrames > this.maxSilenceFrames) {
        this.active = false;
        this.emit('speechEnd');
      }
    }

    return isSpeech;
  }

  reset(): void {
    this.active = false;
    this.silenceFrames = 0;
  }
}

/**
 * Wake Word Detector
 */
export class WakeWordDetector extends EventEmitter {
  private wakeWord: string;
  private sensitivity: number;
  private listening: boolean = false;
  private picovoiceAvailable: boolean = false;

  constructor(wakeWord: string = 'matrix', sensitivity: number = 0.5) {
    super();
    this.wakeWord = wakeWord;
    this.sensitivity = sensitivity;
  }

  async initialize(): Promise<void> {
    // Try to load Picovoice/Porcupine
    try {
      const porcupine = await import('@picovoice/porcupine-node');
      this.picovoiceAvailable = true;
      console.log('[WakeWordDetector] Porcupine available');
    } catch {
      console.warn('[WakeWordDetector] Porcupine not available, using keyword matching');
    }
  }

  start(): void {
    this.listening = true;
    this.emit('start');
  }

  stop(): void {
    this.listening = false;
    this.emit('stop');
  }

  processAudio(buffer: Float32Array): void {
    if (!this.listening) return;

    // Simple keyword matching fallback
    // In production, this would use Porcupine for offline wake word detection
  }

  // Manual trigger (for testing or text-based activation)
  trigger(): void {
    this.emit('wakeWord', { keyword: this.wakeWord, timestamp: Date.now() });
  }
}

/**
 * Speech-to-Text Engine
 */
export class SpeechToText extends EventEmitter {
  private provider: VoiceConfig['sttProvider'];
  private apiKey?: string;
  private whisperAvailable: boolean = false;

  constructor(provider: VoiceConfig['sttProvider'] = 'local', apiKey?: string) {
    super();
    this.provider = provider;
    this.apiKey = apiKey;
  }

  async initialize(): Promise<void> {
    if (this.provider === 'local' || this.provider === 'whisper') {
      try {
        // Try to load local Whisper
        const whisper = await import('whisper-node');
        this.whisperAvailable = true;
        console.log('[SpeechToText] Whisper available');
      } catch {
        console.warn('[SpeechToText] Local Whisper not available');
      }
    }
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const startTime = Date.now();

    // Try OpenAI Whisper API first
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        return await this.transcribeOpenAI(audioBuffer, startTime, openaiKey);
      } catch (error) {
        console.warn('[SpeechToText] OpenAI Whisper failed, trying fallback:', error);
      }
    }

    if (this.whisperAvailable) {
      // Use local Whisper
      try {
        const whisper = await import('whisper-node');
        // Local whisper implementation would go here
        return {
          text: '',
          confidence: 0,
          duration: Date.now() - startTime
        };
      } catch {}
    }

    if (this.provider === 'azure' && this.apiKey) {
      return this.transcribeAzure(audioBuffer, startTime);
    }

    if (this.provider === 'google' && this.apiKey) {
      return this.transcribeGoogle(audioBuffer, startTime);
    }

    throw new Error('No STT provider available');
  }

  private async transcribeOpenAI(buffer: Buffer, startTime: number, apiKey: string): Promise<TranscriptionResult> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    // Whisper API expects a file
    form.append('file', buffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders?.() || {}
      },
      body: form as any
    });

    if (!response.ok) {
      throw new Error(`OpenAI Whisper API error: ${response.statusText}`);
    }

    const result = await response.json() as any;

    return {
      text: result.text || '',
      confidence: result.segments?.[0]?.avg_logprob ? Math.exp(result.segments[0].avg_logprob) : 0.9,
      language: result.language,
      duration: Date.now() - startTime
    };
  }

  private async transcribeAzure(buffer: Buffer, startTime: number): Promise<TranscriptionResult> {
    // Azure Speech-to-Text API implementation
    const region = process.env.AZURE_SPEECH_REGION || 'eastus';
    const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey!,
        'Content-Type': 'audio/wav'
      },
      body: buffer
    });

    if (!response.ok) {
      throw new Error(`Azure STT error: ${response.statusText}`);
    }

    const result = await response.json() as any;

    return {
      text: result.DisplayText || result.Text || '',
      confidence: result.Confidence || 0,
      duration: Date.now() - startTime
    };
  }

  private async transcribeGoogle(buffer: Buffer, startTime: number): Promise<TranscriptionResult> {
    // Google Speech-to-Text API implementation
    const audioBase64 = buffer.toString('base64');
    
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US'
          },
          audio: { content: audioBase64 }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Google STT error: ${response.statusText}`);
    }

    const result = await response.json() as any;
    const transcript = result.results?.[0]?.alternatives?.[0];

    return {
      text: transcript?.transcript || '',
      confidence: transcript?.confidence || 0,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Text-to-Speech Engine
 */
export class TextToSpeech extends EventEmitter {
  private provider: VoiceConfig['ttsProvider'];
  private apiKey?: string;
  private voice?: string;

  constructor(provider: VoiceConfig['ttsProvider'] = 'local', apiKey?: string, voice?: string) {
    super();
    this.provider = provider;
    this.apiKey = apiKey;
    this.voice = voice;
  }

  async synthesize(text: string, options?: SpeechSynthesisOptions): Promise<Buffer> {
    if (this.provider === 'elevenlabs' && this.apiKey) {
      return this.synthesizeElevenLabs(text, options);
    }

    if (this.provider === 'azure' && this.apiKey) {
      return this.synthesizeAzure(text, options);
    }

    if (this.provider === 'google' && this.apiKey) {
      return this.synthesizeGoogle(text, options);
    }

    // Local fallback using system TTS
    return this.synthesizeLocal(text, options);
  }

  private async synthesizeElevenLabs(text: string, options?: SpeechSynthesisOptions): Promise<Buffer> {
    const voice = options?.voice || this.voice || 'Rachel';
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async synthesizeAzure(text: string, options?: SpeechSynthesisOptions): Promise<Buffer> {
    // Azure TTS implementation
    return Buffer.alloc(0);
  }

  private async synthesizeGoogle(text: string, options?: SpeechSynthesisOptions): Promise<Buffer> {
    // Google TTS implementation
    return Buffer.alloc(0);
  }

  private async synthesizeLocal(text: string, options?: SpeechSynthesisOptions): Promise<Buffer> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const execAsync = promisify(exec);

    const tempFile = path.join(os.tmpdir(), `tts-${Date.now()}.wav`);
    const speed = options?.speed || 1.0;

    try {
      if (process.platform === 'win32') {
        // Windows: Use PowerShell with SAPI
        const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const psScript = `
          Add-Type -AssemblyName System.Speech;
          $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
          $synth.SetOutputToWaveFile('${tempFile.replace(/\\/g, '\\\\')}');
          $synth.Rate = ${Math.round((speed - 1) * 5)};
          $synth.Speak("${escapedText}");
          $synth.Dispose();
        `;
        await execAsync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`);
      } else if (process.platform === 'darwin') {
        // macOS: Use say command
        const rate = Math.round(175 * speed);
        const escapedText = text.replace(/"/g, '\\"');
        await execAsync(`say -o "${tempFile}" --data-format=LEI16@22050 -r ${rate} "${escapedText}"`);
      } else {
        // Linux: Use espeak or pico2wave
        const escapedText = text.replace(/"/g, '\\"');
        try {
          const speedPercent = Math.round(speed * 100);
          await execAsync(`espeak -s ${speedPercent} -w "${tempFile}" "${escapedText}"`);
        } catch {
          // Fallback to pico2wave if available
          await execAsync(`pico2wave -w "${tempFile}" "${escapedText}"`);
        }
      }

      // Read the generated file
      const audioBuffer = fs.readFileSync(tempFile);
      
      // Clean up
      try {
        fs.unlinkSync(tempFile);
      } catch {}

      return audioBuffer;
    } catch (error) {
      console.error('[TextToSpeech] Local synthesis failed:', error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Get available voices for the current provider
   */
  async getVoices(): Promise<Array<{ id: string; name: string; language?: string }>> {
    if (this.provider === 'elevenlabs' && this.apiKey) {
      try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': this.apiKey }
        });
        const data = await response.json();
        return data.voices?.map((v: any) => ({
          id: v.voice_id,
          name: v.name,
          language: v.labels?.language
        })) || [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Voice Session Manager
 * Complete voice interaction system with wake word, STT, and TTS
 */
export class VoiceSession extends EventEmitter {
  private config: VoiceConfig;
  private wakeWordDetector: WakeWordDetector;
  private vad: VAD;
  private stt: SpeechToText;
  private tts: TextToSpeech;
  private state: 'idle' | 'listening' | 'processing' | 'speaking' = 'idle';
  private audioBuffer: Float32Array[] = [];
  private conversationMode: boolean = false;
  private conversationTimeout: NodeJS.Timeout | null = null;
  private conversationTimeoutMs: number = 30000;

  constructor(config: Partial<VoiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.wakeWordDetector = new WakeWordDetector(
      this.config.wakeWord,
      this.config.wakeWordSensitivity
    );
    this.vad = new VAD(this.config.vadThreshold, this.config.sampleRate);
    this.stt = new SpeechToText(
      this.config.sttProvider,
      process.env.AZURE_SPEECH_KEY || process.env.GOOGLE_SPEECH_KEY
    );
    this.tts = new TextToSpeech(
      this.config.ttsProvider,
      process.env.ELEVENLABS_API_KEY || process.env.AZURE_SPEECH_KEY || process.env.GOOGLE_SPEECH_KEY,
      this.config.ttsVoice
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.wakeWordDetector.on('wakeWord', () => {
      this.startListening();
    });

    this.vad.on('speechEnd', () => {
      this.processAudio();
    });
  }

  async initialize(): Promise<void> {
    await this.wakeWordDetector.initialize();
    await this.stt.initialize();
  }

  startWakeWordDetection(): void {
    this.wakeWordDetector.start();
    this.state = 'idle';
    this.emit('stateChange', 'idle');
  }

  stopWakeWordDetection(): void {
    this.wakeWordDetector.stop();
  }

  startListening(): void {
    this.state = 'listening';
    this.audioBuffer = [];
    this.emit('stateChange', 'listening');
    this.emit('listening');
  }

  async processAudio(): Promise<void> {
    if (this.audioBuffer.length === 0) return;

    this.state = 'processing';
    this.emit('stateChange', 'processing');

    // Combine audio buffers
    const totalLength = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of this.audioBuffer) {
      combined.set(buf, offset);
      offset += buf.length;
    }

    // Convert to buffer for transcription
    const buffer = Buffer.from(combined.buffer);

    try {
      const result = await this.stt.transcribe(buffer);
      this.emit('transcription', result);
      
      // Return to idle after processing
      this.state = 'idle';
      this.emit('stateChange', 'idle');
    } catch (error) {
      this.emit('error', error);
      this.state = 'idle';
      this.emit('stateChange', 'idle');
    }
  }

  async speak(text: string): Promise<void> {
    this.state = 'speaking';
    this.emit('stateChange', 'speaking');

    try {
      const audio = await this.tts.synthesize(text);
      this.emit('speech', audio);
      
      // Would play the audio here
      // await playAudio(audio);
      
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.state = 'idle';
      this.emit('stateChange', 'idle');
    }
  }

  getState(): string {
    return this.state;
  }

  /**
   * Trigger wake word manually (for testing)
   */
  triggerWakeWord(): void {
    this.wakeWordDetector.trigger();
  }

  /**
   * Enter continuous conversation mode (Talk Mode)
   */
  enterConversationMode(): void {
    this.conversationMode = true;
    this.emit('conversationModeChange', true);
    this.resetConversationTimeout();
    console.log('[VoiceSession] Entered conversation mode');
  }

  /**
   * Exit conversation mode
   */
  exitConversationMode(): void {
    this.conversationMode = false;
    if (this.conversationTimeout) {
      clearTimeout(this.conversationTimeout);
      this.conversationTimeout = null;
    }
    this.emit('conversationModeChange', false);
    console.log('[VoiceSession] Exited conversation mode');
  }

  /**
   * Reset conversation timeout
   */
  private resetConversationTimeout(): void {
    if (this.conversationTimeout) {
      clearTimeout(this.conversationTimeout);
    }
    this.conversationTimeout = setTimeout(() => {
      this.exitConversationMode();
    }, this.conversationTimeoutMs);
  }

  /**
   * Check if in conversation mode
   */
  isInConversationMode(): boolean {
    return this.conversationMode;
  }

  /**
   * Process text input and speak response
   */
  async processAndSpeak(text: string, responseHandler: (text: string) => Promise<string>): Promise<void> {
    try {
      this.state = 'processing';
      this.emit('stateChange', 'processing');

      // Get response from handler
      const response = await responseHandler(text);
      
      // Speak the response
      await this.speak(response);

      // Reset conversation timeout if in conversation mode
      if (this.conversationMode) {
        this.resetConversationTimeout();
        this.startListening();
      }
    } catch (error) {
      this.emit('error', error);
      this.state = 'idle';
      this.emit('stateChange', 'idle');
    }
  }

  /**
   * Get voice system configuration
   */
  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Apply updates to components
    if (updates.wakeWord) {
      this.wakeWordDetector = new WakeWordDetector(
        updates.wakeWord,
        this.config.wakeWordSensitivity
      );
    }
    if (updates.vadThreshold) {
      this.vad = new VAD(updates.vadThreshold, this.config.sampleRate);
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Array<{ id: string; name: string; language?: string }>> {
    return this.tts.getVoices();
  }

  /**
   * Set TTS voice
   */
  setVoice(voiceId: string): void {
    this.config.ttsVoice = voiceId;
    this.tts = new TextToSpeech(
      this.config.ttsProvider,
      process.env.ELEVENLABS_API_KEY || process.env.AZURE_SPEECH_KEY,
      voiceId
    );
  }
}

// Singleton
let voiceSessionInstance: VoiceSession | null = null;

export function getVoiceSession(config?: Partial<VoiceConfig>): VoiceSession {
  if (!voiceSessionInstance) {
    voiceSessionInstance = new VoiceSession(config);
  }
  return voiceSessionInstance;
}

export async function initializeVoiceSystem(config?: Partial<VoiceConfig>): Promise<VoiceSession> {
  const session = getVoiceSession(config);
  await session.initialize();
  return session;
}

export default VoiceSession;
