import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../integrations/ai/ai.service';
import * as crypto from 'crypto';

export interface StallClassification {
  state:
    | 'task_complete'
    | 'waiting_for_input'
    | 'still_working'
    | 'tool_running'
    | 'error';
  confidence: number;
  prompt?: string;
  suggestedResponse?: string;
  reasoning?: string;
}

const CLASSIFY_TIMEOUT_MS = 5_000;
const DEDUP_WINDOW_MS = 10_000;
const CONFIDENCE_THRESHOLD = 0.7;

@Injectable()
export class StallClassifierService {
  private readonly logger = new Logger(StallClassifierService.name);
  private readonly recentHashes = new Map<string, { result: StallClassification; ts: number }>();

  constructor(private readonly aiService: AIService) {}

  get confidenceThreshold(): number {
    return CONFIDENCE_THRESHOLD;
  }

  async classify(
    recentOutput: string,
    stallDurationMs: number,
    context?: { agentType?: string; role?: string },
  ): Promise<StallClassification> {
    const trimmed = recentOutput.slice(-2000);
    const hash = crypto.createHash('md5').update(trimmed).digest('hex');

    // Dedup: return cached result if same output was classified recently
    const cached = this.recentHashes.get(hash);
    if (cached && Date.now() - cached.ts < DEDUP_WINDOW_MS) {
      return cached.result;
    }

    const model = this.aiService.getFastModel();

    const prompt = [
      'Classify the state of a coding agent terminal session based on its recent output.',
      '',
      `Agent type: ${context?.agentType || 'unknown'}`,
      `Agent role: ${context?.role || 'unknown'}`,
      `Stall duration: ${stallDurationMs}ms (no new output for this long)`,
      '',
      '--- RECENT TERMINAL OUTPUT (last 2000 chars) ---',
      trimmed,
      '--- END OUTPUT ---',
      '',
      'Classify the agent state as ONE of:',
      '- task_complete: The agent finished its task and is idle / exited',
      '- waiting_for_input: The agent is blocked waiting for user input (a prompt, confirmation, question)',
      '- still_working: The agent is thinking or processing (just slow, not stalled)',
      '- tool_running: A tool/command is currently executing (build, test, etc.)',
      '- error: The agent encountered an error and stopped',
      '',
      'Respond with ONLY a JSON object:',
      '{"state": "<classification>", "confidence": <0.0-1.0>, "prompt": "<if waiting_for_input, the prompt text>", "suggestedResponse": "<if waiting_for_input, a suggested response>", "reasoning": "<brief reason>"}',
    ].join('\n');

    try {
      const result = await Promise.race([
        this.doClassify(model, prompt),
        this.timeout(CLASSIFY_TIMEOUT_MS),
      ]);

      this.recentHashes.set(hash, { result, ts: Date.now() });
      this.pruneCache();
      return result;
    } catch (error: any) {
      this.logger.warn(`Stall classification failed: ${error?.message}; defaulting to still_working`);
      return { state: 'still_working', confidence: 0.5, reasoning: 'classification_timeout' };
    }
  }

  private async doClassify(model: string, prompt: string): Promise<StallClassification> {
    const response = await this.aiService.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.parseClassification(text);
  }

  private parseClassification(text: string): StallClassification {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const validStates = ['task_complete', 'waiting_for_input', 'still_working', 'tool_running', 'error'];
        if (validStates.includes(parsed.state)) {
          return {
            state: parsed.state,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
            prompt: parsed.prompt || undefined,
            suggestedResponse: parsed.suggestedResponse || undefined,
            reasoning: parsed.reasoning || undefined,
          };
        }
      }
    } catch { /* fall through */ }

    return { state: 'still_working', confidence: 0.3, reasoning: 'parse_failed' };
  }

  private timeout(ms: number): Promise<StallClassification> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('classification_timeout')), ms),
    );
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.recentHashes) {
      if (now - entry.ts > DEDUP_WINDOW_MS) {
        this.recentHashes.delete(key);
      }
    }
  }
}
