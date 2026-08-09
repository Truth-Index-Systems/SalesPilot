import "server-only";

// Build 8 compatibility alias only. MR-TI-2 is now the production Truth engine.
export { calculateAndPersistMrTi2Truth as calculateAndPersistMrTi2Shadow } from "./production-hydration";
