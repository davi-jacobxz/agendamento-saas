import type { Negocio3, Profissional, Servico, Ligacao, Horario } from "../../lib/ownerApi";

export interface Dados {
  negocio: Negocio3; profs: Profissional[]; servs: Servico[]; ligs: Ligacao[]; horarios: Horario[];
}
export interface Props { dados: Dados; recarregar: () => Promise<void> }
