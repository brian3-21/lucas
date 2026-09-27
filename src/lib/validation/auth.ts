import { z } from 'zod';

const password = z
	.string()
	.min(8, 'La contraseña debe tener al menos 8 caracteres')
	.max(128, 'La contraseña no puede pasar de 128 caracteres');

export const loginSchema = z.object({
	email: z.email('Introduce un email válido').trim().toLowerCase(),
	password: z.string().min(1, 'Escribe tu contraseña')
});

export const registerSchema = z
	.object({
		name: z.string().trim().min(1, 'Dinos cómo te llamas').max(80),
		email: z.email('Introduce un email válido').trim().toLowerCase(),
		password,
		confirmPassword: z.string()
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Las contraseñas no coinciden',
		path: ['confirmPassword']
	});

export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
