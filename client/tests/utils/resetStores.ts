// v0.6.2 — 旧版 resetClientStores 已迁移到 src/utils/resetStores.ts (resetAllStores).
// 这里做 re-export 保持向后兼容, 不修改所有现存测试的 import 路径.
export { resetAllStores as resetClientStores } from '../../src/utils/resetStores';
