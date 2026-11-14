import { describe, expect, it } from "vitest";
import { ligacaoInstagram, ligacaoWhatsApp, rotaDe } from "./rota";

describe("rotaDe", () => {
  it("raiz e rotas da aplicação", () => { for (const p of ["/", "", "/login", "/painel", "/admin"]) expect(rotaDe(p)).toEqual({ tipo: "app" }); });
  it("página de um negócio", () => {
    expect(rotaDe("/studio-ana")).toEqual({ tipo: "pagina", slug: "studio-ana" });
    expect(rotaDe("/studio-ana/")).toEqual({ tipo: "pagina", slug: "studio-ana" });
    expect(rotaDe("/Studio-Ana")).toEqual({ tipo: "pagina", slug: "studio-ana" });
  });
  it("privacidade", () => expect(rotaDe("/privacidade")).toEqual({ tipo: "privacidade" }));
  it("reservados, curtos e inválidos não são páginas", () => {
    for (const p of ["/api", "/assets", "/sw", "/ab", "/a_b_c", "/-ana", "/ana--b", "/x".repeat(2), "/a/b"]) expect(rotaDe(p).tipo).toBe("nao-encontrada");
  });
});

describe("ligações", () => {
  it("WhatsApp com mensagem codificada", () => {
    expect(ligacaoWhatsApp("+351 912 345 678", "Olá & obrigada")).toBe("https://wa.me/351912345678?text=Ol%C3%A1%20%26%20obrigada");
  });
  it("WhatsApp inválido ou vazio → null", () => { expect(ligacaoWhatsApp("123", "x")).toBeNull(); expect(ligacaoWhatsApp(null, "x")).toBeNull(); });
  it("Instagram só com nome de utilizador válido", () => {
    expect(ligacaoInstagram("studio.ana")).toBe("https://instagram.com/studio.ana");
    expect(ligacaoInstagram("evil/../x")).toBeNull(); expect(ligacaoInstagram("")).toBeNull();
  });
});
