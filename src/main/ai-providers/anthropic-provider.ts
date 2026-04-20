/**
 * Anthropic Provider - Claude models
 */

import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
import axios from 'axios';
import { Readable } from 'stream';

interface AnthropicFormattedMessages {
  systemMessage: string;
  userMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class AnthropicProvider extends BaseProvider {
  private apiVersion: string = '2023-06-01';

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.name = 'anthropic';
    this.displayName = 'Anthropic (Claude)';
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey || '',
      'anthropic-version': this.apiVersion
    };
  }

  async getModels(): Promise<ModelInfo[]> {
    // Anthropic doesn't have a models endpoint, return known models
    // Current lineup: Opus 4.7 / Opus 4.6 / Sonnet 4.6 / Haiku 4.5 plus older still-supported models
    return [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7 (Flagship)', provider: 'anthropic', contextLength: 1000000 },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', contextLength: 1000000 },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Best Default)', provider: 'anthropic', contextLength: 1000000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Fastest)', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Alias)', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 (Frontier)', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (Legacy)', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast)', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku Latest', provider: 'anthropic', contextLength: 200000 }
    ];
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      // Send a minimal request to test the key
      await axios.post(`${this.baseUrl}/v1/messages`, {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      }, {
        headers: this.getHeaders(),
        timeout: 10000
      });

      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) {
        return { success: false, error: 'Invalid API key' };
      }
      return { success: false, error: e.message };
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const model = (options.model || this.config.model || 'claude-sonnet-4-6') as string;
    const { systemMessage, userMessages } = this.formatMessages(messages);

    // Ensure messages array is valid for Anthropic API
    if (userMessages.length === 0) {
      console.error('[Anthropic] No user messages to send');
      return { success: false, error: 'No user messages provided' };
    }

    // Anthropic requires first message to be from user
    if (userMessages[0].role !== 'user') {
      console.warn('[Anthropic] First message must be from user, adjusting...');
      userMessages.unshift({ role: 'user', content: 'Continue with the task.' });
    }

    // Merge consecutive messages of same role (Anthropic doesn't allow them)
    // Also ensure no empty messages slip through
    const mergedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of userMessages) {
      // Skip empty messages
      if (!msg.content || msg.content.trim() === '') {
        console.warn(`[Anthropic] Skipping empty ${msg.role} message during merge`);
        continue;
      }
      
      if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
        mergedMessages[mergedMessages.length - 1].content += '\n\n' + msg.content;
      } else {
        mergedMessages.push({ ...msg });
      }
    }

    // Final validation - ensure no empty content
    if (mergedMessages.some(m => !m.content || m.content.trim() === '')) {
      console.error('[Anthropic] Found empty content in messages after merge');
      return { success: false, error: 'Message content cannot be empty' };
    }

    // Ensure we still have valid messages after filtering
    if (mergedMessages.length === 0) {
      console.error('[Anthropic] No valid messages after filtering');
      return { success: false, error: 'No valid messages to send' };
    }

    console.log(`[Anthropic] Sending ${mergedMessages.length} messages to ${model}`);

    try {
      // Claude models can output much more - use model-specific limits
      // You're paying for premium models, let's use their full power!
      let maxTokens = options.maxTokens;
      if (!maxTokens) {
        // Sonnet 4 and Opus 4 / 4.5 / 4.6 - premium models, use maximum output capacity
        if (model.includes('sonnet-4') || model.includes('opus-4')) {
          maxTokens = 16384; // 16k tokens output - let it generate full projects!
        } else if (model.includes('sonnet') || model.includes('opus')) {
          maxTokens = 16384; // Premium models get full power
        } else {
          // Haiku models - still good but more limited
          maxTokens = 8192;
        }
      }
      
      const response = await axios.post(`${this.baseUrl}/v1/messages`, {
        model,
        max_tokens: maxTokens,
        system: systemMessage || undefined,
        messages: mergedMessages,
        temperature: options.temperature ?? 0.7
      }, {
        headers: this.getHeaders(),
        timeout: 300000
      });

      const content = response.data?.content?.[0]?.text || '';

      if (!content) {
        console.warn('[Anthropic] Received empty content from API');
      }

      return {
        success: true,
        content,
        usage: {
          promptTokens: response.data?.usage?.input_tokens,
          completionTokens: response.data?.usage?.output_tokens
        }
      };
    } catch (e: any) {
      const errorMsg = e.response?.data?.error?.message || e.message;
      console.error(`[Anthropic] API Error: ${errorMsg}`);
      console.error(`[Anthropic] Status: ${e.response?.status}, Model: ${model}`);
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  async stream(messages: ChatMessage[], onChunk: StreamCallback, options: ChatOptions = {}): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key not configured')
    }

    const model = (options.model || this.config.model || 'claude-sonnet-4-6') as string;
    const { systemMessage, userMessages } = this.formatMessages(messages);

    // Claude models can output much more - use model-specific limits
    // You're paying for premium models, let's use their full power!
    let maxTokens = options.maxTokens;
    if (!maxTokens) {
      // Sonnet 4 and Opus 4 / 4.5 / 4.6 - premium models, use maximum output capacity
      if (model.includes('sonnet-4') || model.includes('opus-4')) {
        maxTokens = 16384; // 16k tokens output - let it generate full projects!
      } else if (model.includes('sonnet') || model.includes('opus')) {
        maxTokens = 16384; // Premium models get full power
      } else {
        // Haiku models - still good but more limited
        maxTokens = 8192;
      }
    }

    try {
      const response = await axios.post(`${this.baseUrl}/v1/messages`, {
        model,
        max_tokens: maxTokens,
        system: systemMessage,
        messages: userMessages,
        temperature: options.temperature ?? 0.7,
        stream: true
      }, {
        headers: this.getHeaders(),
        timeout: 300000,
        responseType: 'stream'
      });

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta') {
                  const text = data.delta?.text || '';
                  onChunk({
                    content: text,
                    done: false
                  });
                } else if (data.type === 'message_stop') {
                  onChunk({ content: '', done: true });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        });

        (response.data as Readable).on('end', () => {
          resolve();
        });

        (response.data as Readable).on('error', reject);
      });
    } catch (e: any) {
      throw new Error(e.response?.data?.error?.message || e.message);
    }
  }

  formatMessages(messages: ChatMessage[]): AnthropicFormattedMessages {
    let systemMessage = '';
    const userMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage += (systemMessage ? '\n' : '') + msg.content;
      } else {
        // Skip messages with empty content (Anthropic requires non-empty content)
        const content = msg.content?.trim();
        if (!content) {
          console.warn(`[Anthropic] Skipping empty ${msg.role} message`);
          continue;
        }
        userMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content
        });
      }
    }

    return { systemMessage, userMessages };
  }

  /**
   * Analyze an image using Claude's vision capabilities
   * @param imageBase64 Base64 encoded image data (without data: prefix)
   * @param prompt The analysis prompt/question
   * @param options Additional options
   */
  async analyzeImage(
    imageBase64: string,
    prompt: string,
    options: {
      mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      model?: string;
      maxTokens?: number;
      systemPrompt?: string;
    } = {}
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const model = options.model || this.config.model || 'claude-sonnet-4-6';
    const mediaType = options.mediaType || 'image/png';
    const maxTokens = options.maxTokens || 4096;

    // Clean base64 if it has data: prefix
    const cleanBase64 = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    try {
      const messageContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: cleanBase64
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ];

      const requestBody: any = {
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ]
      };

      if (options.systemPrompt) {
        requestBody.system = options.systemPrompt;
      }

      const response = await axios.post(`${this.baseUrl}/v1/messages`, requestBody, {
        headers: this.getHeaders(),
        timeout: 120000 // 2 minute timeout for vision
      });

      const content = response.data?.content?.[0]?.text || '';
      return { success: true, content };
    } catch (e: any) {
      const errorMsg = e.response?.data?.error?.message || e.message;
      console.error(`[Anthropic Vision] Error: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Find UI elements on screen using Claude's vision
   * Returns structured data about element locations
   */
  async findUIElements(
    imageBase64: string,
    description: string,
    options: { mediaType?: 'image/png' | 'image/jpeg' } = {}
  ): Promise<{ 
    success: boolean; 
    elements?: Array<{
      type: string;
      text?: string;
      description: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      confidence: number;
    }>; 
    error?: string 
  }> {
    const systemPrompt = `You are an AI vision assistant specialized in finding UI elements on screen.
When analyzing screenshots, identify the requested UI element and provide its location.

CRITICAL: Always respond with valid JSON in this exact format:
{
  "found": true/false,
  "elements": [
    {
      "type": "button" | "input" | "text" | "link" | "checkbox" | "dropdown" | "icon" | "image",
      "text": "visible text on element",
      "description": "what this element does",
      "x": center_x_coordinate,
      "y": center_y_coordinate,
      "width": approximate_width,
      "height": approximate_height,
      "confidence": 0.0-1.0
    }
  ],
  "reason": "why you found or didn't find the element"
}

Use the image dimensions provided and estimate pixel coordinates based on the element's position.
Center X and Y should be the CENTER of the element for clicking purposes.`;

    const prompt = `Find this UI element on the screen: "${description}"

Analyze the screenshot and locate the element. Provide exact pixel coordinates for the center of the element.
If you cannot find the exact element, provide the closest match with lower confidence.
If there are multiple matches, include all of them.

Respond ONLY with the JSON object, no additional text.`;

    const result = await this.analyzeImage(imageBase64, prompt, {
      systemPrompt,
      mediaType: options.mediaType || 'image/png',
      maxTokens: 1024
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    try {
      // Parse the JSON response
      const content = result.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false, error: 'No JSON found in response' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.found || !parsed.elements || parsed.elements.length === 0) {
        return { success: true, elements: [], error: parsed.reason };
      }

      return { success: true, elements: parsed.elements };
    } catch (parseError: any) {
      console.error('[Anthropic Vision] Failed to parse response:', parseError);
      return { success: false, error: `Failed to parse response: ${parseError.message}` };
    }
  }

  /**
   * Make an AI decision based on screen content
   */
  async makeScreenDecision(
    imageBase64: string,
    question: string,
    options?: string[]
  ): Promise<{ 
    success: boolean; 
    decision?: string;
    reasoning?: string;
    confidence?: number;
    error?: string 
  }> {
    const systemPrompt = `You are an AI assistant making decisions based on what you see on screen.
Analyze the screenshot and answer the question provided.

Respond with valid JSON:
{
  "decision": "your decision or answer",
  "reasoning": "brief explanation of why",
  "confidence": 0.0-1.0
}`;

    let prompt = `Based on this screenshot, ${question}`;
    if (options && options.length > 0) {
      prompt += `\n\nChoose from these options:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    }

    const result = await this.analyzeImage(imageBase64, prompt, {
      systemPrompt,
      maxTokens: 512
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    try {
      const content = result.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Try to extract a simple answer
        return { success: true, decision: content.trim(), confidence: 0.5 };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        decision: parsed.decision,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence || 0.8
      };
    } catch (parseError) {
      return { success: true, decision: result.content?.trim(), confidence: 0.5 };
    }
  }
}
