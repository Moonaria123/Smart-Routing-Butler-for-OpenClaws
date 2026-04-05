// Provider 适配器接口——统一所有 API 类型的请求/响应格式

export interface ProviderRequestParams {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  stream: boolean;
  signal: AbortSignal;
}

export interface ProviderImageRequestParams {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}

export interface ProviderAdapter {
  sendRequest(params: ProviderRequestParams): Promise<Response>;
  sendImageRequest?(params: ProviderImageRequestParams): Promise<Response>;
}
