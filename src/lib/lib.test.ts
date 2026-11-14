import { describe, expect, it } from "vitest";
import { addDaysToDateStr, endOfDayLisbon, lisbonDateInput, slugify } from "./format";
import { novoNegocioSchema, loginSchema } from "./schemas";

describe("endOfDayLisbon (pago até = 23:59:59 em Lisboa)", () => {
  it("inverno (UTC+0)", () => expect(endOfDayLisbon("2026-01-15")).toBe("2026-01-15T23:59:59.000Z"));
  it("verão (UTC+1)", () => expect(endOfDayLisbon("2026-07-15")).toBe("2026-07-15T22:59:59.000Z"));
  it("dia da mudança para verão (29/03/2026)", () => expect(endOfDayLisbon("2026-03-29")).toBe("2026-03-29T22:59:59.000Z"));
  it("dia da mudança para inverno (25/10/2026)", () => expect(endOfDayLisbon("2026-10-25")).toBe("2026-10-25T23:59:59.000Z"));
  it("ida e volta mantém o dia de Lisboa", () => {
    for (const d of ["2026-01-01", "2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-12-31"]) {
      expect(lisbonDateInput(endOfDayLisbon(d))).toBe(d);
    }
  });
});

describe("addDaysToDateStr", () => {
  it("soma dias atravessando meses e anos", () => {
    expect(addDaysToDateStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateStr("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("slugify", () => {
  it("remove acentos e símbolos", () => expect(slugify("Estúdio da Ana & Filhos!")).toBe("estudio-da-ana-filhos"));
  it("respeita o máximo de 40 sem hífen final", () => {
    const s = slugify("a".repeat(39) + " bbb");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
  it("vazio fica vazio", () => expect(slugify("  !!  ")).toBe(""));
});

describe("novoNegocioSchema", () => {
  const ok = { nome: "Studio Ana", slug: "studio-ana", contacto: "", pagoAte: "2026-12-01", email: "Ana@Exemplo.pt" };
  it("aceita dados válidos e normaliza o e-mail", () => {
    const r = novoNegocioSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ana@exemplo.pt");
  });
  it.each([["ab"], ["Studio Ana"], ["-ana"], ["ana-"], ["ana--b"], ["a_b_c"]])("rejeita slug %s", (slug) => {
    expect(novoNegocioSchema.safeParse({ ...ok, slug }).success).toBe(false);
  });
  it("rejeita e-mail inválido e data vazia", () => {
    expect(novoNegocioSchema.safeParse({ ...ok, email: "ana@" }).success).toBe(false);
    expect(novoNegocioSchema.safeParse({ ...ok, pagoAte: "" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("exige palavra-passe", () => expect(loginSchema.safeParse({ email: "a@b.pt", password: "" }).success).toBe(false));
});

describe("mensagens de erro em português (zod)", () => {
  const msg = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, campo: string) => r.error?.issues.find((i) => i.path[0] === campo)?.message;
  const base = { nome: "Studio Ana", slug: "studio-ana", contacto: "", pagoAte: "2026-12-01", email: "ana@exemplo.pt" };
  it("nome curto", () => expect(msg(novoNegocioSchema.safeParse({ ...base, nome: "A" }), "nome")).toBe("O nome precisa de pelo menos 2 letras."));
  it("slug inválido", () => expect(msg(novoNegocioSchema.safeParse({ ...base, slug: "Studio Ana" }), "slug")).toBe("Use só letras minúsculas, números e hífenes (ex.: studio-ana)."));
  it("slug curto", () => expect(msg(novoNegocioSchema.safeParse({ ...base, slug: "ab" }), "slug")).toBe("O endereço precisa de pelo menos 3 caracteres."));
  it("e-mail inválido", () => expect(msg(novoNegocioSchema.safeParse({ ...base, email: "ana@" }), "email")).toBe("Escreva um e-mail válido."));
  it("data em falta", () => expect(msg(novoNegocioSchema.safeParse({ ...base, pagoAte: "" }), "pagoAte")).toBe("Escolha uma data."));
  it("login: e-mail e palavra-passe", () => {
    expect(msg(loginSchema.safeParse({ email: "x", password: "a" }), "email")).toBe("Escreva um e-mail válido.");
    expect(msg(loginSchema.safeParse({ email: "a@b.pt", password: "" }), "password")).toBe("Escreva a palavra-passe.");
  });
  it("normaliza o e-mail (minúsculas, sem espaços)", () => {
    const r = novoNegocioSchema.safeParse({ ...base, email: "  ANA@Exemplo.PT " });
    expect(r.success && r.data.email).toBe("ana@exemplo.pt");
  });
});

import { fmtDuracao } from "./format";
describe("fmtDuracao", () => {
  it.each([[5, "5 min"], [45, "45 min"], [60, "1 h"], [90, "1 h 30 min"], [120, "2 h"], [150, "2 h 30 min"], [240, "4 h"], [720, "12 h"]])("%i → %s", (m, t) => expect(fmtDuracao(m)).toBe(t));
});
