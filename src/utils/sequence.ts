import { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

let movementNonce = 0;

export async function nextMovementNumber(db: DbClient): Promise<string> {
  const count = await db.stockMovement.count();
  movementNonce = (movementNonce + 1) % 1000;
  const seq = String(count + 1).padStart(5, '0');
  const suffix = String(movementNonce).padStart(3, '0');
  return `MOV-${seq}-${suffix}`;
}

export async function nextSequentialCode(
  prefix: string,
  countFn: () => Promise<number>,
  pad = 4,
): Promise<string> {
  const count = await countFn();
  return `${prefix}${String(count + 1).padStart(pad, '0')}`;
}
