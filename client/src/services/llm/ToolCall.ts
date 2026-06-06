/**
 * v0.4 战斗系统补齐 — 结构化 toolcall 类型定义
 *
 * v0.3 PM Engine 走 narrative JSON 解析 (parseNarrativeResponse) 把整个 LLM 输出
 * 解析成一个 NarrativeResponse. 没有结构化 toolcall 协议.
 *
 * v0.4 在不破 v0.3 协议的前提下, 增加 toolcall 子协议:
 * LLM 可在 narrative 中嵌入 <tool_call>{...}</tool_call> 块, 客户端解析后路由到本地 handler.
 *
 * 协议:
 *  <tool_call>{"name": "<tool_name>", "arguments": { ... }}</tool_call>
 *
 * 客户端行为:
 * - toolcallParser 从原始 LLM 输出中识别并提取所有 toolcall 块
 * - 剩余文本走原有 parseNarrativeResponse
 * - 提取的 toolcall 由 ToolCallRegistry.dispatch() 串行执行
 * - 不识别的 toolcall 走 warn + 跳过, 不阻断 narrative
 */

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallDispatchResult {
  toolCall: ToolCall;
  /** handler 是否成功执行 */
  ok: boolean;
  /** handler 返回值, 透传给调用方 */
  result?: unknown;
  /** 错误信息 (handler 抛错或返回 { ok: false }) */
  error?: string;
}

/**
 * ToolCall handler 签名.
 * - arguments: toolcall.arguments (LLM 给出, handler 需做 schema 校验)
 * - context: 共享上下文 (战斗状态、character、narrative 引用等)
 * - 返回: 任意值, 由调用方处理; 抛错时 Registry 捕获并记 ok=false
 */
export type ToolCallHandler<TArgs = unknown, TContext = unknown, TResult = unknown> = (
  arguments_: TArgs,
  context: TContext,
) => TResult | Promise<TResult>;

/**
 * toolcall 解析后的拆分结果.
 * narrative 是去掉 toolcall 块后的剩余文本; toolCalls 是按出现顺序提取的结构化调用.
 */
export interface ParsedToolCallOutput {
  narrative: string;
  toolCalls: ToolCall[];
  /** 解析过程中遇到的损坏块, 仅供 warn 日志 */
  parseWarnings: string[];
}
