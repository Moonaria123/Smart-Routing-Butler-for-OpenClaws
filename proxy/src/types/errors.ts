// 上游 Provider 调用错误类型——供熔断器与路由层分类 HTTP 状态码

/** 上游调用错误——携带原始 HTTP 状态码供熔断器正确分类 */
export class UpstreamCallError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "UpstreamCallError";
  }
}
