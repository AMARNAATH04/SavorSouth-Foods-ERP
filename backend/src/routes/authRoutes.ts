import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, signToken } from '../middleware/auth.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError, asyncHandler } from '../utils/errors.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError('Invalid email or password', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
    });

    await recordAuditLog(prisma, {
      userId: user.id,
      userRole: user.role.code,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      entityLabel: user.email,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role.code,
        roleName: user.role.name,
      },
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { role: true },
    });
    if (!user) throw new AppError('User not found', 404);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role.code,
      roleName: user.role.name,
    });
  }),
);

// List demo login accounts for quick selection on Login page (no passwords exposed)
authRouter.get(
  '/demo-accounts',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      users.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role.code,
        roleName: u.role.name,
      })),
    );
  }),
);

// User management (Owner & Factory Admin)
authRouter.get(
  '/users',
  requireAuth,
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        isActive: u.isActive,
        role: u.role.code,
        roleName: u.role.name,
        createdAt: u.createdAt,
      })),
    );
  }),
);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  roleCode: z.nativeEnum(RoleCode),
});

authRouter.post(
  '/users',
  requireAuth,
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const role = await prisma.role.findUnique({ where: { code: data.roleCode } });
    if (!role) throw new AppError('Role not found', 404);

    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(data.password, 10);
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase().trim(),
        passwordHash,
        phone: data.phone,
        roleId: role.id,
      },
      include: { role: true },
    });

    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'CREATE_USER',
      entityType: 'User',
      entityId: created.id,
      entityLabel: created.email,
      afterState: { name: created.name, role: created.role.code },
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      isActive: created.isActive,
      role: created.role.code,
      roleName: created.role.name,
    });
  }),
);

authRouter.patch(
  '/users/:id/status',
  requireAuth,
  requireRoles(RoleCode.OWNER),
  asyncHandler(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const updated = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { isActive },
      include: { role: true },
    });

    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'TOGGLE_USER_STATUS',
      entityType: 'User',
      entityId: updated.id,
      entityLabel: updated.email,
      afterState: { isActive },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      isActive: updated.isActive,
      role: updated.role.code,
    });
  }),
);
