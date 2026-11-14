import { z } from "zod";

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const novoNegocioSchema = z.object({
  nome: z.string().trim().min(2, "O nome precisa de pelo menos 2 letras.").max(80, "O nome pode ter no máximo 80 letras."),
  slug: z.string().trim().toLowerCase()
    .min(3, "O endereço precisa de pelo menos 3 caracteres.")
    .max(40, "O endereço pode ter no máximo 40 caracteres.")
    .regex(SLUG_RE, "Use só letras minúsculas, números e hífenes (ex.: studio-ana)."),
  contacto: z.string().trim().max(120, "O contacto pode ter no máximo 120 caracteres.").optional(),
  pagoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data."),
  email: z.string().trim().toLowerCase().email("Escreva um e-mail válido.").max(254),
});

export type NovoNegocio = z.infer<typeof novoNegocioSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escreva um e-mail válido."),
  password: z.string().min(1, "Escreva a palavra-passe."),
});
