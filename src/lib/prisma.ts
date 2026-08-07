import { PrismaClient } from "@/generated/prisma";

// Standard Next.js dev-mode singleton: avoids exhausting DB connections
// from a new PrismaClient being created on every hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
