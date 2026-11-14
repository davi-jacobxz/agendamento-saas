// Prova que NÃO é possível haver duas marcações no mesmo horário (mesmo com serviços diferentes) contra o Supabase real.
// Uso:  SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e-duplicados
// Cria um negócio de teste e EXCLUI-O no fim.
// ATENÇÃO: usa ~28 pedidos do limite anti-spam de 30/hora por IP. Não o repita em menos de 1 hora.
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } = process.env;
if (!url || !key || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) { console.error("Faltam variáveis de ambiente."); process.exit(2); }

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) falhas++; };
const novo = () => createClient(url, key, { auth: { persistSession: false } });
const admin = novo();
const { error: e0 } = await admin.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
ok(!e0, "super admin entra");
if (e0) { console.error("Use o e-mail e a palavra-passe REAIS do super admin."); process.exit(1); }

const slug = `teste-dup-${Date.now().toString(36)}`, email = `${slug}@example.com`;
const c = await admin.functions.invoke("admin-create-business", { body: { nome: "Teste Duplicados", slug, contacto: null, pago_ate: new Date(Date.now() + 30 * 864e5).toISOString(), email_proprietario: email } });
ok(!c.error, "cria o negócio de teste");
const id = c.data?.business_id;
const dono = novo();
await dono.auth.signInWithPassword({ email, password: c.data?.senha_temporaria ?? "x" });

// o dia/hora em Lisboa → instante ISO (usa o fuso do Intl)
function lisboa(dateStr, hhmm) {
  const [y, m, d] = dateStr.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  const off = (t) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)); const g = (k) => Number(p.find((x) => x.type === k).value); return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - t; };
  let utc = naive - off(naive); utc = naive - off(utc);
  return new Date(utc).toISOString();
}
function diaUtil(avanco) { let d = new Date(Date.now() + avanco * 864e5); while ([0, 6].includes(d.getUTCDay())) d = new Date(+d + 864e5); return d.toISOString().slice(0, 10); }
let tel = 0; const telefone = () => `92${String(++tel).padStart(7, "0")}`;
const visitante = () => novo();
const marcar = (servico, inicio) => visitante().rpc("book_appointment", { p_slug: slug, p_service_id: servico, p_professional_id: null, p_inicio: inicio, p_nome: "Cliente Teste", p_telefone: telefone(), p_consentimento: true, p_website: null });

try {
  const prof = (await dono.from("professionals").select("id")).data?.[0]?.id;
  const mk = async (name, dur, buf) => { const r = await dono.from("services").insert({ business_id: id, name, duration_minutes: dur, price_cents: 1000, buffer_minutes: buf }).select("id").single(); await dono.from("professional_services").insert({ professional_id: prof, service_id: r.data.id, business_id: id }); return r.data.id; };
  const A = await mk("Extensão de cutícula", 45, 0), B = await mk("Manicure", 60, 15), C = await mk("Pedicure", 30, 0);

  // ===== O EXEMPLO: cutícula às 9h, outros serviços na mesma hora =====
  const d1 = diaUtil(4), h = (x) => lisboa(d1, x);
  ok((await marcar(A, h("09:00"))).data?.ok === true, "cutícula às 09:00 → aceite");
  ok((await marcar(B, h("09:00"))).data?.code === "slot_taken", "manicure às 09:00 (serviço diferente, mesma hora) → RECUSADA");
  ok((await marcar(C, h("09:00"))).data?.code === "slot_taken", "pedicure às 09:00 (serviço diferente, mesma hora) → RECUSADA");
  ok((await marcar(B, h("09:15"))).data?.code === "slot_taken", "manicure às 09:15 (a meio da cutícula) → RECUSADA");
  ok((await marcar(C, h("09:30"))).data?.code === "slot_taken", "pedicure às 09:30 (antes de a cutícula acabar) → RECUSADA");
  ok((await marcar(B, h("09:45"))).data?.ok === true, "manicure às 09:45 (logo a seguir à cutícula) → aceite");
  ok((await marcar(C, h("10:45"))).data?.code === "slot_taken", "pedicure às 10:45 (dentro do intervalo de 15 min da manicure) → RECUSADA");
  ok((await marcar(C, h("11:00"))).data?.ok === true, "pedicure às 11:00 (depois do intervalo) → aceite");
  const livres = (await visitante().rpc("get_available_slots", { p_slug: slug, p_service_id: C, p_professional_id: null, p_data: d1 })).data.map((r) => r.inicio);
  ok(!livres.some((x) => x >= h("09:00") && x < h("11:00")), "a página não mostra nenhum horário ocupado (09:00–11:00) para a pedicure");

  // ===== a proprietária também não consegue sobrepor =====
  ok((await dono.rpc("owner_create_appointment", { p_service_id: C, p_professional_id: null, p_inicio: h("09:00"), p_nome: "Manual", p_telefone: "930000001" })).data?.code === "slot_taken", "marcação MANUAL às 09:00 (outro serviço) → recusada");

  // ===== STRESS: 20 pedidos simultâneos, 3 serviços, horários sobrepostos =====
  const d2 = diaUtil(6), g = (x) => lisboa(d2, x);
  const servicos = [A, B, C], horas = ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00"];
  const pedidos = await Promise.all(Array.from({ length: 20 }, (_, i) => marcar(servicos[i % 3], g(horas[(i * 4) % horas.length]))));
  const criadas = pedidos.filter((p) => p.data?.ok === true).length;
  ok(criadas >= 1 && pedidos.every((p) => p.data?.ok === true || p.data?.code === "slot_taken"), `stress (20 em simultâneo, 3 serviços): ${criadas} aceite(s), todos os outros recusados com “horário ocupado”`);

  // ===== VERIFICAÇÃO: nenhuma sobreposição, nenhum intervalo violado =====
  const todas = (await dono.from("appointments").select("inicio, fim, intervalo_depois_min, status").eq("status", "confirmado").order("inicio")).data ?? [];
  let sobrep = 0, violacoes = 0;
  for (let i = 1; i < todas.length; i++) {
    const ant = todas[i - 1], at = todas[i];
    if (new Date(at.inicio) < new Date(ant.fim)) sobrep++;
    if (new Date(at.inicio) < new Date(+new Date(ant.fim) + ant.intervalo_depois_min * 60000)) violacoes++;
  }
  ok(todas.length >= 4 && sobrep === 0, `na base de dados: ${todas.length} marcações confirmadas, ${sobrep} sobreposições (esperado 0)`);
  ok(violacoes === 0, `intervalos respeitados entre todas as marcações (${violacoes} violações, esperado 0)`);
} finally {
  if (id) { const r = await admin.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: slug } }); ok(!r.error, "limpeza: negócio de teste excluído"); }
}
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo OK");
process.exit(falhas ? 1 : 0);
