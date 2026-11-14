import { describe, expect, it } from "vitest";
import { contrastWithWhite, eurosInput, fmtTime, lisbonToIso, mondayOf, normalizePhone, parseEuros, startOfDayLisbon, weekdayOf } from "./format";
import { validarSemana } from "../components/owner/Equipa";
import { avisoIndisponivel } from "../components/owner/OwnerApp";
import { validarPasse } from "../components/owner/SenhaObrigatoria";

describe("lisbonToIso (hora de Lisboa → instante)", () => {
  it("inverno e verão", () => {
    expect(lisbonToIso("2026-01-15", "10:00")).toBe("2026-01-15T10:00:00.000Z");
    expect(lisbonToIso("2026-07-15", "10:00")).toBe("2026-07-15T09:00:00.000Z");
  });
  it("dia da mudança para verão: 00:00 ainda é UTC+0, 12:00 já é UTC+1", () => {
    expect(startOfDayLisbon("2026-03-29")).toBe("2026-03-29T00:00:00.000Z");
    expect(lisbonToIso("2026-03-29", "12:00")).toBe("2026-03-29T11:00:00.000Z");
  });
  it("dia da mudança para inverno: 00:00 é UTC+1, 12:00 é UTC+0", () => {
    expect(startOfDayLisbon("2026-10-25")).toBe("2026-10-24T23:00:00.000Z");
    expect(lisbonToIso("2026-10-25", "12:00")).toBe("2026-10-25T12:00:00.000Z");
  });
  it("um dia de mudança de hora tem 23 ou 25 horas", () => {
    const h = (d: string, e: string) => (Date.parse(startOfDayLisbon(e)) - Date.parse(startOfDayLisbon(d))) / 3600000;
    expect(h("2026-03-29", "2026-03-30")).toBe(23);
    expect(h("2026-10-25", "2026-10-26")).toBe(25);
  });
  it("fmtTime volta a dar a hora de Lisboa", () => {
    expect(fmtTime(lisbonToIso("2026-07-15", "17:45"))).toBe("17:45");
    expect(fmtTime(lisbonToIso("2026-12-01", "08:05"))).toBe("08:05");
  });
});

describe("semana", () => {
  it("segunda-feira da semana (domingo pertence à semana anterior)", () => {
    expect(weekdayOf("2026-11-08")).toBe(0);
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-12")).toBe("2026-11-09");
  });
});

describe("telefone (igual ao banco)", () => {
  it.each([["912 345 678", "+351912345678"], ["+351 912 345 678", "+351912345678"], ["00351912345678", "+351912345678"], ["212345678", "+351212345678"], ["+44 7911 123456", "+447911123456"]])("%s", (i, o) => expect(normalizePhone(i)).toBe(o));
  it.each([["812345678"], ["91234567"], ["abc"], ["+351812345678"], [""]])("rejeita %s", (i) => expect(normalizePhone(i)).toBeNull());
});

describe("euros", () => {
  it("converte para cêntimos", () => {
    expect(parseEuros("12,50")).toBe(1250); expect(parseEuros("12.5")).toBe(1250); expect(parseEuros("0")).toBe(0); expect(parseEuros("19,99")).toBe(1999);
  });
  it("rejeita lixo", () => { for (const x of ["", "abc", "-5", "1,234", "1 000"]) expect(parseEuros(x)).toBeNull(); });
  it("mostra com vírgula", () => expect(eurosInput(1250)).toBe("12,50"));
});

describe("contraste com branco", () => {
  it("preto ≈ 21, branco ≈ 1", () => { expect(contrastWithWhite("#000000")).toBeGreaterThan(20); expect(contrastWithWhite("#ffffff")).toBeCloseTo(1, 1); });
  it("cor escura é boa, cor clara é fraca", () => { expect(contrastWithWhite("#2f5d50")).toBeGreaterThan(4.5); expect(contrastWithWhite("#f9c5d1")).toBeLessThan(3); });
});

describe("validarSemana (horário com pausas)", () => {
  const ok = { 1: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }] };
  it("aceita pausa como dois intervalos", () => expect(validarSemana(ok)).toBeNull());
  it("aceita intervalos encostados", () => expect(validarSemana({ 2: [{ start: "09:00", end: "13:00" }, { start: "13:00", end: "18:00" }] })).toBeNull());
  it("rejeita fim antes do início", () => expect(validarSemana({ 3: [{ start: "18:00", end: "09:00" }] })).toMatch(/Quarta/));
  it("rejeita sobreposição", () => expect(validarSemana({ 5: [{ start: "09:00", end: "14:00" }, { start: "13:00", end: "18:00" }] })).toMatch(/Sexta/));
  it("rejeita hora vazia", () => expect(validarSemana({ 6: [{ start: "", end: "18:00" }] })).toMatch(/Sábado/));
  it("dia sem intervalos é folga", () => expect(validarSemana({})).toBeNull());
});

describe("aviso de negócio indisponível", () => {
  const agora = new Date("2026-11-08T12:00:00Z");
  it("ativo e pago → sem aviso", () => expect(avisoIndisponivel({ status: "ativo", paid_until: "2026-12-01T00:00:00Z" }, agora)).toBeNull());
  it("bloqueado", () => expect(avisoIndisponivel({ status: "bloqueado", paid_until: "2026-12-01T00:00:00Z" }, agora)).toMatch(/bloqueado/));
  it("pago até vencido", () => expect(avisoIndisponivel({ status: "ativo", paid_until: "2026-11-01T00:00:00Z" }, agora)).toMatch(/terminou/));
  it("pago até vazio conta como indisponível", () => expect(avisoIndisponivel({ status: "ativo", paid_until: null }, agora)).toMatch(/data de pagamento/));
});

describe("validarPasse", () => {
  it("curta, diferente e boa", () => {
    expect(validarPasse("curta", "curta")).toMatch(/pelo menos/);
    expect(validarPasse("umapasse1234", "outra1234567")).toMatch(/não são iguais/);
    expect(validarPasse("umapasse1234", "umapasse1234")).toBeNull();
  });
});

import { MENSAGEM_WHATSAPP_PADRAO, montarMensagemWhatsApp } from "./mensagem";
describe("mensagem pronta do WhatsApp", () => {
  const v = { nome: "Maria", servico: "Corte", dia: "terça-feira, 10 de novembro", hora: "15:00" };
  it("sem modelo usa o texto por defeito", () => expect(montarMensagemWhatsApp(null, v)).toBe("Olá! Sou Maria e marquei Corte para terça-feira, 10 de novembro, às 15:00. Confirmo a marcação."));
  it("modelo vazio ou só espaços também", () => { expect(montarMensagemWhatsApp("", v)).toBe(montarMensagemWhatsApp(MENSAGEM_WHATSAPP_PADRAO, v)); expect(montarMensagemWhatsApp("   ", v)).toBe(montarMensagemWhatsApp(null, v)); });
  it("substitui as variáveis, mesmo repetidas e em maiúsculas", () => expect(montarMensagemWhatsApp("Oi, {NOME}! {servico} às {hora}. Até já, {nome}.", v)).toBe("Oi, Maria! Corte às 15:00. Até já, Maria."));
  it("aceita {serviço} com acento", () => expect(montarMensagemWhatsApp("{serviço}", v)).toBe("Corte"));
  it("variáveis desconhecidas ficam como estão", () => expect(montarMensagemWhatsApp("Olá {xpto} {nome}", v)).toBe("Olá {xpto} Maria"));
  it("o nome da cliente não é interpretado como variável", () => expect(montarMensagemWhatsApp("Olá {nome}", { ...v, nome: "{hora}" })).toBe("Olá {hora}"));
});

import { aplicarHorario } from "../components/owner/Equipa";
describe("definir horário rapidamente", () => {
  const antes = { 1: [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "17:00" }], 6: [{ start: "09:00", end: "13:00" }] };
  it("substitui só os dias indicados", () => {
    const r = aplicarHorario(antes, [1, 2, 3, 4, 5], "09:00", "18:00");
    expect(r[1]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(r[5]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(r[6]).toEqual(antes[6]);
    expect(r[0]).toBeUndefined();
  });
  it("não altera o objeto original", () => { aplicarHorario(antes, [1], "08:00", "12:00"); expect(antes[1]).toHaveLength(2); });
  it("o resultado é um horário válido", () => { expect(validarSemana(aplicarHorario({}, [0, 1, 2, 3, 4, 5, 6], "09:00", "18:00"))).toBeNull(); });
});
