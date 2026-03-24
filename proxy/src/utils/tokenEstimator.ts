// Token 估算——禁止引入 tiktoken，使用字符数 / 4 的简单公式

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(
  messages: { role: string; content: string }[]
): number {
  const totalChars = messages.reduce(
    (sum, m) => sum + m.role.length + m.content.length + 4,
    0
  );
  return Math.ceil(totalChars / 4);
}
