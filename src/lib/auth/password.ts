import "server-only";

// Why: implementation lives in `password-hash.ts` so Prisma seed and other Node scripts can hash without importing `server-only`.
export { hashPassword, verifyPassword } from "./password-hash";
