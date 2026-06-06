/**
 * EmbeddingProvider 默认实现 — 基于字符 n-gram 哈希的确定性向量
 *
 * 仅用于 PR-3 本地化自包含的检索.
 * 生产应替换为 LLM embedding 端点 (text-embedding-3-small) 或
 * transformers.js 本地模型 (all-MiniLM-L6-v2).
 *
 * 设计要点:
 * - 确定性: 相同输入永远产生相同向量 (便于测试)
 * - 内容感知: 字符级 n-gram (3-gram) 落入固定维度, 语义相近的文本余弦相似度更高
 * - 零依赖: 纯 JS, 无需 wasm/网络
 */
import type { EmbeddingProvider } from '../../types/memory';

const NGRAM = 2;
const DEFAULT_DIM = 256;

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly dim: number;

  constructor(dim: number = DEFAULT_DIM) {
    this.dim = dim;
  }

  /** 同步版本 (避免在 prompt builder 同步方法中 await) */
  embedSync(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0);
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) return vec;
    for (let i = 0; i <= normalized.length - NGRAM; i++) {
      const ngram = normalized.substring(i, i + NGRAM);
      const idx = fnv1a(ngram) % this.dim;
      vec[idx] += 1;
    }
    return normalize(vec);
  }

  /** 同步批量 */
  embedBatchSync(texts: string[]): number[][] {
    return texts.map((t) => this.embedSync(t));
  }

  async embed(text: string): Promise<number[]> {
    return this.embedSync(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.embedBatchSync(texts);
  }
}

/** 余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
