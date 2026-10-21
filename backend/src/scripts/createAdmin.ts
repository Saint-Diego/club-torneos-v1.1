import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '../config/db';
import { User } from '../models/User';

const input = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_NAME: z.string().trim().min(2).default('Administrador'),
  ADMIN_PASSWORD: z.string().min(12, 'Debe tener al menos 12 caracteres'),
});

async function main(): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = input.parse(process.env);
  await connectDB();

  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(
      existing.role === 'Admin'
        ? `[admin] ${email} ya existe como Admin: no se hicieron cambios.`
        : `[admin] ${email} ya existe con rol ${existing.role}: no se modificó.`,
    );
    return;
  }

  await User.create({ name: ADMIN_NAME, email, password: ADMIN_PASSWORD, role: 'Admin' });
  console.log(`[admin] Administrador ${email} creado.`);
}

main()
  .catch((error: unknown) => {
    console.error('[admin] no se pudo crear el administrador:', error instanceof z.ZodError ? error.flatten().fieldErrors : error);
    process.exitCode = 1;
  })
  .finally(() => void mongoose.disconnect());
