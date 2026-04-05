// 基于已知模型名模式推断 features 提示（V2-11 + V5 连通）
// 仅作提示，不强制；用于上游模型导入时自动勾选建议的 features

/** 返回建议的 features 数组（仅提示，不强制） */
export function inferFeatureHints(modelId: string): string[] {
  const id = modelId.toLowerCase();
  const hints: string[] = [];

  // Vision: gpt-4o, gpt-4-turbo, claude-3-*, gemini-*
  if (/gpt-4o|gpt-4-turbo|claude-3|gemini/.test(id)) hints.push("vision");

  // Image generation: dall-e-*, flux, stable-diffusion, playground, sdxl
  if (/dall-e|flux|stable-diffusion|playground-v|sdxl/.test(id))
    hints.push("image-generation");

  // Audio: whisper, tts, audio
  if (/whisper|tts|audio/.test(id)) hints.push("audio");

  return hints;
}

/** 根据已知模型名推断 supportsThinking */
export function inferThinkingHint(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return /\bo[13]-|deepseek-r1|deepseek-reasoner|qwq/.test(id);
}
