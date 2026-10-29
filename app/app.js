/* Estação de Treino Auditivo — SWARM v4
 *
 * Regras de engenharia:
 * - o motor determinístico vive em protocol.js (espelho de swarm/engine.py);
 * - a matemática de medição vive em protocol.js.measure (espelho de
 *   swarm/measurement.py); este arquivo não recalcula limiar por conta própria;
 * - nenhum texto clínico é inventado aqui: o app só mostra o que o motor
 *   devolve e o que o participante registrou;
 * - sem voz, a avaliação e o treino param. O app não simula a voz.
 */
"use strict";

const APP_VERSION = "6.2.2";
const BUILD = "2026-10-29";
const STORAGE_KEY = "audioswarm.v4.state";
const LEGACY_KEY = "protocolo_swarm_v31";
const TEST_NOISE = "rosa";
const TEST_LEVEL = 2;
const TEST_RATE = 0.95;
const DOSE_CAP_SECONDS = 600;
const DRAFT_KEY = STORAGE_KEY + ".draft";
/* Hot copy of the diary form, written on every keystroke. The main state is
   written on a short debounce; if the machine is switched off inside that
   window, this key is what restores the text. */
const DIARY_KEY = STORAGE_KEY + ".diary";
/* Cópia espelho: se a chave principal corromper, o estado volta daqui. */
const MIRROR_KEY = STORAGE_KEY + ".mirror";
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/* Calendar day in the participant's own time zone. Session dates are stored as
   UTC ISO strings, so slicing them would move an evening session to tomorrow
   in São Paulo (UTC-3) and break the "one session per day" rule. */
function localDayKey(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || "").slice(0, 10);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function clockLabel(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

let toastTimer = null;
function toast(message) {
  let node = $("#toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "toast";
    node.className = "toast";
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add("hidden"), 4200);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Conteúdo: frases, HHIE-S, citações                                  */
/* ------------------------------------------------------------------ */

const ITEMS = [
  /* prática — não conta */
  { id: "p1", split: "practice", tier: "N1", kind: "literal", domain: "familia", text: "O neto do seu Joaquim chega no sábado à tarde.", q: "Quando o neto chega?", options: ["Sábado à tarde", "Domingo de manhã", "Sexta à noite", "Segunda ao meio-dia"] },
  { id: "p2", split: "practice", tier: "N1", kind: "literal", domain: "mercado", text: "Dona Marta comprou pão, leite e ovos na padaria.", q: "O que ela comprou?", options: ["Pão", "leite e ovos", "Arroz", "feijão e café", "Frutas e verduras", "Queijo e presunto"] },
  { id: "p3", split: "practice", tier: "N1", kind: "literal", domain: "saude", text: "O médico pediu para tomar o remédio depois do almoço.", q: "Quando tomar o remédio?", options: ["Depois do almoço", "Antes do café", "Na hora de dormir", "Em jejum"] },
  { id: "p4", split: "practice", tier: "N2", kind: "literal", domain: "transporte", text: "O ônibus das cinco horas vai para o centro da cidade.", q: "Para onde vai o ônibus?", options: ["Para o centro", "Para a praia", "Para o aeroporto", "Para o hospital"] },
  /* forma A — linha de base e seguimento */
  { id: "a01", split: "A", tier: "N1", kind: "literal", domain: "saude", text: "A consulta médica foi remarcada para quinta-feira às dez horas.", q: "Quando será a consulta?", options: ["Quinta às dez", "Sexta às nove", "Quarta às onze", "Quinta às três"] },
  { id: "a02", split: "A", tier: "N2", kind: "action", domain: "saude", text: "O médico pediu para voltar daqui a quinze dias com os exames.", q: "Quando deve voltar?", options: ["Em quinze dias", "Em sete dias", "Em trinta dias", "Em dois meses"] },
  { id: "a03", split: "A", tier: "N3", kind: "order", domain: "dinheiro", text: "João foi à farmácia comprar remédio e depois ao banco pagar a conta de luz.", q: "Onde ele foi primeiro?", options: ["Farmácia", "Banco", "Mercado", "Lotérica"] },
  { id: "a04", split: "A", tier: "N2", kind: "literal", domain: "familia", text: "A reunião da família será no domingo ao meio-dia na casa da vovó.", q: "Onde será a reunião?", options: ["Casa da vovó", "Restaurante", "Praia", "Igreja"] },
  { id: "a05", split: "A", tier: "N1", kind: "negative", domain: "mercado", text: "Comprei laranja, banana, maçã e uva para a semana.", q: "Qual fruta NÃO foi comprada?", options: ["Pera", "Uva", "Banana", "Maçã"] },
  { id: "a06", split: "A", tier: "N2", kind: "literal", domain: "transporte", text: "O ônibus para o centro sai às sete e quinze da plataforma três.", q: "De qual plataforma sai?", options: ["Três", "Sete", "Quinze", "Cinco"] },
  { id: "a07", split: "A", tier: "N2", kind: "literal", domain: "casa", text: "A receita leva dois ovos, uma xícara de leite e três colheres de açúcar.", q: "Quantos ovos?", options: ["Dois", "Três", "Um", "Quatro"] },
  { id: "a08", split: "A", tier: "N1", kind: "literal", domain: "casa", text: "O carteiro deixou uma encomenda na portaria hoje cedo.", q: "Onde deixou a encomenda?", options: ["Na portaria", "Na cozinha", "No quintal", "Na garagem"] },
  { id: "a09", split: "A", tier: "N1", kind: "literal", domain: "saude", text: "A farmácia entrega o pedido na quarta-feira de manhã.", q: "Quando chega o pedido?", options: ["Quarta de manhã", "Quinta à tarde", "Terça à noite", "Sexta ao meio-dia"] },
  { id: "a10", split: "A", tier: "N1", kind: "literal", domain: "casa", text: "O mecânico consertou o freio do carro antes do almoço.", q: "O que foi consertado?", options: ["O freio", "O motor", "O pneu", "A porta"] },
  { id: "a11", split: "A", tier: "N2", kind: "literal", domain: "dinheiro", text: "A conta de luz chegou mais alta neste mês de inverno.", q: "O que chegou mais alto?", options: ["A conta de luz", "O aluguel", "A conta de água", "O gás"] },
  { id: "a12", split: "A", tier: "N1", kind: "literal", domain: "casa", text: "O gato subiu no telhado depois que a chuva parou.", q: "Quando o gato subiu?", options: ["Depois da chuva", "Antes do almoço", "Durante a chuva", "De manhã cedo"] },
  /* forma B — semana 4 */
  { id: "b01", split: "B", tier: "N1", kind: "infer", domain: "transporte", text: "O ônibus atrasou porque houve um acidente na avenida principal.", q: "Por que o ônibus atrasou?", options: ["Acidente na avenida", "Motorista doente", "Chuva forte", "Falta de gasolina"] },
  { id: "b02", split: "B", tier: "N3", kind: "order", domain: "casa", text: "Primeiro desligue a luz da sala. Depois feche a janela. Por fim tranque a porta.", q: "Qual é a SEGUNDA ação?", options: ["Fechar a janela", "Desligar a luz", "Trancar a porta", "Abrir o portão"] },
  { id: "b03", split: "B", tier: "N1", kind: "infer", domain: "casa", text: "Choveu muito forte, por isso cancelamos o piquenique no parque.", q: "Por que cancelaram?", options: ["Choveu forte", "Fazia frio", "Estava cansado", "O parque fechou"] },
  { id: "b04", split: "B", tier: "N1", kind: "order", domain: "mercado", text: "Na feira tinham tomate, cebola, alho, cenoura e batata.", q: "Qual é o QUARTO item?", options: ["Cenoura", "Batata", "Cebola", "Alho"] },
  { id: "b05", split: "B", tier: "N2", kind: "literal", domain: "familia", text: "De manhã tomei café. Depois fui ao banco. À tarde visitei minha filha.", q: "O que aconteceu à tarde?", options: ["Visitou a filha", "Tomou café", "Foi ao banco", "Fez compras"] },
  { id: "b06", split: "B", tier: "N2", kind: "literal", domain: "casa", text: "Como esqueci a chave, precisei chamar o vizinho para abrir a porta.", q: "O que ele fez para entrar?", options: ["Chamou o vizinho", "Arrombou a porta", "Entrou pela janela", "Dormiu na rua"] },
  { id: "b07", split: "B", tier: "N2", kind: "infer", domain: "transporte", text: "Por causa do trânsito intenso, ela saiu meia hora mais cedo e chegou pontualmente.", q: "Por que chegou no horário?", options: ["Saiu mais cedo", "Pegou atalho", "Correu muito", "O trânsito melhorou"] },
  { id: "b08", split: "B", tier: "N3", kind: "literal", domain: "transporte", text: "Ele voltou para casa buscar a carteira esquecida e por isso perdeu o ônibus das oito.", q: "O que ele perdeu?", options: ["O ônibus das oito", "A carteira", "A chave", "O celular"] },
  { id: "b09", split: "B", tier: "N3", kind: "action", domain: "mercado", text: "A vizinha pediu para o filho comprar pão e leite antes de fechar o mercado.", q: "O que o filho deve comprar?", options: ["Pão e leite", "Arroz e feijão", "Carne e batata", "Café e açúcar"] },
  { id: "b10", split: "B", tier: "N3", kind: "literal", domain: "saude", text: "O médico explicou que o remédio deve ser tomado em jejum, uma hora antes do café.", q: "Quando tomar o remédio?", options: ["Uma hora antes do café", "Depois do almoço", "Na hora de dormir", "Junto com o café"] },
  { id: "b11", split: "B", tier: "N1", kind: "literal", domain: "familia", text: "A neta ligou para avisar que vai jantar aqui domingo.", q: "O que a neta avisou?", options: ["Que vai jantar domingo", "Que vai viajar sábado", "Que chegou de viagem", "Que vai estudar"] },
  { id: "b12", split: "B", tier: "N1", kind: "literal", domain: "casa", text: "O jardim ganhou rosas vermelhas no mês de agosto.", q: "O que o jardim ganhou?", options: ["Rosas vermelhas", "Flores amarelas", "Plantas de sombra", "Grama nova"] },
  /* forma C — semana 8 */
  { id: "c01", split: "C", tier: "N3", kind: "literal", domain: "saude", text: "A prefeitura anunciou que a vacinação contra gripe começa segunda-feira nos postos. Idosos acima de oitenta anos têm prioridade.", q: "Quem tem prioridade?", options: ["Idosos acima de 80", "Crianças", "Adultos jovens", "Gestantes"] },
  { id: "c02", split: "C", tier: "N3", kind: "literal", domain: "dinheiro", text: "O dólar fechou em baixa de um por cento, cotado a quatro reais e noventa centavos.", q: "Qual foi a cotação?", options: ["4", "90", "5", "10", "4", "50", "5", "90"] },
  { id: "c03", split: "C", tier: "N3", kind: "literal", domain: "transporte", text: "Atenção passageiros do voo três quatro cinco dois: embarque pelo portão sete, em vez do portão doze.", q: "Qual é o novo portão?", options: ["Sete", "Doze", "Cinco", "Dois"] },
  { id: "c04", split: "C", tier: "N2", kind: "literal", domain: "tempo", text: "A previsão do tempo indica chuva forte para amanhã na região sudeste.", q: "O que acontecerá amanhã?", options: ["Chuva forte", "Sol forte", "Neve", "Vento seco"] },
  { id: "c05", split: "C", tier: "N2", kind: "literal", domain: "dinheiro", text: "O prêmio da loteria acumulou em doze milhões e o sorteio será na quarta-feira.", q: "Quando é o sorteio?", options: ["Quarta-feira", "Sexta-feira", "Hoje", "Domingo"] },
  { id: "c06", split: "C", tier: "N2", kind: "literal", domain: "transporte", text: "A greve dos motoristas termina terça-feira e os ônibus voltam a circular na quarta.", q: "Quando os ônibus voltam?", options: ["Na quarta", "Na terça", "Na quinta", "Na sexta"] },
  { id: "c07", split: "C", tier: "N2", kind: "literal", domain: "tempo", text: "Os termômetros devem marcar trinta e oito graus no fim de semana na capital.", q: "Qual é a temperatura prevista?", options: ["38 graus", "28 graus", "18 graus", "48 graus"] },
  { id: "c08", split: "C", tier: "N3", kind: "literal", domain: "cultura", text: "O show gratuito será no dia vinte e cinco, às dezenove horas, no parque central.", q: "Que horas é o show?", options: ["Dezenove horas", "Vinte e cinco horas", "Dezessete horas", "Vinte e uma horas"] },
  { id: "c09", split: "C", tier: "N3", kind: "literal", domain: "cidade", text: "O jornal informou que a obra da avenida termina em julho e o asfalto novo sai em agosto.", q: "Quando termina a obra?", options: ["Em julho", "Em agosto", "Em junho", "Em setembro"] },
  { id: "c10", split: "C", tier: "N3", kind: "literal", domain: "cidade", text: "A nova linha de metrô abre com seis estações e operação das cinco à meia-noite.", q: "Quantas estações?", options: ["Seis", "Cinco", "Oito", "Quatro"] },
  { id: "c11", split: "C", tier: "N2", kind: "literal", domain: "saude", text: "O hospital vai abrir um novo ambulatório de fonoaudiologia na segunda-feira, no terceiro andar.", q: "Onde será o ambulatório?", options: ["No terceiro andar", "No primeiro andar", "No térreo", "No quinto andar"] },
  { id: "c12", split: "C", tier: "N3", kind: "literal", domain: "esporte", text: "O campeonato começa em março e a final está marcada para o dia trinta de novembro.", q: "Quando é a final?", options: ["30 de novembro", "Em março", "30 de dezembro", "15 de novembro"] },
  /* treino — banco estratificado por nível */
  { id: "t01", split: "train", tier: "N1", kind: "literal", domain: "casa", text: "Dona Maria comprou leite, pão e manteiga no mercado.", q: "O que ela comprou?", options: ["Leite", "pão e manteiga", "Arroz e feijão", "Leite e frutas", "Pão e café"] },
  { id: "t02", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "O cardiologista pediu para voltar em três semanas com o exame do coração.", q: "Quando voltar?", options: ["Em três semanas", "Em três dias", "Em três meses", "Amanhã"] },
  { id: "t03", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "O almoço de domingo será na casa da filha, ao meio-dia.", q: "Onde será o almoço?", options: ["Na casa da filha", "Na casa da vovó", "No restaurante", "Na praia"] },
  { id: "t04", split: "train", tier: "N1", kind: "literal", domain: "casa", text: "O ônibus para o shopping passa a cada vinte minutos.", q: "De quanto em quanto tempo passa o ônibus?", options: ["A cada vinte minutos", "A cada dez minutos", "A cada meia hora", "A cada hora"] },
  { id: "t05", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "A receita do bolo leva três ovos e duas xícaras de farinha.", q: "Quantos ovos?", options: ["Três", "Dois", "Quatro", "Um"] },
  { id: "t06", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "A padaria entrega pão quente em casa a partir das seis da manhã.", q: "A partir de que horas?", options: ["Seis da manhã", "Oito da manhã", "Meio-dia", "Cinco da tarde"] },
  { id: "t07", split: "train", tier: "N1", kind: "literal", domain: "casa", text: "O eletricista vai trocar a fiação da sala na quinta-feira.", q: "O que ele vai trocar?", options: ["A fiação da sala", "A lâmpada da cozinha", "O chuveiro", "A fechadura"] },
  { id: "t08", split: "train", tier: "N1", kind: "literal", domain: "casa", text: "O entregador deixou a caixa na recepção do prédio.", q: "Onde deixou a caixa?", options: ["Na recepção", "Na garagem", "No apartamento", "Na calçada"] },
  { id: "t09", split: "train", tier: "N3", kind: "literal", domain: "casa", text: "A conta de água vence no dia dez e a de luz no dia vinte.", q: "Quando vence a conta de luz?", options: ["No dia vinte", "No dia dez", "No dia cinco", "No dia trinta"] },
  { id: "t10", split: "train", tier: "N1", kind: "literal", domain: "casa", text: "O cachorro latiu quando o carteiro chegou ao portão.", q: "Quando o cachorro latiu?", options: ["Quando o carteiro chegou", "Quando a chuva parou", "Quando o gato subiu", "Quando o telefone tocou"] },
  { id: "t11", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "A consulta com o oftalmologista foi marcada para as duas da tarde.", q: "Que horas é a consulta?", options: ["Duas da tarde", "Duas da manhã", "Meio-dia", "Quatro da tarde"] },
  { id: "t12", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "O exame de sangue deve ser feito em jejum de doze horas.", q: "Quantas horas de jejum?", options: ["Doze", "Oito", "Vinte e quatro", "Seis"] },
  { id: "t13", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "A vacina da gripe estará disponível também no sábado, das oito às doze.", q: "Quando além da semana?", options: ["Sábado", "das oito às doze", "Domingo o dia todo", "Sexta à noite", "Segunda de manhã"] },
  { id: "t14", split: "train", tier: "N3", kind: "literal", domain: "casa", text: "O neto chegou de viagem ontem à noite e fica até o fim do mês.", q: "Até quando fica?", options: ["Fim do mês", "Fim de semana", "Fim do ano", "Amanhã"] },
  { id: "t15", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "A reunião do condomínio foi transferida da sala dois para o salão de festas.", q: "Qual é o novo local?", options: ["Salão de festas", "Sala dois", "Portaria", "Garagem"] },
  { id: "t16", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "O São Paulo venceu o jogo por dois a um no Morumbi.", q: "Qual foi o placar?", options: ["Dois a um", "Um a zero", "Três a dois", "Dois a zero"] },
  { id: "t17", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "O técnico do São Paulo escalou três zagueiros para o clássico.", q: "Quantos zagueiros?", options: ["Três", "Dois", "Quatro", "Cinco"] },
  { id: "t18", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "O assistente de voz com inteligência artificial marca consultas médicas pelo telefone.", q: "O que a IA faz?", options: ["Marca consultas", "Dirige carros", "Cozinha", "Conserta aparelhos"] },
  { id: "t19", split: "train", tier: "N4", kind: "literal", domain: "casa", text: "O aplicativo de inteligência artificial lembra o horário de cada remédio e avisa a família por mensagem se a dose do dia for esquecida.", q: "O que acontece se esquecer?", options: ["Avisa a família por mensagem", "Cancela a consulta", "Desliga o celular", "Chama a ambulância"] },
  { id: "t20", split: "train", tier: "N2", kind: "literal", domain: "casa", text: "A televisão nova ajusta o volume dos diálogos sozinha quando a sala fica barulhenta.", q: "O que a TV ajusta?", options: ["O volume dos diálogos", "A cor da tela", "O canal", "O brilho"] },
  { id: "n1a", split: "train", tier: "N1", kind: "literal", domain: "esporte", text: "O São Paulo joga no Morumbi no domingo.", q: "Onde o São Paulo joga?", options: ["No Morumbi", "No Pacaembu", "Na Vila Belmiro", "No Allianz"] },
  { id: "n1b", split: "train", tier: "N1", kind: "literal", domain: "saude", text: "A farmácia do bairro abre às oito da manhã.", q: "Que horas a farmácia abre?", options: ["Oito da manhã", "Sete da manhã", "Nove da manhã", "Meio-dia"] },
  { id: "n1c", split: "train", tier: "N1", kind: "literal", domain: "familia", text: "O neto chega para o almoço de domingo.", q: "Quem chega para o almoço?", options: ["O neto", "A filha", "O vizinho", "O irmão"] },
  { id: "n2a", split: "train", tier: "N2", kind: "literal", domain: "saude", text: "O médico receitou o remédio da pressão para tomar depois do café.", q: "Quando tomar o remédio?", options: ["Depois do café", "Antes de dormir", "Em jejum", "No almoço"] },
  { id: "n2b", split: "train", tier: "N2", kind: "literal", domain: "familia", text: "A neta mandou um vídeo do cachorro pelo celular.", q: "O que a neta mandou?", options: ["Um vídeo do cachorro", "Uma foto da festa", "Um áudio", "Um recado"] },
  { id: "n2c", split: "train", tier: "N2", kind: "action", domain: "dinheiro", text: "Para pagar a conta no banco, ele precisa levar o documento com foto.", q: "O que ele precisa levar?", options: ["Documento com foto", "O cartão do ônibus", "A receita médica", "A chave de casa"] },
  { id: "n3a", split: "train", tier: "N3", kind: "infer", domain: "esporte", text: "O técnico do São Paulo mudou o esquema no segundo tempo e o time virou o jogo nos últimos minutos.", q: "O que mudou o jogo?", options: ["A mudança de esquema", "A chuva", "O juiz", "O goleiro reserva"] },
  { id: "n3b", split: "train", tier: "N3", kind: "order", domain: "saude", text: "O médico pediu o exame de sangue antes da consulta e marcou o retorno para daqui a três semanas.", q: "O que vem primeiro?", options: ["O exame de sangue", "A consulta de retorno", "A cirurgia", "A fisioterapia"] },
  { id: "n3c", split: "train", tier: "N3", kind: "literal", domain: "saude", text: "A reportagem explicou que a vacina da gripe está disponível nos postos até o fim do mês.", q: "Até quando tem vacina?", options: ["Até o fim do mês", "Até amanhã", "Até o fim do ano", "Só na segunda-feira"] },
  { id: "n3d", split: "train", tier: "N3", kind: "action", domain: "tech", text: "O aplicativo de inteligência artificial resume as notícias do dia e avisa quando aparece o nome do São Paulo.", q: "O que o aplicativo faz?", options: ["Resume notícias e avisa", "Faz ligações", "Tira fotos", "Compra remédios"] },
  { id: "n3e", split: "train", tier: "N3", kind: "order", domain: "familia", text: "A filha combinou de buscar o remédio na farmácia e deixar na portaria antes do almoço.", q: "Onde ela vai deixar o remédio?", options: ["Na portaria", "Na cozinha", "No carro", "Na farmácia"] },
  { id: "n3f", split: "train", tier: "N3", kind: "literal", domain: "transporte", text: "O ônibus para o hospital sai da praça às sete e volta às cinco da tarde.", q: "Que horas o ônibus volta?", options: ["Cinco da tarde", "Sete da manhã", "Meio-dia", "Sete da noite"] },
  { id: "n3g", split: "train", tier: "N3", kind: "infer", domain: "casa", text: "Como a chuva forte alagou a avenida, o motorista mudou o caminho e avisou que chegaria atrasado.", q: "Por que ele mudou o caminho?", options: ["Por causa do alagamento", "Porque perdeu a hora", "Porque o ônibus quebrou", "Porque havia greve"] },
  { id: "n4a", split: "train", tier: "N4", kind: "infer", domain: "saude", text: "O médico explicou que o remédio novo pode dar sono, então é melhor tomar depois do jantar e não dirigir à noite.", q: "Por que tomar depois do jantar?", options: ["Porque dá sono", "Porque é mais caro", "Porque estraga o estômago", "Porque não pode com leite"] },
  { id: "n4b", split: "train", tier: "N4", kind: "action", domain: "tech", text: "O neto mostrou que o celular consegue ler as mensagens em voz alta, mas é preciso desligar a televisão para entender direito.", q: "O que atrapalha a leitura em voz alta?", options: ["O barulho da televisão", "A luz do quarto", "O tipo de voz", "A bateria fraca"] },
  { id: "n4c", split: "train", tier: "N4", kind: "literal", domain: "esporte", text: "O São Paulo anunciou a apresentação do novo atacante no Morumbi na quinta, com entrada gratuita para sócios e estacionamento pago.", q: "Quem entra de graça?", options: ["Os sócios", "Todos os torcedores", "Só os jornalistas", "Ninguém"] },
  { id: "n4d", split: "train", tier: "N4", kind: "infer", domain: "cidade", text: "A reportagem mostrou que a fila do posto diminuiu depois que o atendimento passou a começar às sete da manhã, duas horas mais cedo.", q: "Por que a fila diminuiu?", options: ["O atendimento começou mais cedo", "O posto fechou", "Aumentou o número de médicos", "Mudou a vacina"] },
  { id: "n4e", split: "train", tier: "N4", kind: "action", domain: "familia", text: "A filha avisou que passa para buscar ele às três da tarde, mas pediu que ele deixe o portão aberto e o exame em cima da mesa.", q: "O que ele precisa fazer antes?", options: ["Deixar o portão aberto e o exame na mesa", "Fechar a casa", "Ir até a casa dela", "Ligar para o médico"] },
  { id: "n4f", split: "train", tier: "N4", kind: "infer", domain: "esporte", text: "No domingo o São Paulo jogou no Morumbi e ganhou de dois a um. O vizinho contou que o segundo gol saiu aos quarenta e cinco do segundo tempo, quando quase todo mundo já tinha desistido.", q: "Quando saiu o segundo gol?", options: ["Aos quarenta e cinco do segundo tempo", "No começo do jogo", "Aos quinze do primeiro tempo", "No intervalo"] },
  { id: "n4g", split: "train", tier: "N4", kind: "order", domain: "saude", text: "Ele acordou com o ouvido tampado e ligou para o consultório. A secretária avisou que o horário da tarde estava cheio, então marcou para as oito da manhã seguinte. Antes da consulta, precisa passar no laboratório para colher o sangue.", q: "O que ele faz antes da consulta?", options: ["Colher o sangue no laboratório", "Ir ao Morumbi", "Buscar o aparelho", "Passar na farmácia"] },
  { id: "n4h", split: "train", tier: "N4", kind: "infer", domain: "cidade", text: "A filha chegou de viagem e contou que o aeroporto estava cheio por causa do feriado. O voo atrasou duas horas, mas ela conseguiu pegar o táxi que o pai tinha combinado com o motorista de sempre.", q: "Por que o voo atrasou?", options: ["Por causa do feriado", "Por causa da chuva", "Porque ela chegou tarde", "Porque o táxi demorou"] },
  /* bloco de vida real — 2 conjuntos de 4, não adaptativo */
  { id: "r01", split: "R", set: "1", tier: "N3", kind: "action", domain: "saude", text: "A secretária do consultório ligou para confirmar a consulta de sexta às nove e pediu para chegar vinte minutos antes com o exame na mão.", q: "O que ele precisa levar?", options: ["O exame", "O cartão do banco", "A receita dos óculos", "O aparelho auditivo"] },
  { id: "r02", split: "R", set: "1", tier: "N3", kind: "infer", domain: "dinheiro", text: "O cobrador avisou que a conta de luz venceu e que, se não pagar hoje, a luz pode ser cortada amanhã.", q: "O que acontece se não pagar hoje?", options: ["A luz pode ser cortada", "O valor diminui", "Nada acontece", "A conta vence no mês que vem"] },
  { id: "r03", split: "R", set: "1", tier: "N3", kind: "infer", domain: "familia", text: "A neta pediu para ele confirmar no grupo da família se vai ao almoço de domingo, porque precisa reservar a mesa.", q: "Por que ela precisa da resposta?", options: ["Para reservar a mesa", "Para comprar a comida", "Para ir de carro", "Para avisar o médico"] },
  { id: "r04", split: "R", set: "1", tier: "N3", kind: "literal", domain: "saude", text: "O médico disse que o aparelho auditivo está funcionando bem, mas que ele precisa voltar em três meses para ajustar o volume.", q: "O que vai acontecer em três meses?", options: ["Ajustar o volume do aparelho", "Comprar um aparelho novo", "Fazer cirurgia", "Trocar o exame"] },
  { id: "r05", split: "R", set: "2", tier: "N3", kind: "infer", domain: "casa", text: "O vizinho avisou que a água vai faltar na terça de manhã por causa do conserto na rua.", q: "Por que a água vai faltar?", options: ["Por causa do conserto na rua", "Porque a conta atrasou", "Porque choveu", "Porque o prédio fechou"] },
  { id: "r06", split: "R", set: "2", tier: "N3", kind: "literal", domain: "saude", text: "Na farmácia, a moça explicou que o remédio genérico tem o mesmo efeito e custa quase metade do preço.", q: "O que ela explicou?", options: ["Que o genérico tem o mesmo efeito e custa menos", "Que o genérico é mais fraco", "Que só o de marca funciona", "Que precisa de receita azul"] },
  { id: "r07", split: "R", set: "2", tier: "N3", kind: "action", domain: "transporte", text: "O jornal da noite mostrou que a linha do metrô vai ficar fechada no fim de semana e que haverá ônibus no lugar.", q: "Como chegar ao centro no fim de semana?", options: ["De ônibus no lugar do metrô", "De metrô normal", "A pé", "De táxi apenas"] },
  { id: "r08", split: "R", set: "2", tier: "N3", kind: "literal", domain: "saude", text: "O filho lembrou que a consulta de cardiologia é no hospital novo e que o estacionamento fica na rua de trás.", q: "Onde fica o estacionamento?", options: ["Na rua de trás", "No subsolo do hospital", "Na praça", "Em frente ao posto"] },
];

/* ---- DISCURSO: texto corrido (telejornal, entrevista, esporte) ---- */
/* A primeira alternativa é a resposta certa; o app embaralha na hora.  */
const DISCOURSE = [
  { id: "d01", tier: "D1", genre: "telejornal", domain: "saude", text: "Bom dia. A prefeitura informou que a vacinação contra a gripe começa na segunda-feira em todas as unidades de saúde. Idosos acima de sessenta anos podem ir sem agendamento, das oito da manhã às quatro da tarde.", questions: [{"kind": "main", "q": "O que começa na segunda-feira?", "options": ["A vacinação contra a gripe", "A entrega de remédios", "A reforma do posto", "O horário de verão"]}, {"kind": "detail", "q": "Quem pode ir sem agendamento?", "options": ["Idosos acima de sessenta anos", "Somente crianças", "Quem tem plano de saúde", "Apenas gestantes"]}, {"kind": "detail", "q": "Até que horas o posto atende?", "options": ["Até as quatro da tarde", "Até o meio-dia", "Até as seis da noite", "Até as oito da manhã"]}, {"kind": "negative", "q": "O que NÃO é preciso para se vacinar?", "options": ["Agendar hora", "Ter mais de sessenta anos", "Ir a uma unidade de saúde", "Ir durante o dia"]}] },
  { id: "d02", tier: "D1", genre: "esporte", domain: "esporte", text: "O São Paulo venceu o Corinthians por dois a um ontem à noite, no Morumbi. O primeiro gol saiu de pênalti, aos vinte minutos do primeiro tempo. O técnico disse que o time folga hoje e volta a treinar amanhã de manhã.", questions: [{"kind": "main", "q": "Qual foi o resultado do jogo?", "options": ["São Paulo 2 a 1 Corinthians", "São Paulo 1 a 2 Corinthians", "Empate em dois a dois", "São Paulo 3 a 0 Corinthians"]}, {"kind": "detail", "q": "Como saiu o primeiro gol?", "options": ["De pênalti", "De cabeça", "De falta", "De contra-ataque"]}, {"kind": "order", "q": "Quando o time volta a treinar?", "options": ["Amanhã de manhã", "Hoje à tarde", "Hoje à noite", "Só na semana que vem"]}, {"kind": "detail", "q": "Onde foi o jogo?", "options": ["No Morumbi", "No Pacaembu", "Na Neo Química Arena", "No Maracanã"]}] },
  { id: "d03", tier: "D2", genre: "telejornal", domain: "cidade", text: "A chuva forte da madrugada deixou três ruas do bairro alagadas e derrubou uma árvore na avenida principal. Os bombeiros foram chamados por volta das duas da manhã e retiraram a árvore antes das seis. A Defesa Civil pediu que os moradores evitem sair de carro hoje. As aulas na escola municipal foram suspensas e voltam amanhã. A previsão é de mais chuva no fim da tarde.", questions: [{"kind": "main", "q": "O que a notícia conta?", "options": ["O estrago da chuva da madrugada", "A festa do bairro", "A obra da avenida", "A volta às aulas"]}, {"kind": "detail", "q": "Quem tirou a árvore da avenida?", "options": ["Os bombeiros", "Os moradores", "A escola", "A prefeitura"]}, {"kind": "detail", "q": "O que foi suspenso por causa da chuva?", "options": ["As aulas na escola municipal", "A coleta de lixo", "O comércio da avenida", "O ônibus do centro"]}, {"kind": "infer", "q": "O que a Defesa Civil pediu?", "options": ["Evitar sair de carro", "Ficar na escola", "Ir para a avenida", "Ligar para os bombeiros"]}] },
  { id: "d04", tier: "D2", genre: "entrevista", domain: "transporte", text: "O repórter perguntou ao motorista de ônibus como estava o trânsito naquela manhã. Ele respondeu que saiu da garagem às cinco e meia e que, por causa de um acidente na marginal, levou quarenta minutos a mais no trajeto. Contou também que muita gente desceu e foi a pé. No fim da entrevista, pediu paciência aos passageiros e disse que o horário de pico deve melhorar depois das nove.", questions: [{"kind": "main", "q": "Sobre o que o motorista falou?", "options": ["Sobre o trânsito daquela manhã", "Sobre a compra de ônibus novos", "Sobre a greve da empresa", "Sobre a escola dos filhos"]}, {"kind": "detail", "q": "O que causou o atraso?", "options": ["Um acidente na marginal", "Uma obra na garagem", "A chuva", "Um ônibus quebrado"]}, {"kind": "detail", "q": "Quantos minutos a mais ele levou?", "options": ["Quarenta minutos", "Quinze minutos", "Uma hora", "Cinco minutos"]}, {"kind": "infer", "q": "O que ele pediu aos passageiros?", "options": ["Paciência", "Dinheiro para a passagem", "Que descessem antes", "Que reclamassem na empresa"]}] },
  { id: "d05", tier: "D2", genre: "jornal", domain: "dinheiro", text: "A conta de luz vai ficar mais cara no mês que vem. A companhia explicou que o aumento é de sete por cento e que vale para todas as casas do estado. Quem tem renda baixa pode pedir a tarifa social na agência, levando documentos e o número da conta. O pedido também pode ser feito pelo telefone. A companhia avisou que quem não pedir continua pagando o valor normal.", questions: [{"kind": "main", "q": "O que vai acontecer com a conta de luz?", "options": ["Vai ficar mais cara", "Vai ficar mais barata", "Vai acabar", "Vai mudar de nome"]}, {"kind": "detail", "q": "Qual é o aumento?", "options": ["Sete por cento", "Dois por cento", "Vinte por cento", "Cinquenta por cento"]}, {"kind": "action", "q": "O que a pessoa de renda baixa pode pedir?", "options": ["A tarifa social", "Um medidor novo", "A conta em dobro", "A mudança de endereço"]}, {"kind": "infer", "q": "O que acontece com quem não pedir?", "options": ["Continua pagando o valor normal", "Ganha desconto automático", "Perde a luz no mesmo dia", "Paga metade"]}] },
  { id: "d06", tier: "D2", genre: "esporte", domain: "esporte", text: "No fim de semana, o time do bairro ganhou o campeonato amador. A final foi decidida nos pênaltis, depois de um empate sem gols no tempo normal. O goleiro pegou duas cobranças e virou o nome mais falado da festa. O treinador, que comanda o time há dez anos, disse que essa foi a primeira taça dele. A comemoração vai ser no salão da igreja no sábado.", questions: [{"kind": "main", "q": "O que o time do bairro ganhou?", "options": ["O campeonato amador", "A copa estadual", "Um jogo amistoso", "A taça do ano passado"]}, {"kind": "detail", "q": "Como a final foi decidida?", "options": ["Nos pênaltis", "No primeiro tempo", "Com um gol de falta", "Por desistência do outro time"]}, {"kind": "detail", "q": "Quem foi o nome mais falado da festa?", "options": ["O goleiro", "O treinador", "O árbitro", "O presidente do clube"]}, {"kind": "detail", "q": "Onde vai ser a comemoração?", "options": ["No salão da igreja", "No estádio do bairro", "Na casa do goleiro", "Na prefeitura"]}] },
  { id: "d07", tier: "D3", genre: "telejornal", domain: "cidade", text: "As obras da nova estação de metrô começaram em março e devem durar dois anos. A previsão inicial era de dezoito meses, mas a empresa pediu mais seis por causa do terreno. Durante as obras, duas faixas da avenida ficam fechadas e os ônibus mudaram de ponto. A prefeitura prometeu um desvio sinalizado e disse que vai acompanhar o barulho à noite. Moradores reclamaram do movimento de caminhões desde as cinco da manhã. A empresa prometeu instalar painéis para diminuir o barulho e pediu que os motoristas usem a rua de trás enquanto a obra durar. A estação deve atender cerca de trinta mil passageiros por dia quando abrir.", questions: [{"kind": "main", "q": "Sobre o que é a notícia?", "options": ["As obras da nova estação de metrô", "A greve dos motoristas", "O aumento das passagens", "A festa do bairro"]}, {"kind": "detail", "q": "Quantos meses a mais a empresa pediu?", "options": ["Seis meses", "Dois meses", "Dezoito meses", "Dois anos"]}, {"kind": "order", "q": "O que mudou por causa das obras?", "options": ["Os ônibus mudaram de ponto", "Os trens pararam de circular", "A escola foi fechada", "O comércio fechou"]}, {"kind": "infer", "q": "Do que os moradores reclamaram?", "options": ["Do barulho dos caminhões de madrugada", "Da falta de ônibus", "Do preço da passagem", "Da demora do metrô"]}] },
  { id: "d08", tier: "D3", genre: "entrevista", domain: "saude", text: "A repórter entrevistou a enfermeira responsável pelo posto de saúde do bairro. Ela explicou que a procura por exames de audição aumentou depois da campanha na rádio. Contou que o atendimento é feito de segunda a sexta, com senha distribuída a partir das sete da manhã. Disse também que o exame demora cerca de quarenta minutos e que o resultado sai na hora. Sobre os aparelhos, avisou que a entrega depende da fila e do laudo do médico. Sobre o horário de almoço, explicou que o posto fecha entre meio-dia e uma da tarde. No fim, pediu que os pacientes levem um documento com foto e o cartão do posto.", questions: [{"kind": "main", "q": "Quem foi entrevistada?", "options": ["A enfermeira do posto de saúde", "A médica do hospital", "A secretária da escola", "A motorista do ônibus"]}, {"kind": "detail", "q": "A partir de que horas a senha é distribuída?", "options": ["Das sete da manhã", "Das oito da noite", "Do meio-dia", "Das cinco da tarde"]}, {"kind": "detail", "q": "Quanto tempo demora o exame?", "options": ["Cerca de quarenta minutos", "Cerca de duas horas", "Cinco minutos", "O dia inteiro"]}, {"kind": "action", "q": "O que o paciente deve levar?", "options": ["Documento com foto e cartão do posto", "Só o pedido do médico", "O aparelho antigo", "A receita dos óculos"]}] },
  { id: "d09", tier: "D4", genre: "telejornal", domain: "cidade", text: "O temporal que atingiu a capital na noite de ontem provocou estragos em várias regiões. Na zona norte, a água subiu em três avenidas movimentadas e deixou carros parados por mais de duas horas. Os bombeiros atenderam quarenta e duas chamadas, a maioria para retirar galhos de cima dos fios de eletricidade. Cerca de oito mil casas ficaram sem luz, e a companhia informou que o serviço foi restabelecido em boa parte dos bairros durante a madrugada. Três escolas cancelaram as aulas da manhã e avisaram as famílias por mensagem. O aeroporto funcionou com atrasos, mas nenhum voo foi cancelado. A previsão para hoje é de chuva fraca pela manhã e tempo firme à tarde. A Defesa Civil pediu que quem mora em área de risco procure abrigo e ligue para o número de emergência se ouvir estalos no telhado.", questions: [{"kind": "main", "q": "O que a reportagem trata?", "options": ["Os estragos do temporal na capital", "A inauguração de um parque", "A greve dos bombeiros", "A previsão do feriado"]}, {"kind": "detail", "q": "Quantas chamadas os bombeiros atenderam?", "options": ["Quarenta e duas", "Vinte e duas", "Oito mil", "Três"]}, {"kind": "order", "q": "O que as escolas fizeram?", "options": ["Cancelaram as aulas da manhã", "Fecharam por uma semana", "Mudaram o horário da tarde", "Receberam as famílias no ginásio"]}, {"kind": "action", "q": "O que a Defesa Civil pediu a quem mora em área de risco?", "options": ["Procurar abrigo e ligar se ouvir estalos", "Sair de carro da cidade", "Esperar o temporal na rua", "Ligar apenas para a escola"]}] },
  { id: "d10", tier: "D4", genre: "entrevista", domain: "esporte", text: "O repórter conversou com o técnico do time depois da vitória de ontem. O treinador começou dizendo que o resultado foi justo e que o time correu mais no segundo tempo. Explicou que trocou dois jogadores no intervalo porque precisava de velocidade pelas laterais. Sobre o atacante que saiu machucado, avisou que o exame será feito hoje e que só depois saberá se ele joga no domingo. Contou que o grupo treina de manhã nos três dias seguintes e folga na quinta. Perguntado sobre o próximo adversário, respondeu que prefere pensar jogo a jogo e que a tabela não muda nada no vestiário. Sobre a arbitragem, preferiu não comentar. Disse também que o grupo está confiante e que o time volta ao estádio no domingo, às quatro da tarde. No fim, agradeceu a torcida que encheu o estádio mesmo com chuva.", questions: [{"kind": "main", "q": "Sobre o que o técnico falou?", "options": ["Sobre a vitória e o próximo jogo", "Sobre a compra de jogadores", "Sobre a reforma do estádio", "Sobre as férias do grupo"]}, {"kind": "detail", "q": "Por que ele trocou dois jogadores no intervalo?", "options": ["Porque precisava de velocidade pelas laterais", "Porque estavam machucados", "Porque o árbitro pediu", "Porque a torcida vaiou"]}, {"kind": "detail", "q": "Quando o time folga?", "options": ["Na quinta", "No domingo", "Na segunda", "Na sexta"]}, {"kind": "infer", "q": "O que ele disse sobre a torcida?", "options": ["Agradeceu, porque encheu o estádio mesmo com chuva", "Pediu que não fosse ao jogo", "Disse que atrapalhou o time", "Não falou da torcida"]}] },
];

/* Tradução dos 10 itens do HHIE-S (Ventry & Weinstein 1983), em pt-BR.
   O app rotula como instrumento de triagem; não é uma versão validada
   formalmente em português brasileiro nesta implementação. */
const HHIE_QUESTIONS = [
  "Um problema de audição faz você sentir vergonha quando conhece pessoas novas?",
  "Um problema de audição faz você sentir frustração quando conversa com familiares?",
  "Você tem dificuldade para ouvir quando alguém fala baixinho (sussurra)?",
  "Você se sente prejudicado por um problema de audição?",
  "Um problema de audição dificulta visitar amigos, parentes ou vizinhos?",
  "Um problema de audição faz você ir menos vezes a cultos ou celebrações religiosas do que gostaria?",
  "Um problema de audição provoca discussões com familiares?",
  "Um problema de audição dificulta ouvir TV ou rádio?",
  "Você sente que alguma dificuldade de audição limita sua vida pessoal ou social?",
  "Um problema de audição dificulta quando você está em um restaurante com parentes ou amigos?"
];

const CITATIONS = {
  humes_dosage_2014: "Humes LE et al. Dosage and duration of auditory training for older adults. J Acoust Soc Am. 2014;136(3):EL224–EL230.",
  humes_specificity_2014: "Humes LE et al. (mesmo estudo): ganho principal nos materiais treinados; generalização limitada.",
  quicksin_measure_2004: "Killion MC et al. Development of the QuickSIN. J Acoust Soc Am. 2004;116(4):2395–2405.",
  gap_training_2013: "Kishon-Rabin L et al. Improved gap detection thresholds following auditory training. Am J Audiol. 2013;22(2):343–346.",
  transfer_limits_2020: "Bieber RE, Gordon-Salant S. Improving older adults' understanding of challenging speech. Hear Res. 2020;402:108054.",
  achieve_2023: "Lin FR et al. ACHIEVE: hearing intervention and cognitive decline. Lancet. 2023;402:786–797.",
  hhie_s_screening: "Ventry IM, Weinstein BE. Identification of elderly people with hearing problems. ASHA. 1983;25(7):37–42.",
  hhie_s_administration: "HHIE-S: 10 itens; Sim=4, Às vezes=2, Não=0; 0–8 sem handicap, 10–24 leve a moderado, 26–40 significativo; ≥10 indica avaliação.",
  hhie_s_pt_br: "Adaptação brasileira: Wieselberg MB (1997). Bandas variam um pouco entre fontes (0–8 / 10–23 / 24–40 em um estudo brasileiro); reporte o escore bruto.",
  presbycusis_irreversible: "OMS: perda auditiva relacionada à idade é permanente e manejável, não reversível.",
  streaming_environment_awareness: "Precaução de segurança: streaming reduz a percepção do ambiente; não usar em escadas ou na rua.",
  tv_streaming_2024: "Streaming de TV para aparelhos auditivos: +11 a +14 pontos percentuais de reconhecimento.",
  remote_mic_2021: "Microfone remoto: +11 a +19,5 dB de SNR em adultos.",
  music_mci_2024: "Treino musical em idosos com comprometimento cognitivo leve: 8 semanas, 2x/semana.",
  clear_speech_partner_2016: "Treinar o parceiro de comunicação melhora o reconhecimento da fala dele.",
  zheng_rehab_meta_2024: "Reabilitação auditiva na presbiacusia reduz handicap autorrelatado (HHIE)."
};

const LIMITS_PT = [
  "sem grupo de controle; a mudança individual pode ser ruído de medida, prática ou cansaço",
  "o dB é relativo e não calibrado; não é comparável a audiometria nem a dB HL",
  "a voz sintética é mais uniforme e costuma ser mais fácil do que a fala humana",
  "as alternativas fechadas tornam a tarefa mais fácil do que o QuickSIN aberto",
  "as formas de teste não são formalmente equacionadas",
  "não é dispositivo médico; não faz diagnóstico nem prescrição",
  "transferência para a vida real é possível, não garantida"
];

const STOP_SIGNS_PT = [
  "perda auditiva súbita, dor, secreção, zumbido novo em um ouvido ou tontura",
  "duas sessões seguidas com queda marcada e confusão ou apatia nova",
  "apito ou som distorcido novo no aparelho",
  "cansaço persistente, sono pior ou irritabilidade depois do treino"
];

const TV_TARGETS_PT = {
  news_anchor: "entender pelo menos 80% de um bloco de 10 minutos",
  interview: "entender o ponto principal do entrevistado com uma repetição",
  soap_opera_with_questions: "acompanhar a trama e responder uma pergunta por bloco",
  film_with_music: "acompanhar o diálogo através da música e dos efeitos"
};

const MEASUREMENT_RULES_PT = [
  "mantenha o volume do aparelho fixo durante o teste; mudar invalida a comparação",
  "2 ensaios de prática por teste não contam",
  "não dê feedback de acerto durante o teste; dê feedback no treino",
  "use uma forma por momento; as formas não são formalmente equacionadas",
  "reporte a faixa junto com todo limiar",
  "se a voz for bloqueada, pare a avaliação; não troque de voz no meio do teste",
  "mudança menor que a faixa reportada não é interpretável"
];

const DEFAULT_PROFILE = {
  hearing_aid: "Rexton BiCore B M 20",
  hearing_aid_streaming: "unknown",
  tv_setup: "smart_tv",
  tv_can_configure: true,
  favourite_program: "jornal e futebol do São Paulo",
  favourite_time: "noite",
  living: "with_family",
  caregiver_hours_per_day: 4,
  top_complaints: ["tv", "noise", "group"],
  medications_ototoxic: false,
  walk_minutes_per_day: 20,
  uses_captions: true,
  tinnitus: false,
  falls_last_year: 0,
  cognitive_impairment: false
};

const DEFAULT_CONTEXT = {
  age: 90,
  device: "Rexton BiCore B M 20 (aprox. 12 anos), MFi",
  mfi: true,
  interests: "futebol São Paulo, jornal televisivo, inteligência artificial",
  complaint: "compreensão de fala no ruído, mesmo com volume alto",
  autonomy: "alta; sobe escadas diariamente"
};

const DEFAULT_STATE = {
  version: 4,
  createdAt: null,
  profile: DEFAULT_PROFILE,
  context: DEFAULT_CONTEXT,
  week: 1,
  baselineDone: false,
  completed: false,
  retentionDone: false,
  sessions: [],
  hhie: [],
  speechTests: [],
  realLife: [],
  discourse: [],
  runningSpeech: [],
  discourseLevel: "auto",
  gapTests: [],
  diary: {},
  diaryViewWeek: null,
  tv: {},
  partner: {},
  music: {},
  events: [],
  paused: false,
  ui: { large: false, contrast: false },
  settings: { voiceIndex: null, noise: "rosa", level: 1, rate: 0.9 },
  dose: { date: "", seconds: 0 },
  recentItems: [],
  legacyObjectives: []
};

function newState() {
  const s = deepCopy(DEFAULT_STATE);
  s.createdAt = new Date().toISOString();
  return s;
}

function migrateState(raw) {
  const base = newState();
  if (!raw || typeof raw !== "object") return base;
  const out = Object.assign(base, raw);
  out.profile = Object.assign(deepCopy(DEFAULT_PROFILE), raw.profile || {});
  out.context = Object.assign(deepCopy(DEFAULT_CONTEXT), raw.context || {});
  out.ui = Object.assign({ large: false, contrast: false }, raw.ui || {});
  out.settings = Object.assign({ voiceIndex: null, noise: "rosa", level: 1, rate: 0.9 }, raw.settings || {});
  if (!["auto", "D1", "D2", "D3", "D4"].includes(out.discourseLevel)) out.discourseLevel = "auto";
  out.dose = Object.assign({ date: "", seconds: 0 }, raw.dose || {});
  ["sessions", "hhie", "speechTests", "realLife", "discourse", "runningSpeech", "gapTests", "events", "recentItems", "legacyObjectives"].forEach(k => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  ["diary", "tv", "partner", "music"].forEach(k => {
    if (!out[k] || typeof out[k] !== "object") out[k] = {};
  });
  out.version = 4;
  return out;
}

const Storage = (function () {
  let mode = "memória (temporário)";
  let useLS = false;
  let useSS = false;
  const mem = {};
  try {
    localStorage.setItem("__aw_test", "1");
    localStorage.removeItem("__aw_test");
    useLS = true;
    mode = "localStorage";
  } catch (e) { /* sandbox */ }
  if (!useLS) {
    try {
      sessionStorage.setItem("__aw_test", "1");
      sessionStorage.removeItem("__aw_test");
      useSS = true;
      mode = "sessionStorage (temporário)";
    } catch (e) { /* sandbox */ }
  }
  return {
    get mode() { return mode; },
    get(key) {
      try {
        if (useLS) return localStorage.getItem(key);
        if (useSS) return sessionStorage.getItem(key);
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      } catch (e) { return mem[key] || null; }
    },
    set(key, value) {
      try {
        if (useLS) { localStorage.setItem(key, value); return true; }
        if (useSS) { sessionStorage.setItem(key, value); return true; }
        mem[key] = value; return true;
      } catch (e) { mem[key] = value; return false; }
    },
    remove(key) {
      try {
        if (useLS) localStorage.removeItem(key);
        else if (useSS) sessionStorage.removeItem(key);
        else delete mem[key];
      } catch (e) { delete mem[key]; }
    }
  };
})();

let restoredFrom = null; // "espelho" | "servidor" | null

/* ------------------------------------------------------------------ */
/* Sincronização com o servidor (tools/serve.py)                       */
/* ------------------------------------------------------------------ */
/*
 * O localStorage pertence à ORIGEM da página. Quando o preview reinicia, a URL
 * muda, a origem muda e o navegador entrega um armazenamento vazio: o progresso
 * "desaparece" mesmo tendo sido salvo. Se o app estiver sendo servido por
 * tools/serve.py, existe uma API /api/state que guarda o estado em disco. O app
 * empurra cada save para lá e, ao abrir, adota o que for mais recente.
 *
 * Em host estático (Netlify, GitHub Pages) a API responde 404: o Sync se desliga
 * sozinho e tudo continua funcionando apenas com o localStorage.
 */
const Sync = (function () {
  const API = "/api/state";
  let state_ = "unknown"; // "unknown" | "on" | "off"
  let timer = null;
  let inflight = false;
  /* null = ainda não sabemos o que há no servidor, false = tentamos e falhou,
     true = sabemos (inclusive "está vazio"). Só com true podemos enviar: sem
     isso, uma aba aberta numa origem nova (estado vazio) sobrescreveria com
     vazio o progresso que está no servidor. */
  let pulled = null;

  function canFetch() {
    try {
      return typeof window !== "undefined" && typeof window.fetch === "function" &&
        /^https?:$/.test(location.protocol);
    } catch (e) { return false; }
  }

  function payload() {
    let draft = null;
    try { draft = Storage.get(DRAFT_KEY); } catch (e) { draft = null; }
    return JSON.stringify({ savedAt: new Date().toISOString(), state: state, draft: draft });
  }

  async function probe() {
    if (state_ !== "unknown") return state_ === "on";
    if (!canFetch()) { state_ = "off"; return false; }
    try {
      const res = await window.fetch(API, { method: "GET", cache: "no-store" });
      if (res.status === 204) {
        state_ = "on";
      } else if (!res.ok) {
        state_ = "off";
      } else {
        /* host estático com fallback de SPA devolve index.html com 200:
           só aceitamos a API se o corpo for JSON do nosso formato. */
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        state_ = (data && (data.state || data.ok || data.storage)) ? "on" : "off";
      }
    } catch (e) { state_ = "off"; }
    return state_ === "on";
  }

  async function pull() {
    if (!(await probe())) { pulled = false; return null; }
    try {
      const res = await window.fetch(API, { method: "GET", cache: "no-store" });
      if (res.status === 204) { pulled = true; return null; }  // servidor vazio, e nós sabemos
      if (!res.ok) { pulled = false; return null; }
      const data = await res.json();
      pulled = true;
      return data && data.state ? data : null;
    } catch (e) { pulled = false; return null; }
  }

  /* Enviar só depois de saber o que o servidor tem. */
  function canPush() { return pulled === true; }

  async function pushNow() {
    if (DEMO_MODE || !canPush()) return false;
    if (!(await probe())) return false;
    if (inflight) return false;
    inflight = true;
    try {
      const res = await window.fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload(),
        keepalive: true
      });
      return res.ok;
    } catch (e) { return false; }
    finally { inflight = false; }
  }

  function queue(delay) {
    if (DEMO_MODE) return;
    clearTimeout(timer);
    timer = setTimeout(() => { pushNow().then(renderSyncLine); }, Math.max(250, Number(delay) || 900));
  }

  function flush() {
    clearTimeout(timer);
    if (DEMO_MODE || !canPush()) return;
    if (!canFetch()) return;
    try {
      const body = payload();
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(API, blob)) return;
      }
    } catch (e) { /* cai no push normal */ }
    pushNow();
  }

  function status() { return state_; }

  return { probe, pull, pushNow, queue, flush, status, canPush, get enabled() { return state_ === "on"; } };
})();

/* "Tem progresso" não é só ter sessão: semana avançada, avaliação feita, diário
   escrito ou qualquer histórico contam. createdAt NÃO conta — toda abertura cria
   um estado novo com createdAt. */
function hasActivity(s) {
  if (!s) return false;
  if (Number(s.week) > 1) return true;
  if (s.baselineDone || s.completed || s.retentionDone) return true;
  const lists = ["sessions", "hhie", "speechTests", "gapTests", "realLife", "runningSpeech", "discourse", "events"];
  if (lists.some(k => Array.isArray(s[k]) && s[k].length)) return true;
  if (s.diary && Object.keys(s.diary).length) return true;
  if (s.tv && Object.keys(s.tv).length) return true;
  if (s.music && Object.keys(s.music).length) return true;
  return false;
}

function renderSyncLine() {
  const el = $("#syncStatus");
  if (!el) return;
  if (DEMO_MODE) { el.textContent = "demonstração: não salva em lugar nenhum"; el.className = "small muted"; return; }
  if (Sync.status() === "on") {
    el.textContent = "Cópia no servidor ativa: se o servidor cair ou a URL mudar, o app recupera o progresso daqui.";
    el.className = "small ok";
  } else if (Sync.status() === "off") {
    el.textContent = "Sem cópia no servidor (hospedagem estática). O progresso fica neste navegador; exporte o backup para trocar de aparelho.";
    el.className = "small muted";
  } else {
    el.textContent = "Verificando cópia no servidor…";
    el.className = "small muted";
  }
}

/* Ao abrir: se o servidor tem progresso e o navegador está vazio (ou atrás),
   adota o do servidor. É isso que faz o treino voltar onde estava. */
async function restoreFromServer() {
  if (DEMO_MODE) return;
  const remote = await Sync.pull();
  renderSyncLine();
  if (!remote || !remote.state) return;

  const remoteState = remote.state;
  const localActive = hasActivity(state);
  const remoteActive = hasActivity(remoteState);
  const localAt = Date.parse(state.updatedAt || "") || 0;
  const remoteAt = Date.parse(remote.savedAt || remote.updatedAt || "") || 0;

  let adopt = false;
  let why = "";
  if (!localActive && remoteActive) { adopt = true; why = "servidor"; }
  else if (remoteActive && remoteAt > localAt + 2000) { adopt = true; why = "servidor"; }

  if (!adopt) {
    if (localActive) Sync.queue(300);
    return;
  }
  state = migrateState(remoteState);
  restoredFrom = why;
  if (remote.draft) {
    try {
      if (!Storage.get(DRAFT_KEY)) Storage.set(DRAFT_KEY, remote.draft);
    } catch (e) { /* ignore */ }
  }
  if (!DEMO_MODE) {
    diaryViewWeek = Number(state.diaryViewWeek) || Number(state.week);
    mergeHotDiary();
  }
  pendingDraft = DEMO_MODE ? null : loadDraft();
  save();
  renderAll();
  renderAssessment();
  renderResumeNotice();
  renderSyncLine();
  toast("Progresso recuperado do servidor: semana " + state.week + (state.sessions.length ? " · " + state.sessions.length + " sessão(ões)" : "") + ".");
}

function loadState() {
  let main = null;
  try {
    const raw = Storage.get(STORAGE_KEY);
    if (raw) { main = JSON.parse(raw); }
  } catch (e) { main = null; }
  if (main && typeof main === "object") return migrateState(main);

  /* A chave principal sumiu ou corrompeu: tentar o espelho antes de começar do zero. */
  try {
    const raw = Storage.get(MIRROR_KEY);
    if (raw) {
      const mirror = JSON.parse(raw);
      if (mirror && typeof mirror === "object") {
        restoredFrom = "espelho";
        return migrateState(mirror);
      }
    }
  } catch (e) { /* espelho também inválido */ }
  return newState();
}

const DEMO = new URLSearchParams(location.search).get("demo");
const DEMO_MODE = Boolean(DEMO);

function demoState() {
  const s = newState();
  s.profile = deepCopy(DEFAULT_PROFILE);
  s.context = deepCopy(DEFAULT_CONTEXT);
  s.baselineDone = true;
  s.week = 4;
  s.hhie = [
    { id: "demo-h1", timepoint: "baseline", date: "2026-09-28T10:00:00", score: 24, band: "mild_to_moderate", answers: [2, 4, 4, 2, 4, 2, 2, 4, 2, 0] },
    { id: "demo-h2", timepoint: "week4", date: "2026-10-26T10:00:00", score: 20, band: "mild_to_moderate", answers: [2, 2, 4, 2, 2, 2, 2, 4, 2, 0] }
  ];
  s.speechTests = [
    { id: "demo-s1", timepoint: "baseline", date: "2026-09-28T10:12:00", form: "A", thresholdDb: 6.0, rangeDb: 4.0, nReversals: 4, censored: false, correct: 8, trials: 12, repeats: 0, noise: "rosa", level: 2 },
    { id: "demo-s2", timepoint: "week4", date: "2026-10-26T10:12:00", form: "B", thresholdDb: 4.0, rangeDb: 4.0, nReversals: 4, censored: false, correct: 9, trials: 12, repeats: 0, noise: "rosa", level: 2 }
  ];
  s.gapTests = [
    { id: "demo-g1", timepoint: "baseline", date: "2026-09-28T10:20:00", thresholdMs: 18, lowMs: 10, highMs: 30, nReversals: 4, censored: false, falsePositiveRate: 0.0, correct: 9, trials: 12 },
    { id: "demo-g2", timepoint: "week4", date: "2026-10-26T10:20:00", thresholdMs: 14, lowMs: 8, highMs: 20, nReversals: 4, censored: false, falsePositiveRate: 0.0, correct: 10, trials: 12 }
  ];
  const dates = ["2026-10-02", "2026-10-05", "2026-10-09", "2026-10-13", "2026-10-16", "2026-10-20", "2026-10-23", "2026-10-26"];
  const accs = [62, 70, 68, 75, 78, 80, 84, 88];
  s.sessions = dates.map((d, i) => ({
    id: "demo-session-" + i,
    date: d + "T10:30:00",
    week: i < 4 ? 2 : 3,
    accuracy: accs[i],
    correct: Math.round(accs[i] * 0.08),
    total: 8,
    startSnr: 8,
    endSnr: i < 4 ? 6 : 4,
    moves: 2,
    fatigue: i % 3 === 0 ? 3 : 2,
    durationSec: 330 + i * 5,
    noise: i < 4 ? "rosa" : "casa",
    level: 1,
    rate: 0.9,
    endedOnSuccess: true
  }));
  s.diary[4] = { tv: "3-5", conv: "1-2", fatigue: 4, note: "Entendeu melhor o jornal; no restaurante ainda pede repetição.", date: "2026-10-26" };
  s.tv[4] = [true, true, false, false];
  s.partner[4] = { sessions: 1, rules: { "face": true, "noise": true, "slow": true, "rephrase": true } };
  s.music[4] = 2;
  s.settings = { voiceIndex: null, noise: "casa", level: 1, rate: 0.9 };
  return s;
}

let state = DEMO_MODE ? demoState() : loadState();
let assessment = null;
let training = null;
let pendingDraft = null;
let storageDismissed = false;
let diaryViewWeek = null;
let diaryTimer = null;
let diaryPendingWeek = null;
let planRendered = false;

let lastSavedAt = null;

function setSaveStatus(text, cls) {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "badge " + (cls || "");
}

function save() {
  if (DEMO_MODE) {
    setSaveStatus("demo: não salva", "err");
    return true;
  }
  state.updatedAt = new Date().toISOString();
  let serialized = null;
  try { serialized = JSON.stringify(state); } catch (e) { serialized = null; }
  const ok = serialized ? Storage.set(STORAGE_KEY, serialized) : false;
  /* Espelho separado: sobrevive a uma chave principal corrompida/cheia. */
  if (ok && serialized) Storage.set(MIRROR_KEY, serialized);
  if (ok) lastSavedAt = new Date();
  if (ok) Sync.queue();
  setSaveStatus(ok ? "salvo " + clockLabel(lastSavedAt) : "falha ao salvar", ok ? "ok" : "err");
  if (!ok) toast("Não foi possível salvar: armazenamento cheio ou bloqueado. Exporte o backup.");
  return ok;
}

/* --------------------------- rascunho da sessão --------------------------- */

function draftSnapshot() {
  if (!training) return null;
  const t = training;
  return {
    version: 4,
    savedAt: new Date().toISOString(),
    week: t.week,
    phase: t.phase,
    core: t.core,
    idx: t.idx,
    current: t.current,
    isWarmup: t.isWarmup,
    snr: t.snr,
    startSnr: t.startSnr,
    endSnr: t.endSnr,
    correctStreak: t.correctStreak,
    errorStreak: t.errorStreak,
    moves: t.moves,
    results: t.results,
    noise: t.noise,
    level: t.level,
    rate: t.rate,
    elapsedSec: trainingElapsedSeconds(),
    answered: Boolean(t.answered),
    lastAnswerCorrect: t.lastAnswerCorrect,
    closingAttempts: t.closingAttempts,
    gapDone: Boolean(t.gapDone),
    gapPlan: t.gapPlan,
    capReached: Boolean(t.capReached),
    savedId: t.savedId || null
  };
}

/* The draft survives a reload, an accidental tab close or iOS discarding the
   page while another app is open. It is not the session record: it only lets
   the participant continue an unfinished session. */
function saveDraft() {
  if (DEMO_MODE || !training) return false;
  try {
    return Storage.set(DRAFT_KEY, JSON.stringify(draftSnapshot()));
  } catch (e) {
    return false;
  }
}

function clearDraft() {
  try { Storage.remove(DRAFT_KEY); } catch (e) { /* ignore */ }
}

function loadDraft() {
  let raw = null;
  try { raw = Storage.get(DRAFT_KEY); } catch (e) { return null; }
  if (!raw) return null;
  let d = null;
  try { d = JSON.parse(raw); } catch (e) { clearDraft(); return null; }
  if (!d || d.version !== 4 || !d.phase || !Array.isArray(d.core) || !d.core.length) {
    clearDraft();
    return null;
  }
  if (d.savedId) { clearDraft(); return null; }
  const age = Date.now() - new Date(d.savedAt || 0).getTime();
  if (!isFinite(age) || age < 0 || age > DRAFT_MAX_AGE_MS) { clearDraft(); return null; }
  return d;
}

function discardDraft(message) {
  clearDraft();
  pendingDraft = null;
  renderResumeNotice();
  renderTraining();
  if (message) toast(message);
}

function resumeCardHtml(idPrefix) {
  const d = pendingDraft;
  const place = d.phase === "warmup" ? "aquecimento" : (d.phase === "core" ? "item " + (d.idx + 1) + " de " + d.core.length : "fechamento");
  return "<div class='card warn' style='margin:10px 0'><h2>Sessão interrompida</h2>" +
    "<p class='small'>Semana " + esc(d.week) + " · " + esc(place) + " · parou às " + esc(clockLabel(d.savedAt)) + ".</p>" +
    "<p class='small muted'>O progresso foi guardado automático. Nada do que você já respondeu foi perdido.</p>" +
    "<button id='" + idPrefix + "Resume' class='ok big'>Retomar de onde parou</button>" +
    "<button id='" + idPrefix + "Discard' class='ghost small'>Descartar esta sessão</button></div>";
}

function bindResumeCard(idPrefix) {
  const r = $("#" + idPrefix + "Resume");
  if (r) r.addEventListener("click", resumeTraining);
  const d = $("#" + idPrefix + "Discard");
  if (d) d.addEventListener("click", () => {
    if (!confirm("Descartar a sessão interrompida? As respostas dela não entram no histórico.")) return;
    discardDraft("Sessão interrompida descartada.");
  });
}

function resumeTraining() {
  const d = pendingDraft;
  if (!d) return;
  const cfg = weekConfig(protocolFor(), d.week);
  training = Object.assign({}, d, {
    cfg: cfg,
    startTime: Date.now(),
    elapsedSec: Number(d.elapsedSec) || 0,
    savedId: d.savedId || null,
    capReached: Boolean(d.capReached)
  });
  pendingDraft = null;
  renderResumeNotice();
  setTab("treino");
  if (training.phase === "finished") {
    finishTrainingAndSave();
    renderTrainingSummary();
    return;
  }
  renderTraining();
  toast("Sessão retomada de onde parou.");
}

function renderResumeNotice() {
  const box = $("#resumeNotice");
  if (!box) return;
  if (!pendingDraft || training) { box.innerHTML = ""; return; }
  box.innerHTML = resumeCardHtml("resumeHome");
  bindResumeCard("resumeHome");
}

/* ------------------------------------------------------------------ */
/* Voz                                                                 */
/* ------------------------------------------------------------------ */

const Voice = {
  voices: [],
  blocked: false,
  started: false,
  current: null,
  keep: null,
  watchdog: null,
  hardTimer: null,
  loading: false,

  load() {
    if (!("speechSynthesis" in window)) {
      this.blocked = true;
      this.renderStatus();
      this.showBanner("Este navegador não oferece síntese de fala.");
      return;
    }
    const all = window.speechSynthesis.getVoices() || [];
    const pt = all.filter(v => {
      const lang = String(v.lang || "").toLowerCase();
      return lang.indexOf("pt-br") === 0 || lang === "pt" || /brasil|brazil/i.test(String(v.name || ""));
    });
    this.voices = pt.length ? pt : all.filter(v => String(v.lang || "").toLowerCase().indexOf("pt") === 0);
    this.voices.sort((a, b) => this.rank(b) - this.rank(a));
    this.populateSelect();
    this.renderStatus();
  },

  rank(v) {
    const n = String(v.name || "");
    if (/google/i.test(n)) return 5;
    if (/neural|natural/i.test(n)) return 4;
    if (/microsoft|luciana|fernanda|francisca/i.test(n)) return 3;
    if (/apple|siri|joana/i.test(n)) return 2;
    return 1;
  },

  populateSelect() {
    const sel = $("#voiceSelect");
    if (!sel) return;
    sel.innerHTML = "";
    if (!this.voices.length) {
      const op = document.createElement("option");
      op.value = "";
      op.textContent = "Voz padrão do navegador (pt-BR)";
      sel.appendChild(op);
      return;
    }
    this.voices.forEach((v, i) => {
      const op = document.createElement("option");
      op.value = String(i);
      op.textContent = "🇧🇷 " + v.name + " (" + (v.lang || "pt") + ")";
      sel.appendChild(op);
    });
    const idx = state.settings.voiceIndex;
    if (idx != null && this.voices[idx]) sel.value = String(idx);
    else if (this.voices.length) { state.settings.voiceIndex = 0; sel.value = "0"; }
  },

  pick() {
    const idx = state.settings.voiceIndex;
    if (idx != null && this.voices[idx]) return this.voices[idx];
    return this.voices[0] || null;
  },

  clear() {
    clearInterval(this.keep);
    clearTimeout(this.watchdog);
    clearTimeout(this.hardTimer);
    this.keep = null;
    this.watchdog = null;
    this.hardTimer = null;
  },

  showBanner(message) {
    this.blocked = true;
    const banner = $("#voiceBanner");
    if (banner) banner.classList.remove("hidden");
    const text = $("#voiceBannerText");
    if (text && message) text.textContent = message;
    this.renderStatus();
  },

  hideBanner() {
    const banner = $("#voiceBanner");
    if (banner) banner.classList.add("hidden");
    this.renderStatus();
  },

  renderStatus() {
    const badge = $("#voiceBadge");
    if (badge) {
      badge.textContent = this.blocked ? "voz bloqueada" : "voz disponível";
      badge.className = "badge " + (this.blocked ? "err" : "ok");
    }
    const st = $("#voiceStatus");
    if (st) {
      st.textContent = this.blocked
        ? "A síntese de fala está bloqueada neste ambiente. Abra em janela completa ou publique em https."
        : (this.voices.length ? this.voices.length + " voz(es) pt-BR encontradas. Teste antes de avaliar." : "Nenhuma voz pt-BR listada; o navegador usará a voz padrão.");
    }
  },

  ensure() {
    if (!("speechSynthesis" in window)) {
      this.showBanner("Este navegador não oferece síntese de fala.");
      return false;
    }
    if (this.blocked) {
      this.showBanner("A voz está bloqueada neste ambiente. Abra em janela completa ou use https.");
      return false;
    }
    return true;
  },

  speak(text, rate) {
    return new Promise(resolve => {
      if (!("speechSynthesis" in window)) {
        this.showBanner("Este navegador não oferece síntese de fala.");
        resolve(false);
        return;
      }
      this.clear();
      this.started = false;
      try { window.speechSynthesis.cancel(); } catch (e) { /* iOS exige cancel antes */ }
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "pt-BR";
      utt.rate = Number(rate) || 0.95;
      utt.volume = 1;
      const voice = this.pick();
      if (voice) utt.voice = voice;
      this.current = utt;

      utt.onstart = () => {
        this.started = true;
        this.blocked = false;
        this.hideBanner();
        this.keep = setInterval(() => {
          try {
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) window.speechSynthesis.resume();
          } catch (e) { /* ignore */ }
        }, 5000);
      };
      utt.onend = () => {
        this.clear();
        resolve(true);
      };
      utt.onerror = () => {
        this.clear();
        if (!this.started) this.showBanner("A voz não iniciou. O ambiente bloqueia a síntese de fala.");
        resolve(false);
      };

      this.watchdog = setTimeout(() => {
        if (!this.started) {
          this.showBanner("A voz não iniciou em 2,5 s. O ambiente bloqueia a síntese de fala.");
        }
      }, 2500);

      this.hardTimer = setTimeout(() => {
        if (!this.started) {
          this.showBanner("A voz não iniciou. Abra em janela completa ou use https.");
          resolve(false);
        }
      }, 12000);

      try {
        window.speechSynthesis.speak(utt);
      } catch (e) {
        this.clear();
        this.showBanner("Falha ao iniciar a voz: " + e.message);
        resolve(false);
      }
    });
  },

  cancel() {
    this.clear();
    try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
};

/* ------------------------------------------------------------------ */
/* Áudio (Web Audio API)                                               */
/* ------------------------------------------------------------------ */

const Audio = {
  ctx: null,
  master: null,
  noiseGain: null,
  nodes: [],
  intervals: [],
  transients: [],
  playing: false,
  type: null,
  level: 1,

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API indisponível neste navegador");
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseGain.connect(this.master);
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  pinkBuffer(seconds) {
    const secs = seconds || 3;
    const len = Math.floor(this.ctx.sampleRate * secs);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buf;
  },

  baseLevel(level) {
    return [0, 0.07, 0.12, 0.20][Math.max(0, Math.min(3, Number(level) || 0))];
  },

  setSnr(snrDb) {
    if (!this.ctx || !this.noiseGain) return;
    const base = this.baseLevel(this.level);
    const gain = Math.max(0, Math.min(0.8, base * Math.pow(10, -Number(snrDb) / 20)));
    this.noiseGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
  },

  setLevel(level) {
    this.level = Number(level) || 1;
    this.setSnr(this._lastSnr == null ? 0 : this._lastSnr);
  },

  babble(dest, count, base) {
    const self = this;
    const voices = [];
    for (let i = 0; i < count; i++) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 95 + Math.random() * 120;
      const f1 = this.ctx.createBiquadFilter();
      f1.type = "bandpass"; f1.frequency.value = 400 + Math.random() * 300; f1.Q.value = 2;
      const f2 = this.ctx.createBiquadFilter();
      f2.type = "bandpass"; f2.frequency.value = 1200 + Math.random() * 900; f2.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(f1); f1.connect(g);
      o.connect(f2); f2.connect(g);
      g.connect(dest);
      o.start();
      voices.push({ o: o, g: g, base: base });
      this.nodes.push(o, f1, f2, g);
    }
    const int = setInterval(() => {
      voices.forEach(v => {
        const on = Math.random() < 0.55;
        v.g.gain.setTargetAtTime(on ? v.base * (0.6 + Math.random() * 0.8) : 0, self.ctx.currentTime, 0.08);
        if (on) v.o.frequency.setTargetAtTime(95 + Math.random() * 130, self.ctx.currentTime, 0.25);
      });
    }, 420);
    this.intervals.push(int);
  },

  clink(dest) {
    const len = Math.floor(this.ctx.sampleRate * 0.09);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2200 + Math.random() * 1500; f.Q.value = 9;
    const g = this.ctx.createGain(); g.gain.value = 0.12;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start();
    this.transients.push(src);
  },

  startNoise(type, level) {
    this.init();
    this.stopNoise();
    this.type = type || "rosa";
    this.level = Number(level) || 1;
    this.playing = true;
    this.noiseGain.gain.value = this.baseLevel(this.level);
    const dest = this.noiseGain;
    const buffer = this.pinkBuffer(3);

    const loop = () => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer; src.loop = true;
      return src;
    };

    if (this.type === "rosa") {
      const src = loop();
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1000;
      const g = this.ctx.createGain(); g.gain.value = 1;
      src.connect(f); f.connect(g); g.connect(dest); src.start();
      this.nodes.push(src, f, g);
    } else if (this.type === "casa") {
      const o60 = this.ctx.createOscillator(); o60.type = "sine"; o60.frequency.value = 60;
      const g60 = this.ctx.createGain(); g60.gain.value = 0.30;
      o60.connect(g60); g60.connect(dest); o60.start();
      const o120 = this.ctx.createOscillator(); o120.type = "sine"; o120.frequency.value = 120;
      const g120 = this.ctx.createGain(); g120.gain.value = 0.16;
      o120.connect(g120); g120.connect(dest); o120.start();
      const src = loop();
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 150;
      const g = this.ctx.createGain(); g.gain.value = 0.7;
      src.connect(f); f.connect(g); g.connect(dest); src.start();
      this.nodes.push(o60, g60, o120, g120, src, f, g);
      this.babble(dest, 2, 0.05);
      const int = setInterval(() => { if (Math.random() < 0.45) this.clink(dest); }, 5200);
      this.intervals.push(int);
    } else if (this.type === "restaurante") {
      const src = loop();
      const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 0.8;
      const g = this.ctx.createGain(); g.gain.value = 0.55;
      src.connect(f); f.connect(g); g.connect(dest); src.start();
      this.nodes.push(src, f, g);
      this.babble(dest, 3, 0.09);
    } else if (this.type === "tv") {
      this.babble(dest, 2, 0.07);
      const mel = fr => {
        const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = fr;
        const g = this.ctx.createGain(); g.gain.value = 0.05;
        const l = this.ctx.createOscillator(); l.frequency.value = 0.1 + Math.random() * 0.2;
        const p = this.ctx.createGain(); p.gain.value = fr * 0.3;
        l.connect(p); p.connect(o.frequency); l.start();
        o.connect(g); g.connect(dest); o.start();
        this.nodes.push(o, g, l, p);
      };
      mel(220); mel(330);
      const src = loop();
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 800;
      const g = this.ctx.createGain(); g.gain.value = 0.55;
      src.connect(f); f.connect(g); g.connect(dest); src.start();
      this.nodes.push(src, f, g);
    }
  },

  stopNoise() {
    this.intervals.forEach(i => clearInterval(i));
    this.intervals = [];
    this.nodes.forEach(n => {
      try { if (n.stop) n.stop(); } catch (e) { /* já parado */ }
      try { n.disconnect(); } catch (e) { /* ignore */ }
    });
    this.nodes = [];
    this.playing = false;
    if (this.noiseGain) this.noiseGain.gain.value = 0;
  },

  playGap(hasGap, gapMs) {
    const ac = this.init();
    const dur = 0.7;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (hasGap) {
      const start = Math.floor(0.35 * ac.sampleRate);
      const gapLen = Math.max(1, Math.floor((gapMs / 1000) * ac.sampleRate));
      const ramp = Math.max(1, Math.floor(0.002 * ac.sampleRate));
      for (let i = 0; i < gapLen; i++) {
        const idx = start + i;
        if (idx < len) d[idx] = 0;
      }
      for (let i = 0; i < ramp; i++) {
        const a = start - ramp + i;
        const b = start + gapLen + i;
        if (a >= 0) d[a] *= i / ramp;
        if (b < len) d[b] *= 1 - i / ramp;
      }
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1000; f.Q.value = 0.5;
    const g = ac.createGain(); g.gain.value = 0.32;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.transients.push(src);
  },

  playTone(freq, dur) {
    const ac = this.init();
    const o = ac.createOscillator();
    o.type = "sine"; o.frequency.value = freq;
    const g = ac.createGain();
    const t = ac.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },

  test(type, ms) {
    this.startNoise(type, 2);
    setTimeout(() => this.stopNoise(), ms || 4000);
  },

  stopAll() {
    this.stopNoise();
    this.transients.forEach(n => { try { n.stop(); } catch (e) { /* ignore */ } });
    this.transients = [];
  }
};

/* ------------------------------------------------------------------ */
/* Helpers de protocolo e estado                                        */
/* ------------------------------------------------------------------ */

function engine() {
  if (!window.SwarmEngine || !window.SwarmEngine.buildProtocol) return null;
  return window.SwarmEngine;
}

function protocolFor(profile) {
  const e = engine();
  if (!e) return null;
  try { return e.buildProtocol(profile || state.profile); }
  catch (err) { console.error(err); return null; }
}

function trainingTiers(week) {
  const protocol = protocolFor();
  const ladder = protocol && protocol.content && protocol.content.training_ladder;
  if (ladder) {
    const row = ladder.find(r => (r.weeks || []).indexOf(Number(week)) >= 0);
    if (row && row.tiers && row.tiers.length) return row.tiers;
  }
  const fallback = { 1: ["N1", "N2"], 2: ["N1", "N2"], 3: ["N2", "N3"], 4: ["N2", "N3"], 5: ["N3"], 6: ["N3"], 7: ["N3", "N4"], 8: ["N3", "N4"] };
  return fallback[Number(week)] || ["N2"];
}

function weekConfig(protocol, week) {
  if (!protocol || !protocol.training || !protocol.training.weeks) return null;
  return protocol.training.weeks[Math.max(0, Math.min(7, (week || 1) - 1))] || null;
}

const NOISE_LABELS = {
  rosa: "Ruído rosa",
  casa: "Casa (ruído de fundo)",
  restaurante: "Restaurante (vozes)",
  tv: "TV / vozes"
};

const FOCUS_LABELS = {
  "familiarisation after the baseline (not scored)": "familiarização depois da linha de base (não conta)",
  "establish the routine; end on a correct item": "criar rotina; terminar em um acerto",
  "add household noise; keep speech slower": "acrescentar ruído de casa; fala mais lenta",
  "add babble of voices; interim assessment": "acrescentar vozes; avaliação intermediária",
  "gap detection and restaurant noise": "detecção de pausa e ruído de restaurante",
  "normal speech rate; transfer to TV content": "velocidade normal; transferir para TV",
  "hardest noise; group conversation practice": "ruído mais difícil; conversa em grupo",
  "final assessment and maintenance plan": "avaliação final e plano de manutenção"
};

function noiseLabel(name) {
  return NOISE_LABELS[name] || name || "—";
}

function focusLabel(text) {
  return FOCUS_LABELS[text] || text || "—";
}

function snrText(value) {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return (n > 0 ? "+" : "") + n + " dB relativo";
}

/* The engine plans noise, level and rate per week. The participant can
   override them, but only for the current week; changing week restores the
   deterministic plan. */
function effectiveSettings(cfg) {
  if (!cfg) {
    return {
      noise: state.settings.noise || "rosa",
      level: Number(state.settings.level) || 1,
      rate: Number(state.settings.rate) || 0.9
    };
  }
  const overridden = Number(state.settings.overrideWeek) === Number(state.week);
  return {
    noise: overridden ? state.settings.noise : cfg.noise,
    level: overridden ? Number(state.settings.level) : Number(cfg.noise_level),
    rate: overridden ? Number(state.settings.rate) : Number(cfg.rate)
  };
}

function sessionsThisWeek() {
  return state.sessions.filter(s => Number(s.week) === Number(state.week)).length;
}

/* Adesão é contada em DIAS com treino, não em sessões: fazer duas sessões no
   mesmo dia é permitido e não pode "completar" a semana sozinho. */
function trainingDaysThisWeek() {
  const days = {};
  state.sessions
    .filter(s => Number(s.week) === Number(state.week))
    .forEach(s => { days[localDayKey(s.date)] = true; });
  return Object.keys(days).length;
}

function sessionsToday() {
  const t = todayKey();
  return state.sessions.filter(s => localDayKey(s.date) === t).length;
}

function trainingElapsedSeconds() {
  if (!training) return 0;
  const carried = Number(training.elapsedSec) || 0;
  return carried + Math.max(0, (Date.now() - training.startTime) / 1000);
}

function doseCapReached() {
  return Boolean(training) && (doseToday() + trainingElapsedSeconds()) >= DOSE_CAP_SECONDS;
}

function doseToday() {
  if (!state.dose || state.dose.date !== todayKey()) return 0;
  return Number(state.dose.seconds) || 0;
}

function addDose(seconds) {
  if (!state.dose || state.dose.date !== todayKey()) state.dose = { date: todayKey(), seconds: 0 };
  state.dose.seconds = Number(state.dose.seconds || 0) + Math.max(0, Math.round(seconds));
  save();
}

function latestByTimepoint(list, tp) {
  const arr = (list || []).filter(x => x.timepoint === tp);
  if (!arr.length) return null;
  return arr.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

function latestOverall(list) {
  const arr = (list || []).slice();
  if (!arr.length) return null;
  return arr.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

function bandLabel(band) {
  return {
    no_perceived_handicap: "sem handicap percebido",
    mild_to_moderate: "leve a moderado",
    significant: "significativo"
  }[band] || band || "—";
}

function timepointLabel(tp) {
  return {
    baseline: "Linha de base",
    week4: "Semana 4",
    week8: "Semana 8",
    retention: "Seguimento (30 dias)"
  }[tp] || tp;
}

function formForTimepoint(tp) {
  return { baseline: "A", week4: "B", week8: "C", retention: "A" }[tp] || "A";
}

function protocolTimepoint() {
  if (!state.baselineDone) return "baseline";
  if (state.week >= 8 && !state.retentionDone) return "week8";
  if (state.week >= 4) return "week4";
  return "baseline";
}

/* ------------------------------------------------------------------ */
/* Render: cabeçalho, abas, início                                     */
/* ------------------------------------------------------------------ */

function renderHeader() {
  const sb = $("#storageBadge");
  if (sb) {
    sb.textContent = DEMO_MODE ? "demonstração (não salva)" : Storage.mode;
    sb.className = "badge " + (DEMO_MODE ? "err" : (Storage.mode === "localStorage" ? "ok" : "err"));
  }
  Voice.renderStatus();
}

function renderStorageBanner() {
  const banner = $("#storageBanner");
  if (!banner) return;
  const blocked = !DEMO_MODE && Storage.mode !== "localStorage" && !storageDismissed;
  banner.classList.toggle("hidden", !blocked);
}

/* Called when the tab is hidden or closed. iOS Safari can discard a page while
   another app is open, so the unfinished session is written before that. */
function flushSession() {
  flushDiary();
  if (training) {
    if (training.phase === "finished") finishTrainingAndSave();
    else saveDraft();
    save();
  }
  /* mesmo sem sessão aberta, garantir que o servidor tem a última versão */
  Sync.flush();
}

function setTab(name) {
  $$(".tab").forEach(btn => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle("active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  $$(".tab-panel").forEach(p => p.classList.add("hidden"));
  const panel = $("#tab-" + name);
  if (panel) panel.classList.remove("hidden");
  flushDiary();
  Voice.cancel();
  Audio.stopNoise();
  if (name === "inicio") renderHome();
  if (name === "avaliacao") { renderAssessmentButtons(); renderAssessmentHistory(); renderAssessment(); }
  if (name === "treino") { renderTrainingConfig(); renderTrainingHistory(); renderTraining(); renderDiscourse(); }
  if (name === "vida") renderVida();
  if (name === "relatorio") renderReport();
  if (name === "plano") { renderPlanForms(); }
  if (name === "ajustes") renderSettings();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderLevelCards() {
  const box = $("#levelCards");
  if (!box) return;
  const cards = [
    { t: "Funcional (primário)", d: "HHIE-S, 10 perguntas, 0–40. Mede handicap percebido. É o desfecho mais próximo da vida real e o único primário.", cls: "ok" },
    { t: "Tarefa treinada", d: "Fala em ruído com 4 alternativas. O número é um SNR relativo, não QuickSIN e não audiograma.", cls: "warn" },
    { t: "Transferência", d: "Formas de frase que nunca aparecem no treino. A evidência mostra transferência limitada e incerta.", cls: "warn" },
    { t: "Temporal (gap)", d: "Detecção de pausa. O treino melhora a tarefa treinada; transferência para fala não foi estabelecida.", cls: "warn" }
  ];
  box.innerHTML = cards.map(c =>
    "<div class='card " + c.cls + "' style='margin:0'><strong>" + esc(c.t) + "</strong><p class='small' style='margin:6px 0 0'>" + esc(c.d) + "</p></div>"
  ).join("");
}

function renderStops() {
  const box = $("#stopsList");
  if (!box) return;
  box.innerHTML = STOP_SIGNS_PT.map(s => "<li>" + esc(s) + "</li>").join("");
}

function renderHome() {
  renderHeader();
  const protocol = protocolFor();
  const cfg = weekConfig(protocol, state.week);
  const sel = $("#weekSelect");
  if (sel) {
    sel.innerHTML = "";
    for (let i = 1; i <= 8; i++) {
      const op = document.createElement("option");
      op.value = String(i);
      op.textContent = "Semana " + i + (i === 4 || i === 8 ? " (avaliação)" : "");
      if (i === Number(state.week)) op.selected = true;
      sel.appendChild(op);
    }
  }
  const summary = $("#planSummary");
  if (summary && cfg) {
    const doseMin = Math.floor(doseToday() / 60);
    const planned = cfg.sessions_planned;
    const done = trainingDaysThisWeek();
    const sessionCount = sessionsThisWeek();
    const pct = planned ? Math.min(100, Math.round(done / planned * 100)) : 0;
    const eff = effectiveSettings(cfg);
    summary.innerHTML =
      (state.baselineDone ? "" : "<div class='card warn' style='margin-bottom:10px'><strong>Sem avaliação inicial.</strong> O treino está liberado; só não há linha de base para comparar mudança depois. <button id='btnBaselineFromTraining' class='small'>Fazer avaliação</button></div>") +
      "<div class='kv'><span>Foco da semana</span><span class='v'>" + esc(focusLabel(cfg.focus)) + "</span></div>" +
      "<div class='kv'><span>Dias treinados</span><span class='v'>" + esc(done) + " / " + esc(planned) + " nesta semana" + (sessionCount > done ? " · " + esc(sessionCount) + " sessões" : "") + "</span></div>" +
      "<div class='kv'><span>Dose de hoje</span><span class='v'>" + esc(doseMin) + " / 10 min" + (doseMin >= 10 ? " · teto atingido" : " · restam " + esc(Math.max(0, 10 - doseMin)) + " min") + "</span></div>" +
      "<div class='kv'><span>Sessões salvas</span><span class='v'>" + esc(state.sessions.length) + " no histórico</span></div>" +
      "<div class='kv'><span>Ruído recomendado</span><span class='v'>" + esc(noiseLabel(eff.noise)) + " · nível " + esc(eff.level) + "</span></div>" +
      "<div class='kv'><span>Início de SNR</span><span class='v'>" + esc(snrText(cfg.snr_start_db)) + "</span></div>" +
      "<div class='progress'><div style='width:" + pct + "%'></div></div>";
    const goBase = $("#btnBaselineFromTraining");
    if (goBase) goBase.addEventListener("click", () => setTab("avaliacao"));
  }
  const baselineBadge = $("#baselineBadge");
  if (baselineBadge) {
    baselineBadge.textContent = state.baselineDone ? "avaliação inicial feita" : "avaliação inicial pendente";
    baselineBadge.className = "badge " + (state.baselineDone ? "ok" : "err");
  }
  const pausedBadge = $("#pausedBadge");
  if (pausedBadge) {
    pausedBadge.textContent = state.paused ? "treino pausado por evento" : "treino liberado";
    pausedBadge.className = "badge " + (state.paused ? "err" : "ok");
  }
  const btnStart = $("#btnStartTraining");
  if (btnStart) btnStart.disabled = state.paused;
  const btnBase = $("#btnStartAssessment");
  if (btnBase) {
    btnBase.classList.toggle("hidden", state.baselineDone);
    btnBase.textContent = "Fazer avaliação inicial";
  }
  const btnWeek = $("#btnWeekAssessment");
  if (btnWeek) {
    const tp = state.week >= 8 ? "week8" : (state.week >= 4 ? "week4" : null);
    const existing = tp ? latestByTimepoint(state.hhie, tp) : null;
    const show = Boolean(state.baselineDone && tp && !existing);
    btnWeek.classList.toggle("hidden", !show);
    if (tp) btnWeek.textContent = "Fazer avaliação da " + timepointLabel(tp);
    btnWeek.dataset.timepoint = tp || "";
  }
  const action = $("#weekAction");
  if (action) {
    action.innerHTML = "";
    if (!state.baselineDone) {
      action.innerHTML = "<div class='card warn' style='margin:10px 0'><strong>Avaliação inicial pendente (opcional).</strong> Você pode treinar agora: o treino não fica travado. A avaliação serve para ter uma referência — sem ela o app não consegue dizer se houve mudança. <button id='btnGoAssessment' class='small' style='margin-top:8px'>Fazer a avaliação depois</button></div>";
      const goA = $("#btnGoAssessment");
      if (goA) goA.addEventListener("click", () => setTab("avaliacao"));
    } else if (cfg && trainingDaysThisWeek() >= cfg.sessions_planned) {
      const isAssessment = state.week === 4 || state.week === 8;
      const done = isAssessment && latestByTimepoint(state.hhie, state.week === 4 ? "week4" : "week8");
      if (isAssessment && !done) {
        action.innerHTML = "<div class='card ok' style='margin:10px 0'><strong>Semana concluída.</strong> Agora faça a avaliação da " + timepointLabel(state.week === 4 ? "week4" : "week8") + ". Ela usa uma forma de frase não treinada.</div>";
      } else if (state.week < 8) {
        action.innerHTML = "<div class='card ok' style='margin:10px 0'><strong>Semana concluída.</strong> Avance quando quiser; o app não pune semana perdida.</div><button id='btnAdvanceWeek' class='primary big'>Avançar para a semana " + (state.week + 1) + "</button>";
        const b = $("#btnAdvanceWeek");
        if (b) b.addEventListener("click", () => {
          flushDiary();
          state.week = Math.min(8, state.week + 1);
          diaryViewWeek = state.week;
          state.diaryViewWeek = state.week;
          save();
          renderHome();
          toast("Semana " + state.week + " selecionada.");
        });
      } else {
        action.innerHTML = "<div class='card ok' style='margin:10px 0'><strong>Protocolo de 8 semanas concluído.</strong> Faça o seguimento de 30 dias quando completar.</div>";
      }
    }
  }
  const stage = $("#btnWeekAssessment");
  if (stage && !stage.dataset.bound) {
    stage.dataset.bound = "1";
    stage.addEventListener("click", () => {
      const tp = stage.dataset.timepoint;
      if (tp) startAssessment(tp);
    });
  }
  const release = $("#btnRelease");
  if (release) release.classList.toggle("hidden", !state.paused);
  renderResumeNotice();
  renderLevelCards();
  renderStops();
  applyUI();
}

/* ------------------------------------------------------------------ */
/* Avaliação: HHIE-S, fala em ruído, gap                               */
/* ------------------------------------------------------------------ */

function startAssessment(tp) {
  if (!Voice.ensure()) {
    setTab("avaliacao");
    toast("Voz bloqueada: abra em janela completa antes de avaliar.");
    return;
  }
  if (tp === "baseline" && state.baselineDone) {
    if (!confirm("A linha de base já foi feita. Refazer agora criará um novo registro. Continuar?")) return;
  }
  assessment = {
    timepoint: tp,
    form: formForTimepoint(tp),
    step: 1,
    startedAt: new Date().toISOString(),
    hhie: null,
    hhieAnswers: new Array(10).fill(null),
    speechTest: null,
    realLifeTest: null,
    realLifeDone: false,
    runningTest: null,
    runningDone: false,
    gapTest: null
  };
  setTab("avaliacao");
  renderAssessment();
}

function renderAssessmentButtons() {
  const box = $("#assessmentButtons");
  if (!box) return;
  const items = [
    { tp: "baseline", label: "Linha de base", note: "obrigatória antes do treino", enabled: true },
    { tp: "week4", label: "Semana 4", note: "reavaliação intermediária", enabled: state.week >= 4 },
    { tp: "week8", label: "Semana 8", note: "reavaliação final", enabled: state.week >= 8 },
    { tp: "retention", label: "Seguimento 30 dias", note: "retenção", enabled: state.baselineDone }
  ];
  box.innerHTML = items.map(it => {
    const done = latestByTimepoint(state.hhie, it.tp) || latestByTimepoint(state.speechTests, it.tp);
    const status = done ? "feito em " + fmtDay(done.date) : "pendente";
    return "<button class='big " + (it.enabled ? "" : "ghost") + "' data-start-assessment='" + it.tp + "' " + (it.enabled ? "" : "disabled") + ">" +
      "<strong>" + esc(it.label) + "</strong><br><span class='small muted'>" + esc(it.note) + " · " + esc(status) + "</span></button>";
  }).join("");
  $$("[data-start-assessment]", box).forEach(btn => {
    btn.addEventListener("click", () => startAssessment(btn.dataset.startAssessment));
  });
}

function renderAssessment() {
  const area = $("#assessmentArea");
  if (!area) return;
  if (!assessment) {
    area.innerHTML = "<div class='card'><h2>Como funciona</h2><p>A avaliação tem quatro partes: HHIE-S (10 perguntas), fala em ruído (2 de prática + 12 medidas), <strong>vida real</strong> (4 frases longas do dia a dia, opcional) e gap (2 de prática + 12 com pausa + 4 sem pausa de controle). Não há feedback de acerto nos testes. O volume do aparelho deve ficar fixo do início ao fim.</p><p class='small muted'>A voz sintética e o ruído gerado no navegador não são calibrados. Os números servem para acompanhar a mesma pessoa ao longo do tempo, não para comparar com audiometria ou com QuickSIN.</p><details><summary>Regras do teste</summary><ul>" + MEASUREMENT_RULES_PT.map(r => "<li>" + esc(r) + "</li>").join("") + "</ul></details><p class='small'>Escolha um momento na lista acima para começar.</p></div>";
    return;
  }
  const steps = ["HHIE-S", "Fala em ruído", "Compreensão", "Gap", "Resultados"];
  const bar = "<div class='stepbar'>" + steps.map((s, i) => "<span class='" + (i === assessment.step - 1 ? "active" : (i < assessment.step - 1 ? "done" : "")) + "'>" + esc(s) + "</span>").join("") + "</div>";
  if (assessment.step === 1) { area.innerHTML = bar + "<div id='hhieArea'></div>"; renderHHIE(); }
  else if (assessment.step === 2) { area.innerHTML = bar + "<div id='speechArea'></div>"; renderSpeechTest(); }
  else if (assessment.step === 3) { area.innerHTML = bar + "<div id='realLifeArea'></div><div id='runningArea'></div>"; renderComprehensionStep(); }
  else if (assessment.step === 4) { area.innerHTML = bar + "<div id='gapArea'></div>"; renderGapTest(); }
  else { area.innerHTML = bar + "<div id='resultsArea'></div>"; renderAssessmentResults(); }
}

function renderAssessmentHistory() {
  const box = $("#assessmentHistory");
  if (!box) return;
  const hhie = state.hhie.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const speech = state.speechTests.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const gap = state.gapTests.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  let html = "<table><thead><tr><th>Medida</th><th>Momento</th><th>Data</th><th>Resultado</th></tr></thead><tbody>";
  hhie.slice(0, 8).forEach(r => {
    html += "<tr><td>HHIE-S</td><td>" + esc(timepointLabel(r.timepoint)) + "</td><td>" + esc(fmtDay(r.date)) + "</td><td><strong>" + esc(r.score) + "/40</strong> · " + esc(bandLabel(r.band)) + "</td></tr>";
  });
  speech.slice(0, 8).forEach(r => {
    html += "<tr><td>Fala em ruído</td><td>" + esc(timepointLabel(r.timepoint)) + "</td><td>" + esc(fmtDay(r.date)) + "</td><td><strong>" + esc(r.thresholdDb) + " dB</strong>" + (r.rangeDb == null ? "" : " ± " + esc(r.rangeDb)) + " · forma " + esc(r.form) + (r.censored ? " · censurado" : "") + "</td></tr>";
  });
  gap.slice(0, 8).forEach(r => {
    html += "<tr><td>Gap</td><td>" + esc(timepointLabel(r.timepoint)) + "</td><td>" + esc(fmtDay(r.date)) + "</td><td><strong>" + esc(r.thresholdMs) + " ms</strong>" + (r.lowMs == null ? "" : " (" + esc(r.lowMs) + "–" + esc(r.highMs) + ")") + (r.censored ? " · censurado" : "") + "</td></tr>";
  });
  state.realLife.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8).forEach(r => {
    html += "<tr><td>Vida real</td><td>" + esc(timepointLabel(r.timepoint)) + "</td><td>" + esc(fmtDay(r.date)) + "</td><td>" + (r.skipped ? "<span class='muted'>pulado</span>" : "<strong>" + esc(r.percent) + "%</strong> (" + esc(r.correct) + "/" + esc(r.scored) + ") · conjunto " + esc(r.set)) + "</td></tr>";
  });
  state.runningSpeech.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8).forEach(r => {
    html += "<tr><td>Fala corrida</td><td>" + esc(timepointLabel(r.timepoint)) + "</td><td>" + esc(fmtDay(r.date)) + "</td><td>" + (r.skipped ? "<span class='muted'>pulado</span>" : "<strong>" + esc(r.percent) + "%</strong> (" + esc(r.correct) + "/" + esc(r.scored) + ") · " + esc(r.tier) + " " + esc(r.genre)) + "</td></tr>";
  });
  html += "</tbody></table>";
  if (!hhie.length && !speech.length && !gap.length && !state.realLife.length && !state.runningSpeech.length) html = "<p class='muted'>Nenhuma avaliação registrada ainda.</p>";
  box.innerHTML = html;
}

/* ---------------------------- HHIE-S ---------------------------- */

function renderHHIE() {
  const box = $("#hhieArea");
  if (!box) return;
  const answers = assessment.hhieAnswers;
  const answered = answers.filter(a => a != null).length;
  let html = "<div class='card'><h2>HHIE-S — handicap percebido (sem aparelho)</h2><p class='muted'>Responda pensando nas últimas semanas, <strong>como você ouve sem os aparelhos auditivos</strong>. Sim = 4, Às vezes = 2, Não = 0. Não pule uma pergunta se você evita a situação por causa da audição. O total vai de 0 a 40.</p><p class='small muted'>Instrumento de triagem com adaptação brasileira (Wieselberg, 1997). Esta é uma tradução de trabalho dos 10 itens; não substitui a versão aplicada por profissional.</p>";
  html += "<div class='progress'><div style='width:" + Math.round(answered / 10 * 100) + "%'></div></div>";
  HHIE_QUESTIONS.forEach((q, i) => {
    html += "<div class='hhie-item'><p>" + (i + 1) + ". " + esc(q) + "</p><div class='hhie-options' data-q='" + i + "'>" +
      "<button data-val='4' class='" + (answers[i] === 4 ? "selected" : "") + "'>Sim (4)</button>" +
      "<button data-val='2' class='" + (answers[i] === 2 ? "selected" : "") + "'>Às vezes (2)</button>" +
      "<button data-val='0' class='" + (answers[i] === 0 ? "selected" : "") + "'>Não (0)</button>" +
      "</div></div>";
  });
  html += "<button id='btnSubmitHHIE' class='primary big' " + (answered === 10 ? "" : "disabled") + ">Salvar HHIE-S e continuar</button></div>";
  box.innerHTML = html;
  $$(".hhie-options", box).forEach(group => {
    group.addEventListener("click", ev => {
      const b = ev.target.closest("button[data-val]");
      if (!b) return;
      const i = Number(group.dataset.q);
      answers[i] = Number(b.dataset.val);
      $$("button", group).forEach(x => x.classList.toggle("selected", x === b));
      const done = answers.filter(a => a != null).length;
      const prog = $(".progress > div", box);
      if (prog) prog.style.width = Math.round(done / 10 * 100) + "%";
      const submit = $("#btnSubmitHHIE");
      if (submit) submit.disabled = done !== 10;
    });
  });
  const submit = $("#btnSubmitHHIE");
  if (submit) submit.addEventListener("click", () => {
    if (answers.some(a => a == null)) return;
    const e = engine();
    const total = e ? e.measure.hhieTotal(answers) : answers.reduce((a, b) => a + b, 0);
    const band = e ? e.measure.hhieBand(total) : (total <= 8 ? "no_perceived_handicap" : total <= 24 ? "mild_to_moderate" : "significant");
    const record = { id: "h" + Date.now(), timepoint: assessment.timepoint, date: new Date().toISOString(), score: total, band: band, answers: answers.slice(), administration: "unaided", language: "pt-BR (work translation)" };
    state.hhie.push(record);
    save();
    assessment.hhie = record;
    assessment.step = 2;
    renderAssessmentHistory();
    renderAssessment();
  });
}

/* ------------------------- fala em ruído ------------------------ */

function renderSpeechTest() {
  const box = $("#speechArea");
  if (!box) return;
  if (!assessment.speechTest) assessment.speechTest = newSpeechTest(assessment.form);
  const t = assessment.speechTest;
  const header = "<div class='card'><div class='row between'><h2>Fala em ruído — forma " + esc(t.form) + "</h2><span class='badge'>" + (t.phase === "practice" ? "prática" : "medida") + "</span></div>";
  if (t.phase === "practice" && t.practiceIdx >= t.practiceItems.length) {
    t.phase = "test";
    t.idx = 0;
    t.snr = 8;
  }
  if (t.phase === "practice") {
    const item = t.practiceItems[t.practiceIdx];
    box.innerHTML = header + "<p class='muted'>Prática: 2 frases com feedback. Elas não entram no resultado.</p>" +
      "<p class='question'>" + esc(item.q) + "</p>" +
      "<button id='btnPlaySpeech' class='primary big'>Ouvir frase</button>" +
      "<div id='speechOptions' class='options'></div><div id='speechFeedback' class='feedback' role='status'></div></div>";
    bindSpeechPlay(item, t, true);
    return;
  }
  if (t.idx >= t.items.length) {
    finishSpeechTest();
    return;
  }
  const item = t.items[t.idx];
  box.innerHTML = header + "<p class='muted'>Ensaio " + (t.idx + 1) + " de " + t.items.length + " · SNR " + t.snr + " dB relativo · sem feedback até o fim.</p>" +
    "<p class='question'>" + esc(item.q) + "</p>" +
    "<button id='btnPlaySpeech' class='primary big'>Ouvir frase</button>" +
    "<div id='speechOptions' class='options'></div><div id='speechFeedback' class='feedback' role='status'></div></div>";
  bindSpeechPlay(item, t, false);
}

function newSpeechTest(form) {
  const practice = shuffle(ITEMS.filter(i => i.split === "practice")).slice(0, 2).map(i => ({ id: i.id, text: i.text, q: i.q, answer: i.options[0], options: shuffle(i.options.slice()) }));
  const items = shuffle(ITEMS.filter(i => i.split === form)).slice(0, 12).map(i => ({ id: i.id, text: i.text, q: i.q, answer: i.options[0], options: shuffle(i.options.slice()) }));
  return { phase: "practice", practiceIdx: 0, practiceItems: practice, items: items, idx: 0, snr: 8, streak: 0, lastDirection: 0, reversals: [], tested: [], correct: 0, repeats: 0, current: null };
}

function bindSpeechPlay(item, t, isPractice) {
  const play = $("#btnPlaySpeech");
  if (!play) return;
  play.addEventListener("click", async () => {
    play.disabled = true;
    Audio.stopNoise();
    Audio.startNoise(TEST_NOISE, TEST_LEVEL);
    Audio._lastSnr = t.snr;
    Audio.setSnr(t.snr);
    await new Promise(r => setTimeout(r, 450));
    const ok = await Voice.speak(item.text, TEST_RATE);
    await new Promise(r => setTimeout(r, 250));
    Audio.stopNoise();
    play.disabled = false;
    if (!ok) { toast("A voz falhou. Abra em janela completa e tente de novo."); return; }
    renderSpeechOptions(item, t, isPractice);
  });
}

function renderSpeechOptions(item, t, isPractice) {
  const box = $("#speechOptions");
  if (!box) return;
  box.innerHTML = "";
  item.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "option";
    b.textContent = opt;
    b.addEventListener("click", () => answerSpeech(i, item, t, isPractice, box));
    box.appendChild(b);
  });
}

function answerSpeech(idx, item, t, isPractice, box) {
  const correct = item.options[idx] === item.answer;
  $$("button", box).forEach(b => { b.disabled = true; });
  const fb = $("#speechFeedback");
  if (isPractice) {
    $$("button", box).forEach(b => { if (b.textContent === item.answer) b.classList.add("correct"); });
    if (fb) { fb.textContent = correct ? "Isso. Vamos para a próxima." : "A resposta era: " + item.answer; fb.className = "feedback " + (correct ? "ok" : "err"); }
    setTimeout(() => {
      t.practiceIdx += 1;
      if (t.practiceIdx >= t.practiceItems.length) { t.phase = "test"; t.idx = 0; t.snr = 8; t.streak = 0; }
      renderSpeechTest();
    }, correct ? 1100 : 1900);
    return;
  }
  if (correct) t.correct += 1;
  t.tested.push(t.snr);
  const e = engine();
  if (!e) { toast("O motor de medição não carregou; resposta não registrada."); return; }
  const step = e.measure.speechStaircaseStep(t.snr, correct, t.streak);
  if (step.direction !== 0 && t.lastDirection !== 0 && step.direction !== t.lastDirection) {
    t.reversals.push(t.snr);
  }
  if (step.direction !== 0) t.lastDirection = step.direction;
  t.snr = step.snr_db;
  t.streak = step.correct_streak;
  t.idx += 1;
  if (fb) { fb.textContent = "Resposta registrada."; fb.className = "feedback"; }
  setTimeout(() => renderSpeechTest(), 500);
}

function finishSpeechTest() {
  const t = assessment.speechTest;
  const e = engine();
  if (!e) {
    toast("O motor de medição (protocol.js) não carregou; o teste não foi salvo.");
    assessment.step = 2;
    renderAssessment();
    return;
  }
  const est = e.measure.estimateSnrThreshold(t.reversals, t.tested);
  const record = {
    id: "s" + Date.now(),
    timepoint: assessment.timepoint,
    date: new Date().toISOString(),
    form: t.form,
    thresholdDb: est.threshold_db,
    rangeDb: est.range_db,
    nReversals: est.n_reversals,
    censored: est.censored,
    correct: t.correct,
    trials: t.items.length,
    repeats: t.repeats,
    noise: TEST_NOISE,
    level: TEST_LEVEL,
    rate: TEST_RATE
  };
  state.speechTests.push(record);
  save();
  assessment.speech = record;
  assessment.step = 3;
  renderAssessmentHistory();
  renderAssessment();
}

/* --------------------- compreensão de vida real --------------------- */

/* Fixed block, not adaptive: four long, everyday sentences with a
   comprehension/inference question, always at the same relative SNR. It is
   reported as percent correct, separately from the adaptive threshold, and it
   never feeds the staircase. Two parallel sets alternate so the same four
   sentences are not repeated at every assessment. */
const REAL_LIFE_SNR = 8;

function realLifeSet(timepoint) {
  return (timepoint === "baseline" || timepoint === "week8") ? "1" : "2";
}

function newRealLifeTest(timepoint) {
  const set = realLifeSet(timepoint);
  const items = ITEMS.filter(i => i.split === "R" && i.set === set)
    .map(i => ({ id: i.id, text: i.text, q: i.q, answer: i.options[0], options: shuffle(i.options.slice()), tier: i.tier, kind: i.kind }))
    .slice(0, 4);
  return { phase: "intro", set: set, items: items, idx: 0, correct: 0, results: [], snr: REAL_LIFE_SNR, skipped: false };
}

function renderRealLifeTest() {
  const box = $("#realLifeArea");
  if (!box) return;
  if (!assessment.realLifeTest) assessment.realLifeTest = newRealLifeTest(assessment.timepoint);
  const t = assessment.realLifeTest;

  if (t.phase === "intro") {
    box.innerHTML = "<div class='card'><div class='row between'><h2>Compreensão de vida real</h2><span class='badge'>opcional</span></div>" +
      "<p>Quatro frases longas, como as de uma conversa ou de uma notícia, com uma pergunta sobre o sentido. Elas ficam sempre no mesmo volume de ruído, então dá para comparar com o tempo.</p>" +
      "<p class='small muted'>Este bloco é <strong>exploratório</strong>: frases longas misturam audição com memória e atenção. Ele não substitui o teste de fala em ruído e não é prova de melhora na vida real. A primeira medida é a referência; não existe linha de base anterior dele.</p>" +
      "<button id='btnStartRealLife' class='primary big'>Começar (4 frases)</button>" +
      "<button id='btnSkipRealLife' class='ghost big'>Pular este bloco</button></div>";
    $("#btnStartRealLife").addEventListener("click", () => { t.phase = "test"; renderRealLifeTest(); });
    $("#btnSkipRealLife").addEventListener("click", () => skipRealLife());
    return;
  }

  if (t.idx >= t.items.length) { finishRealLife(); return; }
  const item = t.items[t.idx];
  box.innerHTML = "<div class='card accent'><div class='row between'><h2>Vida real — frase " + (t.idx + 1) + " de " + t.items.length + "</h2><span class='badge'>" + esc(tierLabel(item.tier)) + "</span></div>" +
    "<p class='muted'>Frase longa, do dia a dia · SNR " + t.snr + " dB relativo · sem feedback até o fim.</p>" +
    "<p class='question'>" + esc(item.q) + "</p>" +
    "<button id='btnPlayRealLife' class='primary big'>Ouvir frase</button>" +
    "<div id='realLifeOptions' class='options'></div><div id='realLifeFeedback' class='feedback' role='status'></div></div>";
  $("#btnPlayRealLife").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    Audio.stopNoise();
    Audio.startNoise(TEST_NOISE, TEST_LEVEL);
    Audio._lastSnr = t.snr;
    Audio.setSnr(t.snr);
    await new Promise(r => setTimeout(r, 450));
    const ok = await Voice.speak(item.text, TEST_RATE);
    await new Promise(r => setTimeout(r, 250));
    Audio.stopNoise();
    ev.target.disabled = false;
    if (!ok) { toast("A voz falhou. Abra em janela completa e tente de novo."); return; }
    renderRealLifeOptions(item, t);
  });
}

function renderRealLifeOptions(item, t) {
  const box = $("#realLifeOptions");
  if (!box) return;
  box.innerHTML = "";
  item.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "option";
    b.textContent = opt;
    b.addEventListener("click", () => answerRealLife(i, item, t, box));
    box.appendChild(b);
  });
}

function answerRealLife(idx, item, t, box) {
  const correct = item.options[idx] === item.answer;
  $$("button", box).forEach(b => { b.disabled = true; });
  if (correct) t.correct += 1;
  t.results.push({ id: item.id, tier: item.tier, kind: item.kind, correct: correct });
  const fb = $("#realLifeFeedback");
  if (fb) { fb.textContent = "Resposta registrada."; fb.className = "feedback"; }
  t.idx += 1;
  setTimeout(() => renderRealLifeTest(), 450);
}

function tierHint(tiers) {
  const list = tiers || [];
  if (list.indexOf("N4") >= 0) return "relatos e frases longas, com pergunta de sentido";
  if (list.indexOf("N3") >= 0 && list.indexOf("N2") < 0) return "frases longas do dia a dia, com detalhe ou ordem";
  if (list.indexOf("N3") >= 0) return "frases médias e longas do dia a dia";
  return "frases curtas e previsíveis";
}

function tierLabel(tier) {
  return ({ N1: "curta", N2: "média", N3: "longa", N4: "relato" })[tier] || "—";
}

function saveRealLifeResult(skipped) {
  const t = assessment.realLifeTest;
  if (!t) return null;
  const scored = t.results.length;
  const record = {
    id: "rl" + Date.now(),
    timepoint: assessment.timepoint,
    date: new Date().toISOString(),
    set: t.set,
    items: t.items.map(i => i.id),
    scored: scored,
    correct: t.correct,
    percent: scored ? Math.round(t.correct / scored * 100) : null,
    snr: t.snr,
    adaptive: false,
    skipped: Boolean(skipped),
    results: t.results.slice()
  };
  state.realLife.push(record);
  assessment.realLife = record;
  save();
  return record;
}

function finishRealLife() {
  saveRealLifeResult(false);
  assessment.realLifeDone = true;
  renderAssessmentHistory();
  renderAssessment();
}

function skipRealLife() {
  if (!confirm("Pular o bloco de vida real? Ele é opcional e não entra no cálculo do limiar.")) return;
  saveRealLifeResult(true);
  assessment.realLifeDone = true;
  renderAssessment();
}

/* ------------------- texto corrido (discurso contínuo) ------------------ */
/*
 * O problema que este bloco treina não é a frase difícil: é o áudio que não
 * para. Uma notícia, uma entrevista e um programa de esporte chegam corridos,
 * sem pausa e sem botão de repetir. Treinar frase por frase ensina a decifrar
 * frase; não ensina a segurar o fio do texto. Aqui o texto toca inteiro, uma
 * vez, e só depois aparecem as perguntas.
 */

const DISCOURSE_SNR = 10;
const DISCOURSE_RATE = 1.0;
const DISCOURSE_TIERS = ["D1", "D2", "D3", "D4"];
const DISCOURSE_WEEK = { 1: "D1", 2: "D1", 3: "D2", 4: "D2", 5: "D3", 6: "D3", 7: "D4", 8: "D4" };
const DISCOURSE_LABEL = { D1: "nota curta (~20 s)", D2: "notícia (~30 s)", D3: "reportagem (~45 s)", D4: "entrevista longa (~60 s)" };
/* Textos reservados para a avaliação: nunca entram no treino, para a medida
   continuar sendo material que ele não praticou. */
const DISCOURSE_RESERVED = ["d03", "d04"];
const DISCOURSE_SET_PASSAGE = { "1": "d03", "2": "d04" };

let discourseRun = null;

function discourseLadder() {
  const protocol = protocolFor();
  const ladder = protocol && protocol.content && protocol.content.discourse_ladder;
  return Array.isArray(ladder) && ladder.length ? ladder : null;
}

function discourseTierForWeek(week) {
  const ladder = discourseLadder();
  if (ladder) {
    const row = ladder.find(r => (r.weeks || []).indexOf(Number(week)) >= 0);
    if (row && row.tier) return row.tier;
  }
  return DISCOURSE_WEEK[Number(week)] || "D1";
}

function effectiveDiscourseTier() {
  return DISCOURSE_TIERS.indexOf(state.discourseLevel) >= 0 ? state.discourseLevel : discourseTierForWeek(state.week);
}

function shiftDiscourseLevel(dir) {
  const current = effectiveDiscourseTier();
  const i = DISCOURSE_TIERS.indexOf(current);
  const next = DISCOURSE_TIERS[Math.max(0, Math.min(DISCOURSE_TIERS.length - 1, i + dir))];
  state.discourseLevel = next;
  save();
  renderDiscourse();
  toast("Nível do texto corrido: " + next + " · " + DISCOURSE_LABEL[next]);
}

function discoursePassageOfTier(tier) {
  const list = DISCOURSE.filter(d => d.tier === tier && DISCOURSE_RESERVED.indexOf(d.id) < 0);
  if (list.length) return list;
  const anyTier = DISCOURSE.filter(d => DISCOURSE_RESERVED.indexOf(d.id) < 0);
  return anyTier.length ? anyTier : DISCOURSE;
}

function usedDiscourseIds() {
  return (state.discourse || []).map(r => r.passageId);
}

function buildDiscourseRun(passage) {
  return {
    phase: "listen",
    passageId: passage.id,
    tier: passage.tier,
    genre: passage.genre,
    text: passage.text,
    questions: passage.questions.map(q => ({ kind: q.kind, q: q.q, answer: q.options[0], options: shuffle(q.options.slice()) })),
    idx: 0,
    correct: 0,
    results: [],
    replays: 0,
    playing: false
  };
}

function newDiscourseRun() {
  if (doseToday() >= DOSE_CAP_SECONDS) {
    toast("Limite de tolerabilidade de 10 min/dia atingido. Volte amanhã.");
    return;
  }
  const tier = effectiveDiscourseTier();
  const pool = discoursePassageOfTier(tier);
  const used = usedDiscourseIds();
  const fresh = pool.filter(d => used.indexOf(d.id) < 0);
  const passage = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh.length : pool.length))];
  discourseRun = buildDiscourseRun(passage);
  renderDiscourse();
}

function discourseAccuracyHint() {
  const runs = (state.discourse || []).slice(-4);
  if (runs.length < 2) return "";
  const last = runs.slice(-2);
  const ok = last.every(r => r.percent >= 75);
  return ok
    ? "<p class='small ok'>Duas sessões seguidas com 3 de 4 ou mais. Pode subir um nível quando quiser.</p>"
    : "<p class='small muted'>Suba de nível quando acertar 3 de 4 em duas sessões seguidas. Se doer a cabeça ou cansar, fique onde está.</p>";
}

function renderDiscourse() {
  const box = $("#discourseCard");
  if (!box) return;
  const tier = effectiveDiscourseTier();
  const auto = DISCOURSE_TIERS.indexOf(state.discourseLevel) < 0;
  const history = (state.discourse || []).slice(-5).reverse();

  const levelRow = "<div class='kv'><span>Nível atual</span><span class='v'>" + esc(tier) + " · " + esc(DISCOURSE_LABEL[tier]) + " · " + (auto ? "automático (semana " + state.week + ")" : "escolhido por você") + "</span></div>" +
    "<div class='row'><button id='btnDiscourseEasier' class='small'>◀ mais fácil</button><button id='btnDiscourseHarder' class='small'>mais difícil ▶</button></div>" +
    discourseAccuracyHint();

  const historyHtml = history.length
    ? "<h3>Textos recentes</h3>" + table(["Quando", "Nível", "Acerto", "Repetições"], history.map(r => [esc(fmtDay(r.date)), esc(r.tier), esc(r.percent) + "% (" + esc(r.correct) + "/" + esc(r.scored) + ")", esc(r.replays || 0)]))
    : "<p class='small muted'>Nenhum texto corrido ainda.</p>";

  if (!discourseRun) {
    box.innerHTML = "<div class='card'><div class='row between'><h2>Compreensão de texto corrido</h2><span class='badge ok'>sem parar</span></div>" +
      "<p>Aqui o áudio <strong>não para</strong>: uma notícia, uma entrevista ou um trecho de programa de esporte, lido de uma vez, do jeito que chega na TV e no YouTube. As perguntas só aparecem <em>depois</em> que o texto termina.</p>" +
      "<p class='small muted'>É o treino do ponto que mais atrapalha: perder o fio quando o áudio é corrido. Não é teste de audição; a voz é sintética e mais limpa que a TV.</p>" +
      levelRow +
      "<button id='btnStartDiscourse' class='primary big'>Ouvir um texto (" + esc(tier) + ", " + esc(DISCOURSE_LABEL[tier].replace(/[()]/g, "")) + ")</button>" +
      "<p class='small muted'>Pode ouvir o texto de novo quantas vezes quiser: aqui é treino, não teste. Cada repetição fica contada e aparece no relatório — e o tempo dela soma no limite de 10 min do dia.</p>" +
      historyHtml + "</div>";
    $("#btnStartDiscourse").addEventListener("click", newDiscourseRun);
    $("#btnDiscourseEasier").addEventListener("click", () => shiftDiscourseLevel(-1));
    $("#btnDiscourseHarder").addEventListener("click", () => shiftDiscourseLevel(1));
    return;
  }

  const t = discourseRun;

  if (t.phase === "listen") {
    box.innerHTML = "<div class='card accent'><div class='row between'><h2>Texto corrido — " + esc(t.tier) + "</h2><span class='badge'>" + esc(t.genre) + "</span></div>" +
      "<p class='muted'>Áudio corrido, uma vez, com ruído de fundo. As perguntas aparecem quando o texto terminar.</p>" +
      "<p class='small muted'>Duração aproximada: " + Math.max(10, Math.round(t.text.split(" ").length / 2.5)) + " s · SNR " + DISCOURSE_SNR + " dB relativo</p>" +
      "<button id='btnPlayDiscourse' class='primary big'>Ouvir o texto</button>" +
      "<div id='discourseStatus' class='feedback' role='status'></div></div>";
    $("#btnPlayDiscourse").addEventListener("click", playDiscourse);
    return;
  }

  if (t.phase === "questions") {
    const q = t.questions[t.idx];
    const playing = Boolean(t.playing);
    box.innerHTML = "<div class='card accent'><div class='row between'><h2>Pergunta " + (t.idx + 1) + " de " + t.questions.length + "</h2><span class='badge'>" + esc(t.tier) + "</span></div>" +
      "<p class='question'>" + esc(q.q) + "</p>" +
      "<div id='discourseOptions' class='options'></div>" +
      (playing
        ? "<p class='small muted' id='discoursePlaying'>Tocando o texto de novo… as respostas liberam no fim.</p>"
        : "<button id='btnRepeatDiscourse' class='big'>🔊 Ouvir o texto de novo (" + t.replays + " repetição(ões))</button>") +
      "<p class='small muted'>Repetições: " + t.replays + " · pode repetir quantas vezes quiser; cada uma fica registrada.</p></div>";
    const box2 = $("#discourseOptions");
    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = opt;
      b.disabled = playing;
      b.addEventListener("click", () => answerDiscourse(i));
      box2.appendChild(b);
    });
    if (!playing) $("#btnRepeatDiscourse").addEventListener("click", playDiscourseAgain);
    return;
  }

  const pct = t.results.length ? Math.round(t.correct / t.results.length * 100) : 0;
  const words = t.text.split(" ").length;
  box.innerHTML = "<div class='card ok'><h2>Texto corrido concluído</h2>" +
    "<div class='kv'><span>Acerto</span><span class='v'>" + pct + "% (" + t.correct + "/" + t.results.length + ")</span></div>" +
    "<div class='kv'><span>Texto</span><span class='v'>" + esc(t.tier) + " · " + esc(t.genre) + " · " + words + " palavras</span></div>" +
    "<div class='kv'><span>Repetições</span><span class='v'>" + t.replays + "</span></div>" +
    (t.replays ? "<p class='small muted'>Você ouviu " + (t.replays + 1) + " vezes. Use como treino, não como nota: com repetição, o acerto não é comparável a uma escuta única.</p>" : "") +
    "<p class='small muted'>Isto é treino de compreensão de texto, não limiar de audição. O que conta aqui é acompanhar o fio do assunto e segurar dois ou três fatos até o fim.</p>" +
    "<button id='btnDiscourseNext' class='primary big'>Outro texto</button> <button id='btnDiscourseClose' class='big small'>Fechar</button></div>";
  $("#btnDiscourseNext").addEventListener("click", () => { discourseRun = null; newDiscourseRun(); });
  $("#btnDiscourseClose").addEventListener("click", () => { discourseRun = null; renderDiscourse(); });
}

function playDiscourse() {
  const t = discourseRun;
  if (!t || t.playing) return;
  t.playing = true;
  const status = $("#discourseStatus");
  if (status) { status.textContent = "Tocando… o texto não para até o fim."; status.className = "feedback"; }
  const btn = $("#btnPlayDiscourse");
  if (btn) btn.disabled = true;
  Audio.stopNoise();
  Audio.startNoise(TEST_NOISE, TEST_LEVEL);
  Audio._lastSnr = DISCOURSE_SNR;
  Audio.setSnr(DISCOURSE_SNR);
  setTimeout(async () => {
    const ok = await Voice.speak(t.text, DISCOURSE_RATE);
    Audio.stopNoise();
    t.playing = false;
    if (!ok) {
      toast("A voz falhou. Abra em janela completa ou use https e tente de novo.");
      if (btn) btn.disabled = false;
      if (status) { status.textContent = "A voz não tocou. Tente de novo."; status.className = "feedback err"; }
      return;
    }
    t.phase = "questions";
    renderDiscourse();
  }, 600);
}

function playDiscourseAgain() {
  const t = discourseRun;
  if (!t || t.playing) return;
  t.replays += 1;
  t.playing = true;
  renderDiscourse();               /* trava as respostas e mostra "tocando…" */
  Audio.stopNoise();
  Audio.startNoise(TEST_NOISE, TEST_LEVEL);
  Audio._lastSnr = DISCOURSE_SNR;
  Audio.setSnr(DISCOURSE_SNR);
  setTimeout(async () => {
    const ok = await Voice.speak(t.text, DISCOURSE_RATE);
    Audio.stopNoise();
    t.playing = false;
    if (discourseRun === t) renderDiscourse();
    if (!ok) toast("A voz não tocou. Toque em “Ouvir o texto de novo” outra vez.");
  }, 300);
}

function answerDiscourse(idx) {
  const t = discourseRun;
  if (!t) return;
  const q = t.questions[t.idx];
  const correct = q.options[idx] === q.answer;
  if (correct) t.correct += 1;
  t.results.push({ kind: q.kind, correct: correct, answer: q.answer });
  $$("#discourseOptions button").forEach(b => { b.disabled = true; });
  const fb = $("#discourseOptions");
  if (fb) {
    $$("button", fb).forEach(b => { if (b.textContent === q.answer) b.classList.add("correct"); });
  }
  setTimeout(() => {
    t.idx += 1;
    if (t.idx >= t.questions.length) {
      saveDiscourseRun();
      t.phase = "done";
    }
    renderDiscourse();
  }, 650);
}

function saveDiscourseRun() {
  const t = discourseRun;
  if (!t) return null;
  const scored = t.results.length;
  const record = {
    id: "dc" + Date.now(),
    date: new Date().toISOString(),
    week: Number(state.week),
    tier: t.tier,
    genre: t.genre,
    passageId: t.passageId,
    scored: scored,
    correct: t.correct,
    percent: scored ? Math.round(t.correct / scored * 100) : 0,
    replays: t.replays,
    snr: DISCOURSE_SNR,
    adaptive: false,
    mode: "training"
  };
  state.discourse.push(record);
  /* o texto corrido entra na dose do dia: ~1,2 s por palavra falada, contando
     cada repetição — o tempo de escuta é real e o limite é de 10 min/dia */
  const perListen = Math.round(t.text.split(" ").length * 1.2);
  addDose(perListen * (1 + (Number(t.replays) || 0)));
  save();
  return record;
}

/* ------------------- texto corrido na avaliação ------------------- */

function runningSet(timepoint) {
  return realLifeSet(timepoint);
}

function newRunningTest(timepoint) {
  const set = runningSet(timepoint);
  const id = DISCOURSE_SET_PASSAGE[set] || "d03";
  const passage = DISCOURSE.find(d => d.id === id) || DISCOURSE[0];
  return {
    phase: "intro",
    set: set,
    passageId: passage.id,
    tier: passage.tier,
    genre: passage.genre,
    text: passage.text,
    questions: passage.questions.map(q => ({ kind: q.kind, q: q.q, answer: q.options[0], options: shuffle(q.options.slice()) })),
    idx: 0,
    correct: 0,
    results: [],
    snr: DISCOURSE_SNR,
    skipped: false
  };
}

function renderRunningTest() {
  const box = $("#runningArea");
  if (!box) return;
  if (!assessment.runningTest) assessment.runningTest = newRunningTest(assessment.timepoint);
  const t = assessment.runningTest;

  if (t.phase === "intro") {
    box.innerHTML = "<div class='card'><div class='row between'><h2>Compreensão de fala corrida</h2><span class='badge'>opcional</span></div>" +
      "<p>Um texto corrido de cerca de trinta segundos, como um trecho de telejornal, e quatro perguntas depois. Aqui <strong>não existe botão de repetir</strong>: é assim que a TV e o YouTube funcionam.</p>" +
      "<p class='small muted'>Exploratório, como o anterior: texto corrido mede audição, memória e atenção juntas. São quatro perguntas, então cada uma vale 25 pontos percentuais. A primeira medida é a referência.</p>" +
      "<button id='btnStartRunning' class='primary big'>Começar (1 texto + 4 perguntas)</button> " +
      "<button id='btnSkipRunning' class='ghost big'>Pular este bloco</button></div>";
    $("#btnStartRunning").addEventListener("click", () => { t.phase = "listen"; renderRunningTest(); });
    $("#btnSkipRunning").addEventListener("click", () => skipRunning());
    return;
  }

  if (t.phase === "listen") {
    box.innerHTML = "<div class='card accent'><div class='row between'><h2>Fala corrida — ouça uma vez</h2><span class='badge'>" + esc(t.genre) + "</span></div>" +
      "<p class='muted'>O texto toca do começo ao fim, sem pausa. Depois aparecem quatro perguntas.</p>" +
      "<button id='btnPlayRunning' class='primary big'>Ouvir o texto</button>" +
      "<div id='runningStatus' class='feedback' role='status'></div></div>";
    $("#btnPlayRunning").addEventListener("click", playRunning);
    return;
  }

  if (t.phase === "questions") {
    const q = t.questions[t.idx];
    box.innerHTML = "<div class='card accent'><div class='row between'><h2>Pergunta " + (t.idx + 1) + " de " + t.questions.length + "</h2><span class='badge'>sem repetir</span></div>" +
      "<p class='question'>" + esc(q.q) + "</p><div id='runningOptions' class='options'></div></div>";
    const box2 = $("#runningOptions");
    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = opt;
      b.addEventListener("click", () => answerRunning(i));
      box2.appendChild(b);
    });
    return;
  }

  finishRunning();
}

function playRunning() {
  const t = assessment.runningTest;
  if (!t) return;
  const btn = $("#btnPlayRunning");
  if (btn) { btn.disabled = true; btn.textContent = "Tocando…"; }
  Audio.stopNoise();
  Audio.startNoise(TEST_NOISE, TEST_LEVEL);
  Audio._lastSnr = t.snr;
  Audio.setSnr(t.snr);
  setTimeout(async () => {
    const ok = await Voice.speak(t.text, DISCOURSE_RATE);
    Audio.stopNoise();
    if (!ok) {
      if (btn) { btn.disabled = false; btn.textContent = "Ouvir o texto"; }
      toast("A voz falhou. Abra em janela completa e tente de novo.");
      return;
    }
    t.phase = "questions";
    renderRunningTest();
  }, 500);
}

function answerRunning(idx) {
  const t = assessment.runningTest;
  if (!t) return;
  const q = t.questions[t.idx];
  const correct = q.options[idx] === q.answer;
  if (correct) t.correct += 1;
  t.results.push({ kind: q.kind, correct: correct, id: t.passageId });
  $$("#runningOptions button").forEach(b => { b.disabled = true; });
  setTimeout(() => {
    t.idx += 1;
    if (t.idx >= t.questions.length) { t.phase = "done"; }
    renderRunningTest();
  }, 400);
}

function saveRunningResult(skipped) {
  const t = assessment.runningTest;
  if (!t) return null;
  const scored = t.results.length;
  const record = {
    id: "rs" + Date.now(),
    timepoint: assessment.timepoint,
    date: new Date().toISOString(),
    set: t.set,
    passageId: t.passageId,
    tier: t.tier,
    genre: t.genre,
    scored: scored,
    correct: t.correct,
    percent: scored ? Math.round(t.correct / scored * 100) : null,
    replays: 0,
    snr: t.snr,
    adaptive: false,
    skipped: Boolean(skipped),
    results: t.results.slice()
  };
  state.runningSpeech.push(record);
  assessment.running = record;
  save();
  return record;
}

function finishRunning() {
  saveRunningResult(false);
  assessment.runningDone = true;
  assessment.step = 4;
  renderAssessmentHistory();
  renderAssessment();
}

function skipRunning() {
  if (!confirm("Pular o bloco de fala corrida? Ele é opcional e não entra no cálculo do limiar.")) return;
  saveRunningResult(true);
  assessment.runningDone = true;
  assessment.step = 4;
  renderAssessment();
}

function renderComprehensionStep() {
  const rl = $("#realLifeArea");
  const rn = $("#runningArea");
  if (!assessment.realLifeDone) {
    if (rn) rn.innerHTML = "";
    renderRealLifeTest();
    return;
  }
  if (rl) rl.innerHTML = "";
  renderRunningTest();
}

/* ------------------------------ gap ----------------------------- */

function makeGapSequence(n) {
  /* 12 scored gap trials + 4 catch trials (30%), shuffled. Catch trials
     never move the staircase; they only estimate false positives. */
  const catchN = Math.round(n * 0.3);
  const total = n + catchN;
  for (let attempt = 0; attempt < 500; attempt++) {
    const arr = [];
    for (let i = 0; i < catchN; i++) arr.push(false);
    for (let i = 0; i < n; i++) arr.push(true);
    const seq = shuffle(arr);
    let ok = true;
    let runFalse = 0;
    let runTrue = 0;
    seq.forEach(v => {
      if (v) { runTrue++; runFalse = 0; } else { runFalse++; runTrue = 0; }
      if (runFalse > 2 || runTrue > 4) ok = false;
    });
    if (ok && seq[0] && seq[1]) ok = false;
    if (ok) return seq;
  }
  return Array.from({ length: total }, (_, i) => i % 4 !== 0);
}

function renderGapTest() {
  const box = $("#gapArea");
  if (!box) return;
  if (!assessment.gapTest) assessment.gapTest = newGapTest();
  const t = assessment.gapTest;
  if (t.phase === "practice" && t.practiceIdx >= t.practiceItems.length) {
    t.phase = "test"; t.idx = 0; t.gap = 40; t.streak = 0;
  }
  const header = "<div class='card'><div class='row between'><h2>Gap — pausa no som</h2><span class='badge'>" + (t.phase === "practice" ? "prática" : "medida") + "</span></div>";
  if (t.phase === "practice") {
    const cur = t.practiceItems[t.practiceIdx];
    box.innerHTML = header + "<p class='muted'>Você vai ouvir um som curto. Aperte <strong>Com pausa</strong> se ouvir um silêncio no meio; <strong>Sem pausa</strong> se o som for contínuo. Prática com feedback.</p>" +
      "<button id='btnPlayGap' class='primary big'>Ouvir som</button>" +
      "<div class='grid2' style='margin-top:12px'><button id='gapYes' class='option'>Com pausa</button><button id='gapNo' class='option'>Sem pausa</button></div>" +
      "<div id='gapFeedback' class='feedback' role='status'></div></div>";
    bindGapPlay(cur);
    $("#gapYes").addEventListener("click", () => answerGap(true, true));
    $("#gapNo").addEventListener("click", () => answerGap(false, true));
    return;
  }
  if (t.idx >= t.sequence.length) {
    finishGapTest();
    return;
  }
  const hasGap = t.sequence[t.idx];
  const gapTrials = t.sequence.filter(Boolean).length;
  box.innerHTML = header + "<p class='muted'>Ensaio " + (t.idx + 1) + " de " + t.sequence.length + " · " + gapTrials + " com pausa contam para o limiar · " + (t.sequence.length - gapTrials) + " sem pausa são controle · sem feedback.</p>" +
    "<button id='btnPlayGap' class='primary big'>Ouvir som</button>" +
    "<div class='grid2' style='margin-top:12px'><button id='gapYes' class='option'>Com pausa</button><button id='gapNo' class='option'>Sem pausa</button></div>" +
    "<div id='gapFeedback' class='feedback' role='status'></div></div>";
  bindGapPlay({ hasGap: hasGap, gap: t.gap });
  $("#gapYes").addEventListener("click", () => answerGap(true, false));
  $("#gapNo").addEventListener("click", () => answerGap(false, false));
}

function newGapTest() {
  return {
    phase: "practice",
    practiceIdx: 0,
    practiceItems: [{ hasGap: true, gap: 40 }, { hasGap: false, gap: 0 }],
    sequence: makeGapSequence(12),
    idx: 0,
    gap: 40,
    streak: 0,
    lastDirection: 0,
    reversals: [],
    tested: [],
    correct: 0,
    catchTotal: 0,
    catchFalse: 0
  };
}

function bindGapPlay(cur) {
  const btn = $("#btnPlayGap");
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    try { Audio.playGap(cur.hasGap, cur.gap); } catch (e) { toast("Áudio indisponível: " + e.message); }
    setTimeout(() => { btn.disabled = false; }, 850);
  });
}

function answerGap(saidGap, isPractice) {
  const t = assessment.gapTest;
  const cur = isPractice ? t.practiceItems[t.practiceIdx] : { hasGap: t.sequence[t.idx], gap: t.gap };
  const correct = saidGap === cur.hasGap;
  const fb = $("#gapFeedback");
  if (isPractice) {
    if (fb) { fb.textContent = correct ? "Isso." : "Era " + (cur.hasGap ? "com pausa" : "sem pausa") + "."; fb.className = "feedback " + (correct ? "ok" : "err"); }
    setTimeout(() => {
      t.practiceIdx += 1;
      if (t.practiceIdx >= t.practiceItems.length) { t.phase = "test"; t.idx = 0; t.gap = 40; t.streak = 0; }
      renderGapTest();
    }, correct ? 900 : 1600);
    return;
  }
  if (correct) t.correct += 1;
  if (!cur.hasGap) {
    /* catch trial: measure false positives, never move the staircase */
    t.catchTotal += 1;
    if (saidGap) t.catchFalse += 1;
    t.idx += 1;
    if (fb) { fb.textContent = "Resposta registrada."; fb.className = "feedback"; }
    setTimeout(() => renderGapTest(), 450);
    return;
  }
  t.tested.push(t.gap);
  const e = engine();
  if (!e) { toast("O motor de medição não carregou; resposta não registrada."); return; }
  const step = e.measure.gapStaircaseStep(t.gap, correct, t.streak);
  if (step.direction !== 0 && t.lastDirection !== 0 && step.direction !== t.lastDirection) {
    t.reversals.push(t.gap);
  }
  if (step.direction !== 0) t.lastDirection = step.direction;
  t.gap = step.gap_ms;
  t.streak = step.correct_streak;
  t.idx += 1;
  if (fb) { fb.textContent = "Resposta registrada."; fb.className = "feedback"; }
  setTimeout(() => renderGapTest(), 450);
}

function finishGapTest() {
  const t = assessment.gapTest;
  const e = engine();
  if (!e) {
    toast("O motor de medição (protocol.js) não carregou; o teste não foi salvo.");
    assessment.step = 4;
    renderAssessment();
    return;
  }
  const est = e.measure.estimateGapThreshold(t.reversals, t.tested);
  const record = {
    id: "g" + Date.now(),
    timepoint: assessment.timepoint,
    date: new Date().toISOString(),
    thresholdMs: est.threshold_ms,
    lowMs: est.low_ms,
    highMs: est.high_ms,
    nReversals: est.n_reversals,
    censored: est.censored,
    falsePositiveRate: t.catchTotal ? t.catchFalse / t.catchTotal : null,
    correct: t.correct,
    trials: t.sequence.length,
    scoredTrials: t.tested.length,
    catchTrials: t.catchTotal
  };
  state.gapTests.push(record);
  save();
  assessment.gap = record;
  assessment.step = 5;
  renderAssessmentHistory();
  renderAssessment();
}

/* -------------------------- resultados -------------------------- */

function renderAssessmentResults() {
  const box = $("#resultsArea");
  if (!box) return;
  const h = assessment.hhie;
  const s = assessment.speech;
  const g = assessment.gap;
  const limits = LIMITS_PT;
  let html = "<div class='card'><h2>Resultados da " + esc(timepointLabel(assessment.timepoint)) + "</h2>";
  html += "<div class='grid3'>";
  html += "<div class='card ok' style='margin:0'><strong>HHIE-S (funcional, sem aparelho)</strong><p style='font-size:1.5rem;margin:6px 0'><strong>" + esc(h ? h.score : "—") + "/40</strong></p><p class='small'>" + esc(h ? bandLabel(h.band) : "não realizado") + "</p><p class='tiny muted'>Handicap percebido. Não é audiograma.</p></div>";
  html += "<div class='card warn' style='margin:0'><strong>Fala em ruído (tarefa)</strong><p style='font-size:1.5rem;margin:6px 0'><strong>" + esc(s ? s.thresholdDb : "—") + " dB</strong></p><p class='small'>" + (s ? (s.rangeDb == null ? "faixa não disponível" : "± " + s.rangeDb + " dB") + (s.censored ? " · censurado" : "") : "não realizado") + "</p><p class='tiny muted'>SNR relativo, 4 alternativas. Não é QuickSIN.</p></div>";
  html += "<div class='card warn' style='margin:0'><strong>Gap (temporal)</strong><p style='font-size:1.5rem;margin:6px 0'><strong>" + esc(g ? g.thresholdMs : "—") + " ms</strong></p><p class='small'>" + (g ? (g.lowMs == null ? "faixa não disponível" : g.lowMs + "–" + g.highMs + " ms") + (g.falsePositiveRate != null ? " · falso positivo " + Math.round(g.falsePositiveRate * 100) + "%" : "") : "não realizado") + "</p><p class='tiny muted'>Tarefa treinada; transferência para fala não estabelecida.</p></div>";
  html += "</div>";
  const rl = assessment.realLife;
  if (rl && !rl.skipped && rl.percent != null) {
    html += "<div class='card accent' style='margin-top:10px'><strong>Compreensão de vida real (exploratória)</strong>" +
      "<p style='font-size:1.5rem;margin:6px 0'><strong>" + esc(rl.percent) + "%</strong> (" + esc(rl.correct) + "/" + esc(rl.scored) + ")</p>" +
      "<p class='small muted'>Frases longas do dia a dia no mesmo ruído (SNR " + esc(rl.snr) + " dB relativo). Mede audição + memória + atenção juntas. Não entra no limiar e não é prova de melhora na vida real.</p></div>";
  } else if (rl && rl.skipped) {
    html += "<p class='small muted'>Bloco de vida real: pulado nesta avaliação.</p>";
  }
  html += "<h3>O que isso não significa</h3><ul class='small'>" + limits.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>";
  html += "<p class='small muted'>A comparação com a linha de base aparece no Relatório. Uma mudança menor que a faixa de medição não é interpretável.</p>";
  html += "<button id='btnFinishAssessment' class='ok big'>Concluir avaliação</button>";
  html += "<button id='btnBackHome' class='big'>Voltar ao início</button>";
  html += "</div>";
  box.innerHTML = html;
  $("#btnFinishAssessment").addEventListener("click", finishAssessment);
  $("#btnBackHome").addEventListener("click", () => { assessment = null; setTab("inicio"); });
}

function finishAssessment() {
  const tp = assessment.timepoint;
  if (tp === "baseline") {
    state.baselineDone = true;
    state.week = Math.max(1, state.week);
  } else if (tp === "week4") {
    state.week = Math.max(state.week, 5);
  } else if (tp === "week8") {
    state.completed = true;
  } else if (tp === "retention") {
    state.retentionDone = true;
  }
  save();
  assessment = null;
  renderAll();
  setTab("inicio");
  toast("Avaliação salva. Semana " + state.week + " selecionada.");
}

/* ------------------------------------------------------------------ */
/* Treino                                                              */
/* ------------------------------------------------------------------ */

function renderTrainingConfig() {
  const protocol = protocolFor();
  const cfg = weekConfig(protocol, state.week);
  const box = $("#trainingPlanSummary");
  const eff = effectiveSettings(cfg);
  if (box && cfg) {
    const doseMin = Math.floor(doseToday() / 60);
    const structure = protocol && protocol.training && protocol.training.session_structure
      ? protocol.training.session_structure
      : { warm_up_items: 1, core_items: 8, closing_items: 1 };
    box.innerHTML =
      (state.baselineDone ? "" : "<div class='card warn' style='margin-bottom:10px'><strong>Sem avaliação inicial.</strong> O treino está liberado; só não há linha de base para comparar mudança depois. <button id='btnBaselineFromTraining' class='small'>Fazer avaliação</button></div>") +
      "<div class='kv'><span>Semana " + esc(state.week) + "</span><span class='v'>" + esc(focusLabel(cfg.focus)) + "</span></div>" +
      "<div class='kv'><span>Sessões planejadas</span><span class='v'>" + esc(cfg.sessions_planned) + " por semana</span></div>" +
      "<div class='kv'><span>Estrutura</span><span class='v'>" + esc(structure.warm_up_items) + " aquecimento + " + esc(structure.core_items) + " itens + " + esc(structure.closing_items) + " fechamento</span></div>" +
      "<div class='kv'><span>Dose hoje</span><span class='v'>" + esc(doseMin) + " / 10 min</span></div>" +
      "<div class='kv'><span>Início de SNR</span><span class='v'>" + esc(snrText(cfg.snr_start_db)) + "</span></div>" +
      "<div class='kv'><span>Ruído e nível</span><span class='v'>" + esc(noiseLabel(eff.noise)) + " · " + esc(eff.level) + "</span></div>";
  }
  const goBaseTrain = $("#btnBaselineFromTraining");
  if (goBaseTrain) goBaseTrain.addEventListener("click", () => setTab("avaliacao"));
  const rate = $("#rateSlider");
  if (rate) { rate.value = String(eff.rate); }
  const rv = $("#rateVal");
  if (rv) rv.textContent = Number(eff.rate).toFixed(2);
  $$(".noise-btn").forEach(b => b.classList.toggle("active", b.dataset.noise === eff.noise));
  const vn = $("#voiceName");
  if (vn) {
    const v = Voice.pick();
    vn.textContent = v ? v.name : "voz padrão";
  }
  const btn = $("#btnStartSession");
  if (btn) btn.disabled = state.paused;
}

function renderTrainingHistory() {
  const box = $("#trainingHistory");
  if (!box) return;
  const arr = state.sessions.slice(-8).reverse();
  if (!arr.length) { box.innerHTML = "<p class='muted'>Nenhuma sessão registrada.</p>"; return; }
  let html = "<table><thead><tr><th>Data</th><th>Semana</th><th>Acerto (núcleo)</th><th>SNR</th><th>Ruído</th><th>Cansaço</th></tr></thead><tbody>";
  arr.forEach(s => {
    html += "<tr><td>" + esc(fmtDay(s.date)) + "</td><td>" + esc(s.week) + "</td><td><strong>" + esc(s.accuracy) + "%</strong> (" + esc(s.correct) + "/" + esc(s.total) + ")</td><td>" + esc(s.startSnr) + " → " + esc(s.endSnr) + "</td><td>" + esc(noiseLabel(s.noise)) + " n" + esc(s.level) + "</td><td>" + (s.fatigue == null ? "—" : esc(s.fatigue) + "/5") + "</td></tr>";
  });
  html += "</tbody></table>";
  box.innerHTML = html;
}

function startTraining() {
  if (!Voice.ensure()) { setTab("treino"); toast("Voz bloqueada: abra em janela completa antes de treinar."); return; }
  if (pendingDraft) {
    if (!confirm("Existe uma sessão interrompida. Descartar aquela sessão e começar uma nova agora?")) { setTab("treino"); return; }
    clearDraft();
    pendingDraft = null;
  }
  if (state.paused) { alert("Treino pausado por evento adverso. Procure avaliação e use ‘Liberar retomada’ depois."); return; }
  /* Treinar não exige avaliação inicial. Sem linha de base o app avisa que
     mudança não pode ser interpretada, mas não trava o treino. */
  if (!state.baselineDone) {
    toast("Treinando sem avaliação inicial: o treino vale, mas ainda não dá para comparar mudança.");
  }
  if (doseToday() >= DOSE_CAP_SECONDS) {
    alert("Teto de tolerabilidade de 10 min/dia atingido (você já treinou " + Math.floor(doseToday() / 60) + " min hoje). O treino volta amanhã.");
    return;
  }
  /* Pode treinar quantas vezes quiser no dia. O que limita é o teto de 10 min
     de escuta por dia — tolerabilidade, não burocracia de plano. */
  const previousToday = sessionsToday();
  if (previousToday === 1) toast("Segunda sessão de hoje. O teto de 10 min/dia continua valendo.");
  else if (previousToday > 1) toast(previousToday + "ª sessão de hoje. Se cansar, pare: o teto é 10 min/dia.");
  const protocol = protocolFor();
  const cfg = weekConfig(protocol, state.week);
  if (!cfg) { alert("Semana inválida."); return; }
  const eff = effectiveSettings(cfg);
  const noise = eff.noise;
  const level = eff.level;
  const rate = eff.rate;
  /* The engine plans which complexity tiers belong to each week (content
     ladder). Training grows in difficulty; the scored test does not move. */
  const tiers = trainingTiers(state.week);
  const inTier = i => tiers.indexOf(i.tier) >= 0;
  const trainPool = ITEMS.filter(i => i.split === "train" && inTier(i));
  const fresh = trainPool.filter(i => state.recentItems.indexOf(i.id) < 0);
  const pool = (fresh.length >= 8 ? fresh : trainPool);
  const core = shuffle(pool).slice(0, 8).map(i => ({ id: i.id, text: i.text, q: i.q, answer: i.options[0], options: shuffle(i.options.slice()) }));
  const warm = shuffle(ITEMS.filter(i => i.split === "practice")).slice(0, 1).map(i => ({ id: i.id, text: i.text, q: i.q, answer: i.options[0], options: shuffle(i.options.slice()) }))[0];
  training = {
    week: state.week,
    cfg: cfg,
    phase: "warmup",
    core: core,
    idx: 0,
    current: warm,
    isWarmup: true,
    snr: 12,
    startSnr: cfg.snr_start_db,
    endSnr: cfg.snr_start_db,
    correctStreak: 0,
    errorStreak: 0,
    moves: 0,
    results: [],
    tiers: tiers,
    noise: noise,
    level: level,
    rate: rate,
    startTime: Date.now(),
    elapsedSec: 0,
    savedId: null,
    answered: false,
    lastAnswerCorrect: null,
    closingItem: null,
    closingAttempts: 0,
    gapDone: false,
    gapPlan: cfg.gap_trials ? {
      total: Number(cfg.gap_trials),
      idx: 0,
      gap: 60,
      streak: 0,
      correct: 0,
      start: 60,
      end: 60,
      answered: false,
      lastCorrect: null,
      results: [],
      sequence: shuffle([true, true, true, false]),
      skipped: false
    } : null
  };
  saveDraft();
  renderTraining();
  /* Starting from the home tab used to leave the session rendered in a hidden
     panel, so the button looked like it did nothing. */
  setTab("treino");
}

function renderTraining() {
  const box = $("#trainingArea");
  if (!box) return;
  if (!training) {
    if (pendingDraft) {
      box.innerHTML = resumeCardHtml("resumeTraining");
      bindResumeCard("resumeTraining");
    } else {
      box.innerHTML = "";
    }
    return;
  }
  if (training.phase === "finished") { renderTrainingSummary(); return; }
  if (training.phase === "gap") { renderGapTrainingCard(); return; }
  const t = training;
  const stepLabel = t.phase === "warmup" ? "Aquecimento" : (t.phase === "core" ? "Núcleo " + (t.idx + 1) + "/" + t.core.length : "Fechamento");
  const item = t.current;
  let html = "<div class='card accent'><div class='row between'><h2>Sessão — semana " + esc(t.week) + "</h2><span class='badge'>" + esc(stepLabel) + "</span></div>";
  html += "<div class='progress'><div style='width:" + Math.round((t.phase === "warmup" ? 5 : (t.phase === "core" ? 10 + t.idx * 10 : 95))) + "%'></div></div>";
  html += "<p class='muted'>Ruído: " + esc(noiseLabel(t.noise)) + " nível " + esc(t.level) + " · SNR " + esc(t.snr) + " dB relativo · voz " + Number(t.rate).toFixed(2) + "x</p>";
  if (t.tiers && t.tiers.length) {
    html += "<p class='tiny muted'>Nível das frases nesta semana: " + esc(t.tiers.join(" e ")) + " · " + esc(tierHint(t.tiers)) + "</p>";
  }
  html += "<p class='question'>" + esc(item.q) + "</p>";
  html += "<button id='btnPlayTraining' class='primary big'>Ouvir frase</button>";
  html += "<div id='trainingOptions' class='options'></div>";
  html += "<div id='trainingFeedback' class='feedback' role='status'></div>";
  html += "<button id='btnNextTraining' class='ok big hidden'>Próximo</button>";
  html += "<p class='tiny muted'>Regra: 3 acertos seguidos → 2 dB mais difícil; 2 erros → 2 dB mais fácil; no máximo 4 dB de mudança por sessão. O dB é relativo ao gerador deste app; não é dB SPL nem dB HL.</p>";
  html += "</div>";
  box.innerHTML = html;
  const play = $("#btnPlayTraining");
  play.addEventListener("click", async () => {
    play.disabled = true;
    Audio.stopNoise();
    Audio.startNoise(t.noise, t.level);
    Audio._lastSnr = t.snr;
    Audio.setSnr(t.snr);
    await new Promise(r => setTimeout(r, 450));
    const ok = await Voice.speak(t.current.text, t.rate);
    await new Promise(r => setTimeout(r, 250));
    Audio.stopNoise();
    play.disabled = false;
    if (!ok) { toast("A voz falhou. Abra em janela completa."); return; }
    renderTrainingOptions();
  });
  $("#btnNextTraining").addEventListener("click", nextTraining);
  if (t.answered) {
    $$("#trainingOptions button").forEach(b => { b.disabled = true; });
    const nx = $("#btnNextTraining");
    if (nx) nx.classList.remove("hidden");
  }
  saveDraft();
}

function renderTrainingOptions() {
  const t = training;
  const box = $("#trainingOptions");
  if (!box) return;
  box.innerHTML = "";
  t.current.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "option";
    b.textContent = opt;
    if (t.answered) b.disabled = true;
    b.addEventListener("click", () => answerTraining(i, b, box));
    box.appendChild(b);
  });
}

function answerTraining(idx, btn, box) {
  const t = training;
  if (t.answered) return;
  t.answered = true;
  const correct = t.current.options[idx] === t.current.answer;
  t.lastAnswerCorrect = correct;
  const fb = $("#trainingFeedback");
  $$("button", box).forEach(b => {
    b.disabled = true;
    if (b.textContent === t.current.answer) b.classList.add("correct");
    if (b === btn && !correct) b.classList.add("wrong");
  });
  if (fb) {
    fb.textContent = correct ? "Acertou." : "Não foi essa. A resposta era: " + t.current.answer;
    fb.className = "feedback " + (correct ? "ok" : "err");
  }
  if (t.phase === "warmup") {
    try { Audio.playTone(correct ? 880 : 220, 0.12); } catch (e) { /* ignore */ }
  } else if (t.phase === "core") {
    t.results.push({ id: t.current.id, correct: correct, snr: t.snr, phase: "core" });
    if (correct) {
      t.correctStreak += 1;
      t.errorStreak = 0;
      if (t.correctStreak >= 3 && t.moves < 2) {
        t.snr = Math.max(-12, t.snr - 2);
        t.moves += 1;
        t.correctStreak = 0;
      }
    } else {
      t.correctStreak = 0;
      t.errorStreak += 1;
      if (t.errorStreak >= 2 && t.moves < 2) {
        t.snr = Math.min(16, t.snr + 2);
        t.moves += 1;
        t.errorStreak = 0;
      }
    }
    t.endSnr = t.snr;
  } else if (t.phase === "closing") {
    t.results.push({ id: t.current.id, correct: correct, snr: t.snr, phase: "closing" });
  }
  try { Audio.playTone(correct ? 880 : 220, 0.12); } catch (e) { /* ignore */ }
  const next = $("#btnNextTraining");
  if (next) next.classList.remove("hidden");
  saveDraft();
}

function nextTraining() {
  const t = training;
  if (!t) return;
  if (doseCapReached() && t.phase !== "finished") {
    t.capReached = true;
    t.phase = "finished";
    finishTrainingAndSave();
    renderTrainingSummary();
    toast("Teto de 10 min por dia atingido: sessão encerrada.");
    return;
  }
  if (t.phase === "warmup") {
    if (t.gapPlan && !t.gapDone) {
      t.phase = "gap";
      t.current = null;
      t.answered = false;
      saveDraft();
      renderTraining();
      return;
    }
    t.phase = "core";
    t.idx = 0;
    t.current = t.core[0];
    t.snr = t.cfg.snr_start_db;
    t.answered = false;
    renderTraining();
    return;
  }
  if (t.phase === "core") {
    if (t.idx < t.core.length - 1) {
      t.idx += 1;
      t.current = t.core[t.idx];
      t.answered = false;
      renderTraining();
      return;
    }
    t.phase = "closing";
    t.closingAttempts = 0;
    const correctCore = t.results.filter(r => r.phase === "core" && r.correct);
    const chosen = correctCore.length ? correctCore[correctCore.length - 1] : null;
    const item = chosen ? t.core.find(i => i.id === chosen.id) : null;
    t.current = item || { id: "close-easy", text: "O médico pediu para tomar o remédio depois do almoço.", q: "Quando tomar o remédio?", answer: "Depois do almoço", options: ["Depois do almoço", "Antes do café", "Na hora de dormir", "Em jejum"] };
    t.snr = 12;
    t.answered = false;
    renderTraining();
    return;
  }
  if (t.phase === "closing") {
    if (t.lastAnswerCorrect || t.closingAttempts >= 1) {
      t.phase = "finished";
      finishTrainingAndSave();
      renderTrainingSummary();
      return;
    }
    t.closingAttempts += 1;
    t.answered = false;
    t.snr = 12;
    renderTraining();
  }
}

function renderGapTrainingCard() {
  const box = $("#trainingArea");
  const t = training;
  if (!box || !t || !t.gapPlan) return;
  const g = t.gapPlan;
  if (g.idx >= g.total) {
    t.gapDone = true;
    t.phase = "core";
    t.idx = 0;
    t.current = t.core[0];
    t.snr = t.cfg.snr_start_db;
    t.answered = false;
    renderTraining();
    return;
  }
  let html = "<div class='card accent'><div class='row between'><h2>Sessão — semana " + esc(t.week) + "</h2><span class='badge'>Gap " + (g.idx + 1) + "/" + g.total + "</span></div>";
  html += "<div class='progress'><div style='width:" + Math.round((g.idx + 1) / (g.total + 1) * 40) + "%'></div></div>";
  const hasGap = g.sequence[g.idx];
  html += "<p class='muted'>Treino de pausa: ouça um som curto e diga se há um silêncio no meio. Aqui há feedback. A pausa atual é de " + esc(g.gap) + " ms; parte dos ensaios não tem pausa, como controle.</p>";
  html += "<button id='btnPlayGapTraining' class='primary big'>Ouvir som</button>";
  html += "<div class='grid2' style='margin-top:12px'><button id='gapTrainYes' class='option'>Com pausa</button><button id='gapTrainNo' class='option'>Sem pausa</button></div>";
  html += "<div id='gapTrainFeedback' class='feedback' role='status'></div>";
  html += "<button id='btnSkipGapTraining' class='big small'>Pular treino de gap</button>";
  html += "<p class='tiny muted'>Regra: 2 acertos seguidos → pausa menor; 1 erro → pausa maior. Esta sessão tem 3 ensaios com pausa e 1 sem pausa (controle).</p>";
  html += "<p class='tiny muted'>Este treino melhora a tarefa treinada; transferência para fala no ruído não está estabelecida. Ele não substitui o treino principal.</p></div>";
  box.innerHTML = html;
  $("#btnPlayGapTraining").addEventListener("click", ev => {
    ev.target.disabled = true;
    try { Audio.playGap(hasGap, g.gap); } catch (e) { toast("Áudio indisponível: " + e.message); }
    setTimeout(() => { const b = $("#btnPlayGapTraining"); if (b) b.disabled = false; }, 850);
  });
  $("#gapTrainYes").addEventListener("click", () => answerGapTraining(true));
  $("#gapTrainNo").addEventListener("click", () => answerGapTraining(false));
  saveDraft();
  $("#btnSkipGapTraining").addEventListener("click", () => {
    g.skipped = true;
    t.gapDone = true;
    t.phase = "core";
    t.idx = 0;
    t.current = t.core[0];
    t.snr = t.cfg.snr_start_db;
    t.answered = false;
    renderTraining();
  });
}

function answerGapTraining(saidGap) {
  const t = training;
  if (!t || !t.gapPlan) return;
  const g = t.gapPlan;
  if (g.answered) return;
  const hasGap = Boolean(g.sequence[g.idx]);
  const played = g.gap;
  g.answered = true;
  const correct = saidGap === hasGap;
  g.lastCorrect = correct;
  if (correct) g.correct += 1;
  g.results.push({ gapMs: hasGap ? g.gap : 0, hasGap: hasGap, correct: correct });
  if (hasGap) {
    const e = engine();
    if (!e) { toast("O motor de medição não carregou; resposta não registrada."); return; }
    const step = e.measure.gapStaircaseStep(g.gap, correct, g.streak);
    g.gap = step.gap_ms;
    g.streak = step.correct_streak;
    g.end = g.gap;
  }
  saveDraft();
  const fb = $("#gapTrainFeedback");
  if (fb) {
    fb.textContent = hasGap
      ? (correct ? "Acertou. Havia pausa de " + Math.round(played) + " ms." : "Não foi essa. Havia pausa de " + Math.round(played) + " ms.")
      : (correct ? "Acertou: o som era contínuo, sem pausa." : "Não foi essa: o som era contínuo, sem pausa.");
    fb.className = "feedback " + (correct ? "ok" : "err");
  }
  try { Audio.playTone(correct ? 880 : 220, 0.12); } catch (e) { /* ignore */ }
  $$("#gapTrainYes, #gapTrainNo").forEach(b => { b.disabled = true; });
  setTimeout(() => {
    g.idx += 1;
    g.answered = false;
    renderGapTrainingCard();
  }, 1200);
}

function finishTrainingAndSave() {
  /* Idempotent: the first call writes the session to the state and returns it.
     Every later call (fatigue buttons, pagehide, tab change) returns the same
     record instead of creating a duplicate. */
  const t = training;
  if (!t) return null;
  if (t.savedId) {
    const existing = state.sessions.find(s => s.id === t.savedId);
    if (existing) return existing;
  }
  const core = t.results.filter(r => r.phase === "core");
  const correct = core.filter(r => r.correct).length;
  const accuracy = core.length ? Math.round(correct / core.length * 100) : 0;
  const durationSec = Math.max(1, Math.round(trainingElapsedSeconds()));
  const session = {
    id: "session" + Date.now(),
    date: new Date().toISOString(),
    week: t.week,
    accuracy: accuracy,
    correct: correct,
    total: core.length,
    startSnr: t.startSnr,
    endSnr: t.endSnr,
    moves: t.moves,
    fatigue: null,
    durationSec: durationSec,
    noise: t.noise,
    level: t.level,
    rate: t.rate,
    endedOnSuccess: Boolean(t.lastAnswerCorrect),
    capReached: Boolean(t.capReached),
    items: t.results.slice(),
    gap: t.gapPlan ? {
      total: t.gapPlan.total,
      correct: t.gapPlan.correct,
      startMs: Math.round(t.gapPlan.start),
      endMs: Math.round(t.gapPlan.end),
      skipped: Boolean(t.gapPlan.skipped),
      results: (t.gapPlan.results || []).slice()
    } : null,
    savedAutomatically: true
  };
  state.sessions.push(session);
  t.savedId = session.id;
  addDose(durationSec);
  t.results.forEach(r => {
    if (state.recentItems.indexOf(r.id) < 0) state.recentItems.push(r.id);
  });
  state.recentItems = state.recentItems.slice(-24);
  save();
  clearDraft();
  return session;
}

function renderTrainingSummary() {
  const box = $("#trainingArea");
  if (!box || !training) return;
  const t = training;
  const saved = finishTrainingAndSave();
  const core = t.results.filter(r => r.phase === "core");
  const correct = core.filter(r => r.correct).length;
  const pct = core.length ? Math.round(correct / core.length * 100) : 0;
  let gapLine = "";
  if (t.gapPlan && !t.gapPlan.skipped) {
    gapLine = "<div class='kv'><span>Treino de gap</span><span class='v'>" + t.gapPlan.correct + "/" + t.gapPlan.total + " acertos (inclui 1 controle) · pausa " + Math.round(t.gapPlan.start) + " → " + Math.round(t.gapPlan.end) + " ms</span></div>";
  } else if (t.gapPlan && t.gapPlan.skipped) {
    gapLine = "<div class='kv'><span>Treino de gap</span><span class='v'>pulado nesta sessão</span></div>";
  }
  const saveLine = saved
    ? "<p class='small ok'>Sessão salva automaticamente" + (lastSavedAt ? " às " + esc(clockLabel(lastSavedAt)) : "") + ". Você pode fechar o app; ela já está no histórico.</p>"
    : "<p class='small err'>Não foi possível salvar a sessão neste navegador. Exporte o backup antes de fechar.</p>";
  box.innerHTML = "<div class='card ok'><h2>Sessão concluída</h2>" +
    saveLine +
    (t.capReached ? "<p class='small warn'>Teto de tolerabilidade de 10 min por dia atingido. A sessão foi encerrada aqui.</p>" : "") +
    "<div class='kv'><span>Acerto no núcleo</span><span class='v'>" + pct + "% (" + correct + "/" + core.length + ")</span></div>" +
    "<div class='kv'><span>SNR</span><span class='v'>" + t.startSnr + " → " + t.endSnr + " dB</span></div>" +
    "<div class='kv'><span>Mudanças de nível</span><span class='v'>" + t.moves + "</span></div>" + gapLine +
    "<p class='small muted'>Acerto na tarefa treinada não é transferência para a vida real. O fechamento foi " + (t.lastAnswerCorrect ? "com acerto" : "com apoio") + ".</p>" +
    "<h3>Como você se sentiu?</h3><p class='small'>Cansaço auditivo de 0 a 5. Se for 4 ou 5, a próxima sessão mantém o nível. Isto é opcional: a sessão já está salva.</p>" +
    "<div class='grid3' id='fatigueButtons'>" + [0,1,2,3,4,5].map(i => "<button data-fatigue='" + i + "'>" + i + "</button>").join("") + "</div>" +
    "<button id='btnSkipFatigue' class='big small'>Pular</button></div>";
  $$("#fatigueButtons button").forEach(b => b.addEventListener("click", () => finishSession(Number(b.dataset.fatigue))));
  $("#btnSkipFatigue").addEventListener("click", () => finishSession(null));
}

function finishSession(fatigue) {
  const t = training;
  if (!t) return;
  const session = finishTrainingAndSave();
  let held = false;
  if (session && fatigue != null) {
    session.fatigue = Number(fatigue);
    if (Number(fatigue) >= 4) {
      state.settings.overrideWeek = state.week;
      state.settings.rate = Math.max(0.7, Number(t.rate) - 0.05);
      held = true;
    }
    save();
  }
  training = null;
  pendingDraft = null;
  renderTrainingConfig();
  renderTrainingHistory();
  renderHome();
  const box = $("#trainingArea");
  if (box) {
    const accuracy = session ? session.accuracy : 0;
    const correct = session ? session.correct : 0;
    const total = session ? session.total : 0;
    box.innerHTML = "<div class='card ok'><h2>Sessão salva</h2>" +
      "<p class='small'>Guardada em " + esc(Storage.mode) + (lastSavedAt ? " às " + esc(clockLabel(lastSavedAt)) : "") + ". Ela aparece em “Sessões recentes” e no relatório.</p>" +
      "<div class='kv'><span>Acerto no núcleo</span><span class='v'>" + accuracy + "% (" + correct + "/" + total + ")</span></div>" +
      "<div class='kv'><span>Duração</span><span class='v'>" + Math.max(1, Math.round((session ? session.durationSec : 0) / 60)) + " min</span></div>" +
      "<div class='kv'><span>Dose de hoje</span><span class='v'>" + Math.floor(doseToday() / 60) + " / 10 min</span></div>" +
      (held ? "<p class='small warn'>Cansaço 4 ou 5: o nível fica mantido e a fala fica um pouco mais lenta na próxima sessão.</p>" : "") +
      "<p class='small muted'>Volte no próximo dia de treino. O plano é " + (t.cfg ? t.cfg.sessions_planned : 3) + " sessões por semana, não todos os dias.</p></div>";
  }
  toast(session ? "Sessão salva: " + session.accuracy + "% no núcleo." : "Não foi possível salvar: exporte o backup.");
}

/* ------------------------------------------------------------------ */
/* Vida real                                                           */
/* ------------------------------------------------------------------ */

/* ---------------------------- diário da semana ---------------------------- */

function currentDiaryWeek() {
  const w = Number(diaryViewWeek || state.week);
  return Math.max(1, Math.min(8, isFinite(w) ? w : Number(state.week) || 1));
}

function readDiaryForm() {
  return {
    tv: $("#diaryTv") ? $("#diaryTv").value : "0",
    conv: $("#diaryConv") ? $("#diaryConv").value : "0",
    fatigue: $("#diaryFatigue") ? Number($("#diaryFatigue").value) : null,
    note: $("#diaryNote") ? $("#diaryNote").value : ""
  };
}

function diaryHasContent(values, week) {
  const saved = state.diary[week];
  if (saved && (saved.date || saved.updatedAt)) return true;
  if (String(values.note || "").trim()) return true;
  if (values.tv !== "0" || values.conv !== "0") return true;
  /* A fatigue value other than the neutral 3 means the participant moved the
     slider on purpose, so it must be kept too. */
  return values.fatigue != null && Number(values.fatigue) !== 3;
}

function diaryStatusText(ok, when, week, auto) {
  if (!ok) return "Não foi possível salvar: o navegador está bloqueando o armazenamento. Exporte o backup em Relatório.";
  if (DEMO_MODE) return "Modo demonstração: o diário da semana " + week + " não é salvo.";
  return (auto ? "Salvo automaticamente às " : "Salvo às ") + clockLabel(when) + " · semana " + week + ".";
}

/* Written on every keystroke, synchronously, in its own small key. This is what
   survives a power cut: the debounced write into the main state may not have
   happened yet when the machine goes off. */
function writeDiaryHot() {
  if (DEMO_MODE) return false;
  const payload = {
    version: 4,
    week: currentDiaryWeek(),
    values: readDiaryForm(),
    savedAt: new Date().toISOString()
  };
  try {
    return Storage.set(DIARY_KEY, JSON.stringify(payload));
  } catch (e) {
    return false;
  }
}

function clearDiaryHot() {
  try { Storage.remove(DIARY_KEY); } catch (e) { /* ignore */ }
}

/* Restores a hot copy that never reached the main state (crash, power cut,
   browser killed while another app was open). */
function mergeHotDiary() {
  if (DEMO_MODE) return false;
  let raw = null;
  try { raw = Storage.get(DIARY_KEY); } catch (e) { return false; }
  if (!raw) return false;
  let hot = null;
  try { hot = JSON.parse(raw); } catch (e) { clearDiaryHot(); return false; }
  if (!hot || hot.version !== 4 || !hot.values) { clearDiaryHot(); return false; }
  const week = Number(hot.week);
  if (!isFinite(week) || week < 1 || week > 8) { clearDiaryHot(); return false; }
  const stored = state.diary[week] || {};
  const hotAt = new Date(hot.savedAt || 0).getTime();
  const storedAt = new Date(stored.updatedAt || stored.date || 0).getTime();
  if (!hotAt || (storedAt && hotAt <= storedAt)) { clearDiaryHot(); return false; }
  state.diary[week] = Object.assign({}, stored, hot.values, {
    date: stored.date || hot.savedAt,
    updatedAt: hot.savedAt,
    autoSaved: true,
    recovered: true
  });
  diaryViewWeek = week;
  state.diaryViewWeek = week;
  save();
  clearDiaryHot();
  return true;
}

function commitDiary(options) {
  const opts = options || {};
  /* The week is captured when the edit starts. Otherwise a save still waiting
     in the debounce window would land in whatever week the participant had
     just switched to. */
  const week = Number(opts.week || currentDiaryWeek());
  if (!opts.force && week !== currentDiaryWeek()) {
    diaryPendingWeek = null;
    return false;
  }
  const values = readDiaryForm();
  if (!opts.force && !diaryHasContent(values, week)) {
    diaryPendingWeek = null;
    return false;
  }
  const previous = state.diary[week] || {};
  const now = new Date().toISOString();
  state.diary[week] = Object.assign({}, previous, values, {
    date: previous.date || now,
    updatedAt: now,
    autoSaved: !opts.manual
  });
  state.diaryViewWeek = week;
  diaryViewWeek = week;
  const ok = save();
  if (ok) clearDiaryHot();
  diaryPendingWeek = null;
  const ds = $("#diaryStatus");
  if (ds) {
    ds.textContent = diaryStatusText(ok, now, week, !opts.manual);
    ds.className = "small " + (ok ? "ok" : "err");
  }
  renderDiaryHistory();
  renderDiaryWeekOptions();
  return ok;
}

function scheduleDiarySave() {
  diaryPendingWeek = currentDiaryWeek();
  const week = diaryPendingWeek;
  clearTimeout(diaryTimer);
  diaryTimer = setTimeout(() => {
    diaryTimer = null;
    commitDiary({ auto: true, week: week });
  }, 400);
}

/* One keystroke: hot copy now, main state in 400 ms. Even a hard shutdown
   keeps what was typed. */
function onDiaryEdit() {
  writeDiaryHot();
  scheduleDiarySave();
}

/* Writes a save that is still waiting in the debounce window. Called on tab
   change, pagehide, visibilitychange and before reload, so a shutdown never
   costs what was just typed. */
function flushDiary() {
  if (writeDiaryHot() && !diaryTimer) {
    /* even without a pending timer, make sure the main state gets the text */
    commitDiary({ auto: true, week: currentDiaryWeek() });
    return;
  }
  if (!diaryTimer) return;
  const week = diaryPendingWeek == null ? currentDiaryWeek() : diaryPendingWeek;
  clearTimeout(diaryTimer);
  diaryTimer = null;
  commitDiary({ auto: true, week: week });
}

function setDiaryField(selector, value) {
  const el = $(selector);
  if (!el) return;
  if (document.activeElement === el) return;
  if (diaryPendingWeek === currentDiaryWeek()) return;
  if (el.value === String(value)) return;
  el.value = value;
}

function renderDiaryWeekOptions() {
  const sel = $("#diaryWeekSelect");
  if (!sel) return;
  const current = currentDiaryWeek();
  const withData = {};
  Object.keys(state.diary || {}).forEach(k => {
    const d = state.diary[k];
    if (d && (d.date || d.updatedAt)) withData[Number(k)] = true;
  });
  sel.innerHTML = "";
  for (let i = 1; i <= 8; i++) {
    const op = document.createElement("option");
    op.value = String(i);
    op.textContent = "Semana " + i + (i === Number(state.week) ? " (atual)" : "") + (withData[i] ? " · já tem diário" : "");
    if (i === current) op.selected = true;
    sel.appendChild(op);
  }
  const hint = $("#diaryWeekHint");
  if (hint) {
    const others = Object.keys(withData).map(Number).filter(w => w !== current).sort((a, b) => b - a);
    const currentHasDiary = Boolean(state.diary[current] && (state.diary[current].date || state.diary[current].updatedAt));
    const nudge = (!currentHasDiary && others.length)
      ? " Seu diário da semana " + others[0] + " continua salvo: escolha a semana acima para continuar de onde parou."
      : "";
    hint.textContent = (current === Number(state.week)
      ? "Você está escrevendo o diário da semana atual. Cada semana fica guardada separada; mudar de semana não apaga nada."
      : "Você está vendo o diário da semana " + current + ", não da semana atual (" + state.week + "). As duas ficam guardadas." +
        (others.length ? " Outras semanas com diário: " + others.join(", ") + "." : "")) + nudge;
  }
}

function renderDiaryForm() {
  const week = currentDiaryWeek();
  const d = state.diary[week] || {};
  setDiaryField("#diaryTv", d.tv || "0");
  setDiaryField("#diaryConv", d.conv || "0");
  setDiaryField("#diaryFatigue", d.fatigue == null ? 3 : d.fatigue);
  setDiaryField("#diaryNote", d.note || "");
  const fv = $("#diaryFatigueVal");
  if (fv) fv.textContent = d.fatigue == null ? 3 : d.fatigue;
  const label = $("#diaryWeekLabel");
  if (label) label.textContent = String(week);
  renderDiaryWeekOptions();
  const ds = $("#diaryStatus");
  if (ds && !diaryTimer) {
    if (DEMO_MODE) {
      ds.textContent = "Modo demonstração: o diário não é salvo.";
      ds.className = "small err";
    } else if (d.updatedAt || d.date) {
      ds.textContent = "Semana " + week + " salva" + (d.updatedAt ? " às " + clockLabel(d.updatedAt) : "") + " em " + fmtDay(d.date || d.updatedAt) +
        (d.recovered ? " (recuperada após fechar o app)." : ".");
      ds.className = "small " + (Storage.mode === "localStorage" ? "muted" : "err");
    } else {
      ds.textContent = "Sem registro na semana " + week + " ainda. O que você digitar é salvo a cada letra.";
      ds.className = "small muted";
    }
  }
}

function renderDiaryHistory() {
  const box = $("#diaryHistory");
  if (!box) return;
  const weeks = Object.keys(state.diary || {})
    .map(Number)
    .filter(w => isFinite(w) && state.diary[w] && (state.diary[w].date || state.diary[w].updatedAt))
    .sort((a, b) => b - a);
  if (!weeks.length) {
    box.innerHTML = "<p class='muted'>Nenhum diário salvo ainda.</p>";
    return;
  }
  box.innerHTML = "<table><thead><tr><th>Semana</th><th>TV sem repetir</th><th>Conversas</th><th>Cansaço</th><th>Observação</th><th>Salvo em</th></tr></thead><tbody>" +
    weeks.map(w => {
      const d = state.diary[w];
      return "<tr><td><strong>" + esc(w) + "</strong>" + (Number(w) === Number(state.week) ? " <span class='tiny muted'>(atual)</span>" : "") + "</td>" +
        "<td>" + esc(d.tv || "—") + "</td><td>" + esc(d.conv || "—") + "</td><td>" + (d.fatigue == null ? "—" : esc(d.fatigue) + "/10") + "</td>" +
        "<td class='small'>" + esc(d.note || "—") + "</td><td class='small'>" + esc(fmtDay(d.updatedAt || d.date)) + "</td></tr>";
    }).join("") + "</tbody></table>";
}

function renderVida() {
  const protocol = protocolFor();
  const transfer = protocol && protocol.agents ? protocol.agents[2] : null;
  const ladder = transfer ? transfer.tv_ladder : ["news_anchor", "interview", "soap_opera_with_questions", "film_with_music"];
  const targets = TV_TARGETS_PT;
  const labels = { news_anchor: "Telejornal", interview: "Entrevista", soap_opera_with_questions: "Novela com perguntas", film_with_music: "Filme com música" };
  const cur = state.tv[state.week] || [false, false, false, false];
  const tvBox = $("#tvLadder");
  if (tvBox) {
    tvBox.innerHTML = ladder.map((rung, i) =>
      "<label class='checkline'><input type='checkbox' data-tv='" + i + "' " + (cur[i] ? "checked" : "") + "><span><strong>" + esc(labels[rung] || rung) + "</strong><br><span class='small muted'>" + esc(targets[rung] || "alvo definido no protocolo") + "</span></span></label>"
    ).join("");
    $$("[data-tv]", tvBox).forEach(inp => inp.addEventListener("change", () => {
      const arr = state.tv[state.week] || [false, false, false, false];
      arr[Number(inp.dataset.tv)] = inp.checked;
      state.tv[state.week] = arr;
      save();
    }));
  }

  const partnerBox = $("#partnerChecklist");
  if (partnerBox) {
    const rules = [
      ["face", "Chamar a atenção e ficar de frente, com luz no rosto"],
      ["noise", "Reduzir o ruído antes de falar (TV, rádio, ventilador)"],
      ["slow", "Falar um pouco mais devagar e mais alto, sem exagerar"],
      ["rephrase", "Reformular em vez de repetir a mesma frase mais alto"],
      ["keypoint", "Pedir de volta o ponto principal para confirmar"],
      ["no-shout", "Nunca gritar: gritar sobe o tom e piora a clareza"]
    ];
    const p = state.partner[state.week] || { sessions: 0, rules: {} };
    partnerBox.innerHTML = rules.map(([k, label]) =>
      "<label class='checkline'><input type='checkbox' data-partner='" + k + "' " + (p.rules && p.rules[k] ? "checked" : "") + "><span>" + esc(label) + "</span></label>"
    ).join("");
    $$("[data-partner]", partnerBox).forEach(inp => inp.addEventListener("change", () => {
      const rec = state.partner[state.week] || { sessions: 0, rules: {} };
      rec.rules = rec.rules || {};
      rec.rules[inp.dataset.partner] = inp.checked;
      state.partner[state.week] = rec;
      save();
    }));
    const ps = $("#partnerStatus");
    if (ps) ps.textContent = "Sessões de 20 min nesta semana: " + (p.sessions || 0);
  }

  const mc = $("#musicCount");
  if (mc) mc.textContent = (state.music[state.week] || 0) + " nesta semana";

  renderDiaryForm();
  renderDiaryHistory();

  const ts = $("#transferSummary");
  if (ts) {
    const speech = state.speechTests.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
    ts.innerHTML = speech.length
      ? "<table><thead><tr><th>Momento</th><th>Forma</th><th>Limiar</th></tr></thead><tbody>" + speech.map(r => "<tr><td>" + esc(timepointLabel(r.timepoint)) + "</td><td>" + esc(r.form) + "</td><td>" + esc(r.thresholdDb) + " dB" + (r.rangeDb == null ? "" : " ± " + esc(r.rangeDb)) + "</td></tr>").join("") + "</tbody></table><p class='small muted'>Formas A/B/C não são equacionadas formalmente. Compare com cautela.</p>"
      : "<p class='muted'>Nenhuma medida de fala em ruído ainda.</p>";
  }

  const rls = $("#realLifeSummary");
  if (rls) {
    const runs = state.realLife.filter(r => !r.skipped).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const skipped = state.realLife.filter(r => r.skipped).length;
    if (!runs.length) {
      rls.innerHTML = "<p class='muted'>Nenhuma medida de vida real ainda." + (skipped ? " Bloco pulado " + skipped + " vez(es)." : "") + "</p>";
    } else {
      rls.innerHTML = "<table><thead><tr><th>Momento</th><th>Acerto</th><th>Conjunto</th></tr></thead><tbody>" +
        runs.map(r => "<tr><td>" + esc(timepointLabel(r.timepoint)) + "</td><td><strong>" + esc(r.percent) + "%</strong> <span class='tiny'>(" + esc(r.correct) + "/" + esc(r.scored) + ")</span></td><td>" + esc(r.set) + "</td></tr>").join("") +
        "</tbody></table><p class='small muted'>Quatro frases por medida: um item errado já muda 25 pontos percentuais. Os conjuntos 1 e 2 não são equacionados; a linha de base e a semana 8 usam o conjunto 1, a semana 4 e a retenção usam o conjunto 2. Percentual não é limiar." +
        (skipped ? " Bloco pulado " + skipped + " vez(es)." : "") + "</p>";
    }
  }
}

/* ------------------------------------------------------------------ */
/* Relatório                                                           */
/* ------------------------------------------------------------------ */

function renderReport() {
  const protocol = protocolFor();
  renderOutcomes(protocol);
  renderChanges();
  renderChart();
  renderSessionTable();
  renderLimitations(protocol);
  renderSafetySummary();
  renderCitations();
}

function outcomeCell(records, tp, fmt) {
  const r = latestByTimepoint(records, tp);
  if (!r) return "<span class='muted'>—</span>";
  return fmt(r);
}

function renderOutcomes(protocol) {
  const box = $("#outcomesTable");
  if (!box) return;
  const tps = ["baseline", "week4", "week8", "retention"];
  let html = "<table><thead><tr><th>Medida</th>" + tps.map(tp => "<th>" + esc(timepointLabel(tp)) + "</th>").join("") + "</tr></thead><tbody>";
  html += "<tr><td><strong>HHIE-S</strong><br><span class='tiny muted'>funcional, primário, sem aparelho</span></td>" +
    tps.map(tp => "<td>" + outcomeCell(state.hhie, tp, r => "<strong>" + esc(r.score) + "/40</strong><br><span class='tiny'>" + esc(bandLabel(r.band)) + "</span>") + "</td>").join("") + "</tr>";
  html += "<tr><td><strong>Fala em ruído</strong><br><span class='tiny muted'>tarefa, dB relativo</span></td>" +
    tps.map(tp => "<td>" + outcomeCell(state.speechTests, tp, r => "<strong>" + esc(r.thresholdDb) + " dB</strong><br><span class='tiny'>" + (r.rangeDb == null ? "sem faixa" : "± " + esc(r.rangeDb)) + (r.censored ? " · censurado" : "") + "</span>") + "</td>").join("") + "</tr>";
  html += "<tr><td><strong>Vida real</strong><br><span class='tiny muted'>exploratório, %</span></td>" +
    tps.map(tp => "<td>" + outcomeCell(state.realLife.filter(r => !r.skipped), tp, r => "<strong>" + esc(r.percent) + "%</strong><br><span class='tiny'>" + esc(r.correct) + "/" + esc(r.scored) + " · conjunto " + esc(r.set) + "</span>") + "</td>").join("") + "</tr>";
  html += "<tr><td><strong>Fala corrida</strong><br><span class='tiny muted'>exploratório, %</span></td>" +
    tps.map(tp => "<td>" + outcomeCell(state.runningSpeech.filter(r => !r.skipped), tp, r => "<strong>" + esc(r.percent) + "%</strong><br><span class='tiny'>" + esc(r.correct) + "/" + esc(r.scored) + " · " + esc(r.tier) + "</span>") + "</td>").join("") + "</tr>";
  html += "<tr><td><strong>Gap</strong><br><span class='tiny muted'>temporal, tarefa</span></td>" +
    tps.map(tp => "<td>" + outcomeCell(state.gapTests, tp, r => "<strong>" + esc(r.thresholdMs) + " ms</strong><br><span class='tiny'>" + (r.lowMs == null ? "sem faixa" : esc(r.lowMs) + "–" + esc(r.highMs)) + "</span>") + "</td>").join("") + "</tr>";
  html += "</tbody></table>";
  const cfg = weekConfig(protocol, state.week);
  if (cfg) {
    html += "<div class='kv' style='margin-top:10px'><span>Adesão na semana " + esc(state.week) + "</span><span class='v'>" + trainingDaysThisWeek() + " / " + cfg.sessions_planned + " dias" + (sessionsThisWeek() > trainingDaysThisWeek() ? " · " + sessionsThisWeek() + " sessões" : "") + "</span></div>";
    html += "<div class='kv'><span>Dose de treino hoje</span><span class='v'>" + Math.floor(doseToday() / 60) + " / 10 min</span></div>";
  }
  box.innerHTML = html;
}

function renderChanges() {
  const box = $("#changesTable");
  if (!box) return;
  const baseH = latestByTimepoint(state.hhie, "baseline");
  const baseS = latestByTimepoint(state.speechTests, "baseline");
  const baseG = latestByTimepoint(state.gapTests, "baseline");
  const rows = [];
  ["week4", "week8", "retention"].forEach(tp => {
    const h = latestByTimepoint(state.hhie, tp);
    const s = latestByTimepoint(state.speechTests, tp);
    const g = latestByTimepoint(state.gapTests, tp);
    const rlRow = latestByTimepoint(state.realLife.filter(r => !r.skipped), tp);
    const rsRow = latestByTimepoint(state.runningSpeech.filter(r => !r.skipped), tp);
    if (!h && !s && !g && !rlRow && !rsRow) return;
    let hh = "—";
    if (baseH && h) {
      const d = h.score - baseH.score;
      hh = (d > 0 ? "+" : "") + d + " pts · " + (d === 0 ? "estável" : (d < 0 ? "melhor" : "pior"));
    }
    let ss = "—";
    if (baseS && s) {
      const d = Math.round((s.thresholdDb - baseS.thresholdDb) * 10) / 10;
      const range = (baseS.rangeDb || 0) + (s.rangeDb || 0);
      ss = (d > 0 ? "+" : "") + d + " dB · " + (d === 0 ? "estável" : (d < 0 ? "melhor" : "pior")) +
        (Math.abs(d) <= range ? ", dentro da faixa" : ", acima da faixa");
    }
    const rl = latestByTimepoint(state.realLife.filter(r => !r.skipped), tp);
    const baseRl = latestByTimepoint(state.realLife.filter(r => !r.skipped), "baseline");
    let rr = "—";
    if (rl && rl.percent != null) {
      if (baseRl && baseRl.percent != null) {
        const d = rl.percent - baseRl.percent;
        rr = (d > 0 ? "+" : "") + d + " p.p. · " + (d === 0 ? "estável" : (d > 0 ? "melhor" : "pior"));
      } else {
        rr = rl.percent + "% (referência)";
      }
    }
    const rs = latestByTimepoint(state.runningSpeech.filter(r => !r.skipped), tp);
    const baseRs = latestByTimepoint(state.runningSpeech.filter(r => !r.skipped), "baseline");
    let cc = "—";
    if (rs && rs.percent != null) {
      if (baseRs && baseRs.percent != null) {
        const d = rs.percent - baseRs.percent;
        cc = (d > 0 ? "+" : "") + d + " p.p. · " + (d === 0 ? "estável" : (d > 0 ? "melhor" : "pior"));
      } else {
        cc = rs.percent + "% (referência)";
      }
    }
    let gg = "—";
    if (baseG && g) {
      const d = Math.round((g.thresholdMs - baseG.thresholdMs) * 10) / 10;
      gg = (d > 0 ? "+" : "") + d + " ms · " + (d === 0 ? "estável" : (d < 0 ? "melhor" : "pior"));
    }
    rows.push("<tr><td>" + esc(timepointLabel(tp)) + "</td><td>" + esc(hh) + "</td><td>" + esc(ss) + "</td><td>" + esc(gg) + "</td><td>" + esc(rr) + "</td><td>" + esc(cc) + "</td></tr>");
  });
  if (!rows.length) { box.innerHTML = "<p class='muted'>Ainda não há duas avaliações para comparar.</p>"; return; }
  box.innerHTML = "<table><thead><tr><th>Momento</th><th>HHIE-S</th><th>Fala</th><th>Gap</th><th>Vida real</th><th>Fala corrida</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>" +
    "<p class='small muted'>Para os três indicadores, menor é melhor: menos handicap, limiar de fala com mais ruído e pausa menor detectável. A mudança mostra a direção; diferenças dentro da faixa de medição não são interpretáveis.</p>";
}

function renderChart() {
  const box = $("#chart");
  if (!box) return;
  const arr = state.sessions.slice(-14);
  if (!arr.length) { box.innerHTML = "<p class='muted' style='padding:10px'>Nenhuma sessão.</p>"; return; }
  box.innerHTML = arr.map(s => "<div class='bar' style='height:" + Math.max(4, Number(s.accuracy)) + "%;background:" + (s.accuracy >= 80 ? "var(--ok)" : s.accuracy >= 60 ? "var(--warn)" : "var(--err)") + "' title='Semana " + esc(s.week) + ": " + esc(s.accuracy) + "%'><span>S" + esc(s.week) + "</span></div>").join("");
}

function renderSessionTable() {
  const box = $("#sessionTable");
  if (!box) return;
  const arr = state.sessions.slice(-8).reverse();
  if (!arr.length) { box.innerHTML = "<p class='muted'>Nenhuma sessão registrada.</p>"; return; }
  let html = "<table><thead><tr><th>Data</th><th>Sem.</th><th>Acerto</th><th>SNR</th><th>Ruído</th><th>Fadiga</th><th>Duração</th></tr></thead><tbody>";
  arr.forEach(s => {
    html += "<tr><td>" + esc(fmtDay(s.date)) + "</td><td>" + esc(s.week) + "</td><td>" + esc(s.accuracy) + "%</td><td>" + esc(s.startSnr) + "→" + esc(s.endSnr) + "</td><td>" + esc(noiseLabel(s.noise)) + "</td><td>" + (s.fatigue == null ? "—" : esc(s.fatigue)) + "</td><td>" + Math.round((s.durationSec || 0) / 60) + " min</td></tr>";
  });
  box.innerHTML = html + "</tbody></table>";
}

function renderLimitations(protocol) {
  const box = $("#limitationsList");
  if (!box) return;
  const list = LIMITS_PT.slice();
  if (protocol && protocol.training && protocol.training.gap_training) {
    list.push("o treino de gap é específico da tarefa e não substitui o treino de fala no ruído");
  }
  const unique = Array.from(new Set(list));
  box.innerHTML = unique.map(x => "<li>" + esc(x) + "</li>").join("");
}

function renderSafetySummary() {
  const box = $("#safetySummary");
  if (!box) return;
  let html = "<div class='kv'><span>Treino</span><span class='v'>" + (state.paused ? "pausado por evento" : "liberado") + "</span></div>";
  html += "<div class='kv'><span>Eventos registrados</span><span class='v'>" + state.events.length + "</span></div>";
  if (state.events.length) {
    const last = state.events[state.events.length - 1];
    html += "<div class='kv'><span>Último evento</span><span class='v'>" + esc(fmtDay(last.date)) + ": " + esc(last.description) + "</span></div>";
  }
  box.innerHTML = html;
}

function renderCitations() {
  const box = $("#citationsList");
  if (!box) return;
  box.innerHTML = "<p class='small muted'>As chaves abaixo são os identificadores do motor de evidência; cada linha traz a referência completa.</p>" + Object.keys(CITATIONS).map(k => "<div class='kv'><div><strong>" + esc(k) + "</strong><br><span class='small muted'>" + esc(CITATIONS[k]) + "</span></div></div>").join("");
}

function generateReport() {
  const protocol = protocolFor();
  const cfg = weekConfig(protocol, state.week);
  const baseH = latestByTimepoint(state.hhie, "baseline");
  const lastH = latestOverall(state.hhie);
  const baseS = latestByTimepoint(state.speechTests, "baseline");
  const lastS = latestOverall(state.speechTests);
  const baseG = latestByTimepoint(state.gapTests, "baseline");
  const lastG = latestOverall(state.gapTests);
  const diary = state.diary[state.week] || null;
  const partner = state.partner[state.week] || null;
  const tv = state.tv[state.week] || null;
  const music = state.music[state.week] || 0;
  const planned = cfg ? cfg.sessions_planned : 0;
  const done = trainingDaysThisWeek();
  const sessionCount = sessionsThisWeek();
  const adherence = planned ? Math.min(100, Math.round(done / planned * 100)) : 0;
  const lines = [];
  const head = (t) => { lines.push(""); lines.push(t); };

  lines.push("INDICADORES DE DESEMPENHO — SWARM v4");
  lines.push("Relatório descritivo de tarefa e autorrelato. Não é prova de melhora, não é diagnóstico e não substitui avaliação profissional.");
  lines.push("Gerado em " + new Date().toLocaleString("pt-BR") + " | Semana " + state.week + "/8 | Armazenamento: " + Storage.mode);
  lines.push("Linha de base: " + (state.baselineDone ? "feita" : "PENDENTE") + " | Avaliação final: " + (state.completed ? "feita" : "pendente") + " | Retenção 30 dias: " + (state.retentionDone ? "feita" : "pendente"));

  head("1. RESUMO EXECUTIVO");
  lines.push("• Idade: " + (state.context.age || "—") + " | Aparelho: " + (state.context.device || "—"));
  lines.push("• Queixa principal: " + (state.context.complaint || "—"));
  lines.push("• Interesses usados no conteúdo: " + (state.context.interests || "—"));
  lines.push("• Sessões de treino registradas: " + state.sessions.length + " | Semana atual: " + done + "/" + planned + " dias (" + adherence + "%)");
  lines.push("• Estado de segurança: " + (state.paused ? "treino PAUSADO por evento adverso" : "nenhum evento ativo; treino liberado"));
  if (!baseH) lines.push("• Sem HHIE-S de linha de base: qualquer comparação funcional fica inválida.");

  head("2. INDICADORES DE DESEMPENHO");
  lines.push("2.1 Funcional — HHIE-S (desfecho primário, 0–40, respondido sem o aparelho)");
  if (baseH) lines.push("• Linha de base: " + baseH.score + "/40 (" + bandLabel(baseH.band) + ") em " + fmtDay(baseH.date));
  if (lastH && (!baseH || lastH.id !== baseH.id)) lines.push("• Último: " + lastH.score + "/40 (" + bandLabel(lastH.band) + ") em " + fmtDay(lastH.date));
  if (baseH && lastH && lastH.id !== baseH.id) lines.push("• Mudança: " + (lastH.score - baseH.score >= 0 ? "+" : "") + (lastH.score - baseH.score) + " pontos — menor é melhor (não há MCID validado para o HHIE-S; 4 pontos é apenas gatilho prático de revisão)");
  if (!baseH) lines.push("• Sem registro.");
  lines.push("2.2 Tarefa treinada — fala em ruído (dB relativo, 4 alternativas, NÃO QuickSIN)");
  if (baseS) lines.push("• Linha de base: " + baseS.thresholdDb + " dB" + (baseS.rangeDb == null ? "" : " ± " + baseS.rangeDb) + " (forma " + baseS.form + ")");
  if (lastS) lines.push("• Último: " + lastS.thresholdDb + " dB" + (lastS.rangeDb == null ? "" : " ± " + lastS.rangeDb) + " (forma " + lastS.form + ")");
  if (baseS && lastS && lastS.id !== baseS.id) {
    const d = Math.round((lastS.thresholdDb - baseS.thresholdDb) * 10) / 10;
    const range = (baseS.rangeDb || 0) + (lastS.rangeDb || 0);
    lines.push("• Mudança: " + (d >= 0 ? "+" : "") + d + " dB" + (Math.abs(d) <= range ? " — dentro da faixa de medição; não interpretar" : " — acima da faixa; menor é melhor, mas ainda não é prova clínica"));
  }
  lines.push("• Voz sintética, vocabulário fechado, formas não equacionadas. Não é audiograma nem SNR loss clínico.");
  lines.push("2.3 Transferência — formas de frase nunca treinadas");
  if (baseS && lastS && lastS.form !== baseS.form) {
    lines.push("• Há medida em forma diferente da linha de base (" + baseS.form + " → " + lastS.form + ").");
    lines.push("• A evidência mostra transferência limitada para materiais não treinados; trate como exploratório.");
  } else {
    lines.push("• Ainda não há medida em forma diferente da linha de base; sem indicador de transferência.");
  }
  const rlBase = latestByTimepoint(state.realLife, "baseline");
  const rlLast = latestOverall(state.realLife);
  lines.push("2.4 Vida real — compreensão de frases longas (exploratória, % de acerto)");
  if (rlBase && !rlBase.skipped) lines.push("• Primeira medida (referência): " + rlBase.percent + "% em " + fmtDay(rlBase.date) + " · conjunto " + rlBase.set);
  if (rlLast && !rlLast.skipped && (!rlBase || rlLast.id !== rlBase.id)) lines.push("• Última: " + rlLast.percent + "% em " + fmtDay(rlLast.date) + " · conjunto " + rlLast.set);
  if (rlBase && rlLast && rlLast.id !== rlBase.id && rlBase.percent != null && rlLast.percent != null) {
    const d = rlLast.percent - rlBase.percent;
    lines.push("• Mudança: " + (d >= 0 ? "+" : "") + d + " pontos percentuais" + (rlBase.set !== rlLast.set ? " (conjuntos diferentes de frases; comparar com cautela)" : ""));
  }
  if (!rlBase || rlBase.skipped) lines.push("• Sem medida válida deste bloco; a primeira execução passa a ser a referência.");
  lines.push("• Bloco fixo, não adaptativo, no mesmo ruído. Frases longas medem audição, memória e atenção juntas; mudança aqui não é prova de transferência para a vida real.");

  const rsBase = latestByTimepoint(state.runningSpeech, "baseline");
  const rsLast = latestOverall(state.runningSpeech);
  lines.push("2.5 Fala corrida — texto de telejornal/entrevista (exploratória, % de acerto)");
  if (rsBase && !rsBase.skipped) lines.push("• Primeira medida (referência): " + rsBase.percent + "% em " + fmtDay(rsBase.date) + " · " + rsBase.tier + " · " + rsBase.genre);
  if (rsLast && !rsLast.skipped && (!rsBase || rsLast.id !== rsBase.id)) lines.push("• Última: " + rsLast.percent + "% em " + fmtDay(rsLast.date) + " · " + rsLast.tier + " · " + rsLast.genre);
  if (rsBase && rsLast && rsLast.id !== rsBase.id && rsBase.percent != null && rsLast.percent != null) {
    const d = rsLast.percent - rsBase.percent;
    lines.push("• Mudança: " + (d >= 0 ? "+" : "") + d + " pontos percentuais" + (rsBase.passageId !== rsLast.passageId ? " (textos diferentes; comparar com cautela)" : "") + ".");
  }
  if (!rsBase || rsBase.skipped) lines.push("• Sem medida válida deste bloco; a primeira execução passa a ser a referência.");
  const runsDisc = (state.discourse || []).slice(-4);
  if (runsDisc.length) {
    const avg = Math.round(runsDisc.reduce((a, r) => a + Number(r.percent || 0), 0) / runsDisc.length);
    const rep = runsDisc.reduce((a, r) => a + Number(r.replays || 0), 0);
    lines.push("• Treino de texto corrido (últimos " + runsDisc.length + "): média " + avg + "% · repetições pedidas: " + rep + " · níveis: " + Array.from(new Set(runsDisc.map(r => r.tier))).join(", "));
  }
  lines.push("• Texto corrido não para e não repete: é a condição da TV e do YouTube. Quatro perguntas por texto; cada uma vale 25 pontos percentuais. Mede audição, memória e atenção juntas — não é limiar auditivo.");
  lines.push("2.6 Temporal — gap (tarefa específica)");
  if (baseG) lines.push("• Linha de base: " + baseG.thresholdMs + " ms" + (baseG.lowMs == null ? "" : " (" + baseG.lowMs + "–" + baseG.highMs + ")"));
  if (lastG) lines.push("• Último: " + lastG.thresholdMs + " ms" + (lastG.lowMs == null ? "" : " (" + lastG.lowMs + "–" + lastG.highMs + ")") + (lastG.falsePositiveRate != null ? " | falso positivo " + Math.round(lastG.falsePositiveRate * 100) + "%" : ""));
  lines.push("• O treino melhora a tarefa treinada; transferência para fala no ruído não foi estabelecida.");
  lines.push("2.7 Vida real — diário, TV, parceiro e música");
  if (diary) lines.push("• Diário da semana " + state.week + ": TV sem repetir " + diary.tv + " | conversas " + diary.conv + " | cansaço " + diary.fatigue + "/10 | " + (diary.note || "sem nota"));
  else lines.push("• Sem diário nesta semana.");
  const diaryWeeks = Object.keys(state.diary || {}).map(Number).filter(w => state.diary[w] && (state.diary[w].date || state.diary[w].updatedAt)).sort((a, b) => a - b);
  const otherWeeks = diaryWeeks.filter(w => Number(w) !== Number(state.week));
  if (otherWeeks.length) {
    lines.push("• Diários de outras semanas (guardados, não apagados):");
    otherWeeks.forEach(w => {
      const dd = state.diary[w];
      lines.push("  - semana " + w + ": TV " + (dd.tv || "—") + " | conversas " + (dd.conv || "—") + " | cansaço " + (dd.fatigue == null ? "—" : dd.fatigue + "/10") + " | " + (dd.note || "sem nota"));
    });
  }
  if (tv) lines.push("• Escada de TV: " + tv.map((v, i) => (v ? "✔" : "—") + " " + ["telejornal", "entrevista", "novela com perguntas", "filme com música"][i]).join(" | "));
  if (partner) lines.push("• Parceiro: " + (partner.sessions || 0) + " sessão(ões) de 20 min nesta semana; regras marcadas: " + Object.keys(partner.rules || {}).filter(k => partner.rules[k]).join(", "));
  lines.push("• Música: " + music + " sessão(ões) nesta semana (alvo 2).");

  head("3. INTERPRETAÇÃO E CONFIANÇA");
  lines.push("• HHIE-S: confiança MODERADA. Instrumento de triagem validado e adaptado ao português brasileiro; mede handicap percebido, não sensibilidade auditiva.");
  lines.push("• Fala em ruído: confiança BAIXA. Não calibrado, voz sintética, 12 ensaios e faixa de medição ampla; use apenas para acompanhar a mesma pessoa.");
  lines.push("• Transferência: confiança BAIXA. Formas não equacionadas e evidência de generalização limitada.");
  lines.push("• Gap: confiança MODERADA para a tarefa treinada e BAIXA para qualquer efeito na fala.");
  lines.push("• Aderência e segurança: confiança ALTA para o que foi registrado; eventos não registrados não aparecem.");
  lines.push("• Nenhum número aqui autoriza afirmar mudança fisiológica, prevenção de demência ou cura.");

  head("4. ADERÊNCIA E DOSE");
  if (cfg) lines.push("• Semana " + state.week + ": " + done + "/" + planned + " dias com treino (" + sessionCount + " sessões).");
  lines.push("• Sessões totais: " + state.sessions.length + " | Dose hoje: " + Math.floor(doseToday() / 60) + "/10 min (teto de tolerabilidade, não dose ótima).");
  lines.push("• Modelo: sessões curtas em 2–3 dias por semana; o estudo de dose testou 2–3×/semana, não todos os dias.");
  lines.push("• Mais de uma sessão no mesmo dia é permitida; o dia conta uma vez para a adesão e o teto de 10 min/dia continua valendo.");
  if (state.sessions.length) {
    const last = state.sessions[state.sessions.length - 1];
    lines.push("• Última sessão: " + fmtDay(last.date) + " | acerto no núcleo " + last.accuracy + "% | SNR " + last.startSnr + " → " + last.endSnr + " dB | ruído " + noiseLabel(last.noise) + " nível " + last.level);
  }

  head("5. SEGURANÇA");
  lines.push("• Treino: " + (state.paused ? "PAUSADO por evento" : "liberado"));
  lines.push("• Eventos registrados: " + state.events.length);
  state.events.slice(-3).forEach(e => lines.push("  - " + fmtDay(e.date) + ": " + e.description));
  lines.push("• Sinais de parada: " + STOP_SIGNS_PT.join("; ") + ".");
  lines.push("• Precauções: não usar streaming de TV ou telefone em escadas ou na rua; não treinar com dor, secreção, tontura ou zumbido novo unilateral.");

  head("6. PRÓXIMOS PASSOS");
  if (!state.baselineDone) lines.push("• Fazer a avaliação inicial (HHIE-S, fala em ruído e gap) antes de qualquer treino.");
  if (state.paused) lines.push("• Manter o treino pausado até avaliação profissional e usar ‘Liberar retomada’ somente depois.");
  if (cfg && done < planned) lines.push("• Concluir as sessões da semana " + state.week + " sem compensar dias perdidos.");
  if (state.week >= 4 && !latestByTimepoint(state.hhie, "week4")) lines.push("• Fazer a reavaliação da semana 4 com forma de frase não treinada.");
  if (state.week >= 8 && !latestByTimepoint(state.hhie, "week8")) lines.push("• Fazer a reavaliação final da semana 8 e revisar a audiometria.");
  if (state.completed && !state.retentionDone) lines.push("• Agendar a medida de retenção cerca de 30 dias após a avaliação final.");
  lines.push("• Levar este relatório e o pacote JSON para a próxima consulta; o profissional decide qualquer mudança de aparelho ou conduta.");

  head("LIMITAÇÕES");
  LIMITS_PT.forEach(x => lines.push("• " + x));

  head("BASE CIENTÍFICA PRINCIPAL");
  ["humes_dosage_2014", "humes_specificity_2014", "transfer_limits_2020", "quicksin_measure_2004", "gap_training_2013", "hhie_s_screening", "achieve_2023"].forEach(k => {
    if (CITATIONS[k]) lines.push("• " + CITATIONS[k]);
  });
  lines.push("");
  lines.push("Este relatório descreve desempenho de tarefa e autorrelato. Não é prova de mudança fisiológica, não é diagnóstico e não substitui avaliação profissional.");

  const text = lines.join("\n");
  const out = $("#reportOut");
  out.textContent = text;
  out.classList.remove("hidden");
  $("#btnCopyReport").classList.remove("hidden");
  $("#btnCopyReport").onclick = () => copyText(text).then(ok => toast(ok ? "Relatório copiado." : "Copie manualmente."));
}


function buildPackage() {
  const protocol = protocolFor();
  const cfg = weekConfig(protocol, state.week);
  const baseSpeech = latestByTimepoint(state.speechTests, "baseline");
  const transfer = baseSpeech
    ? state.speechTests.filter(t => t.form !== baseSpeech.form)
    : [];
  const lastSession = state.sessions.length ? state.sessions[state.sessions.length - 1] : null;
  const engLimits = protocol ? protocol.limits : {};
  return {
    schema: "audioswarm.v1.1",
    contract: "audioswarm.v1",
    generatedAt: new Date().toISOString(),
    app: { name: "Estação de Treino Auditivo", version: APP_VERSION, build: BUILD },
    storage: Storage.mode,
    storageMode: Storage.mode,
    limits: Object.assign({}, engLimits, {
      dailySeconds: DOSE_CAP_SECONDS,
      minutesPerDayCap: DOSE_CAP_SECONDS / 60,
      calibratedDb: false,
      calibrated_db: false,
      clinicalInference: false,
      clinical_inference: false,
      medicalDevice: false,
      medical_device: false,
      controlGroup: false,
      control_group: false,
      transferGuaranteed: false,
      transfer_guaranteed: false,
      syntheticSpeech: true,
      synthetic_speech: true,
      notes: LIMITS_PT
    }),
    context: state.context,
    profile: state.profile,
    protocol: {
      week: state.week,
      baselineDone: state.baselineDone,
      completed: state.completed,
      retentionDone: state.retentionDone,
      plannedSessionsThisWeek: cfg ? cfg.sessions_planned : null,
      sessionsCompletedThisWeek: sessionsThisWeek(),
      trainingDaysThisWeek: trainingDaysThisWeek(),
      sessionsTotal: state.sessions.length,
      doseTodaySeconds: doseToday(),
      minutesPerDay: Math.round(doseToday() / 60 * 10) / 10,
      dailyCapSeconds: DOSE_CAP_SECONDS,
      adherencePct: cfg && cfg.sessions_planned ? Math.min(100, Math.round(trainingDaysThisWeek() / cfg.sessions_planned * 100)) : null
    },
    planning: protocol ? {
      measurement: protocol.measurement,
      training: protocol.training,
      plan: protocol.plan,
      followup: protocol.followup,
      limits: protocol.limits,
      references: protocol.references
    } : null,
    measurement: protocol ? protocol.measurement : null,
    training: protocol ? protocol.training : null,
    plan: protocol ? protocol.plan : null,
    references: protocol ? protocol.references : [],
    outcomes: {
      hhie_s: state.hhie,
      speech_in_noise: state.speechTests,
      real_life_comprehension: state.realLife,
      running_speech: state.runningSpeech,
      gap_detection: state.gapTests,
      transfer: transfer,
      diary: state.diary,
      tv: state.tv,
      partner: state.partner,
      music: state.music
    },
    runningStats: (state.runningSpeech || []).map(r => ({
      date: r.date,
      timepoint: r.timepoint,
      set: r.set,
      passageId: r.passageId,
      tier: r.tier,
      genre: r.genre,
      scored: r.scored,
      correct: r.correct,
      percent: r.percent,
      replays: r.replays,
      adaptive: false,
      skipped: r.skipped
    })),
    discourseStats: (state.discourse || []).map(r => ({
      date: r.date,
      week: r.week,
      tier: r.tier,
      genre: r.genre,
      passageId: r.passageId,
      scored: r.scored,
      correct: r.correct,
      percent: r.percent,
      replays: r.replays
    })),
    realLifeStats: (state.realLife || []).map(r => ({
      date: r.date,
      timepoint: r.timepoint,
      set: r.set,
      items: r.items,
      scored: r.scored,
      correct: r.correct,
      percent: r.percent,
      snr: r.snr,
      adaptive: false,
      skipped: r.skipped
    })),
    gapStats: state.gapTests.map(g => ({
      date: g.date,
      timepoint: g.timepoint,
      thresholdMs: g.thresholdMs,
      lowMs: g.lowMs,
      highMs: g.highMs,
      nReversals: g.nReversals,
      censored: g.censored,
      falsePositiveRate: g.falsePositiveRate,
      catchTrials: g.catchTrials,
      scoredTrials: g.scoredTrials
    })),
    sessions: state.sessions,
    mods: lastSession ? {
      noise: lastSession.noise,
      level: lastSession.level,
      rate: lastSession.rate,
      snrStart: lastSession.startSnr,
      snrEnd: lastSession.endSnr
    } : {
      noise: (cfg && cfg.noise) || null,
      level: (cfg && cfg.noise_level) || null,
      rate: (cfg && cfg.rate) || null,
      snrStart: (cfg && cfg.snr_start_db) || null,
      snrEnd: null
    },
    safety: {
      paused: state.paused,
      events: state.events,
      stopSigns: STOP_SIGNS_PT,
      precautions: [
        "não usar streaming de TV ou telefone em escadas ou na rua",
        "não treinar com dor, secreção, tontura ou zumbido novo unilateral",
        "interromper a sessão ao primeiro sinal de cansaço"
      ]
    }
  };
}

function downloadText(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (e) {
    return false;
  }
}

/* ---- código de retomada: estado inteiro em texto, para trocar de origem ---- */

function b64encode(text) {
  const bytes = new TextEncoder ? new TextEncoder().encode(text) : null;
  if (bytes) {
    let bin = "";
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  return btoa(unescape(encodeURIComponent(text)));
}

function b64decode(text) {
  const bin = atob(text);
  if (typeof TextDecoder !== "undefined") {
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(escape(bin));
}

const RESUME_PREFIX = "AW1.";

function makeResumeCode() {
  const payload = { kind: "audioswarm.resume", savedAt: new Date().toISOString(), state: state };
  return RESUME_PREFIX + b64encode(JSON.stringify(payload));
}

function applyResumeCode(raw) {
  const text = String(raw || "").trim();
  if (!text) { toast("Cole o código de retomada primeiro."); return false; }
  let json = null;
  try {
    json = text.startsWith(RESUME_PREFIX) ? b64decode(text.slice(RESUME_PREFIX.length)) : null;
  } catch (e) { json = null; }
  if (!json) {
    /* aceita também o pacote audioswarm colado como texto */
    try { const pkg = JSON.parse(text); if (pkg && String(pkg.schema || "").indexOf("audioswarm") === 0) { applyPackage(text); return true; } } catch (e) { /* nada */ }
    toast("Código inválido. Confira se copiou inteiro.");
    return false;
  }
  let payload = null;
  try { payload = JSON.parse(json); } catch (e) { payload = null; }
  if (!payload || !payload.state || typeof payload.state !== "object") {
    toast("Código sem progresso reconhecível.");
    return false;
  }
  if (!confirm("Restaurar o progresso deste código substitui o que está neste navegador. Continuar?")) return false;
  state = migrateState(payload.state);
  restoredFrom = "código";
  diaryViewWeek = Number(state.diaryViewWeek) || Number(state.week);
  mergeHotDiary();
  save();
  renderAll();
  renderAssessment();
  renderResumeNotice();
  const status = $("#resumeCodeStatus");
  if (status) status.textContent = "Restaurado: semana " + state.week + " · " + state.sessions.length + " sessão(ões) · " + (state.baselineDone ? "com avaliação inicial" : "sem avaliação inicial") + ".";
  toast("Progresso restaurado: semana " + state.week + ".");
  return true;
}

function exportPackage() {
  const pkg = buildPackage();
  const text = JSON.stringify(pkg, null, 2);
  const ta = $("#packageOut");
  if (ta) {
    ta.value = text;
    ta.classList.remove("hidden");
  }
  const copy = $("#btnCopyPackage");
  if (copy) {
    copy.classList.remove("hidden");
    copy.onclick = () => copyText(text).then(ok => toast(ok ? "Pacote copiado." : "Selecione e copie manualmente."));
  }
  const stamp = todayKey();
  const downloaded = downloadText("audioswarm-" + stamp + ".json", text);
  toast(downloaded ? "Pacote exportado como arquivo JSON e disponível para copiar." : "Pacote gerado. Copie o texto.");
}

function readJSONFile(callback) {
  if (typeof FileReader === "undefined" || !document.createElement("input").files) {
    const raw = prompt("Cole o JSON do pacote audioswarm:");
    if (raw) callback(raw);
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json,text/plain";
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) { input.remove(); return; }
    const reader = new FileReader();
    reader.onload = () => { input.remove(); callback(String(reader.result || "")); };
    reader.onerror = () => { input.remove(); alert("Não foi possível ler o arquivo."); };
    reader.readAsText(file);
  });
  input.click();
}


function importPackage() {
  readJSONFile(raw => applyPackage(raw));
}

function applyPackage(raw) {
  if (!raw) return;
  let pkg;
  try { pkg = JSON.parse(raw); } catch (e) { alert("JSON inválido."); return; }
  if (!pkg || String(pkg.schema || "").indexOf("audioswarm") !== 0) { alert("Pacote não reconhecido: schema ausente."); return; }
  if (!confirm("Importar substituirá os dados atuais. Continuar?")) return;
  if (pkg.context) state.context = Object.assign({}, state.context, pkg.context);
  if (pkg.profile) state.profile = Object.assign({}, state.profile, pkg.profile);
  if (Array.isArray(pkg.sessions)) {
    state.sessions = pkg.sessions.map(s => ({
      id: s.id || "imp" + Math.random().toString(36).slice(2),
      date: s.date || new Date().toISOString(),
      week: Number(s.week || 1),
      accuracy: Number(s.accuracy != null ? s.accuracy : s.scorePct || 0),
      correct: Number(s.correct || 0),
      total: Number(s.total || 0),
      startSnr: s.startSnr != null ? s.startSnr : "—",
      endSnr: s.endSnr != null ? s.endSnr : "—",
      moves: Number(s.moves || 0),
      fatigue: s.fatigue != null ? s.fatigue : null,
      durationSec: Number(s.durationSec || 0),
      noise: s.noise || "—",
      level: s.level != null ? s.level : "—",
      rate: s.rate != null ? s.rate : (s.speed != null ? s.speed : 0.9),
      endedOnSuccess: Boolean(s.endedOnSuccess),
      gap: s.gap || null,
      legacy: true
    }));
  }
  if (pkg.outcomes) {
    if (Array.isArray(pkg.outcomes.hhie_s)) state.hhie = pkg.outcomes.hhie_s;
    if (Array.isArray(pkg.outcomes.speech_in_noise)) state.speechTests = pkg.outcomes.speech_in_noise;
    if (Array.isArray(pkg.outcomes.gap_detection)) state.gapTests = pkg.outcomes.gap_detection;
    if (pkg.outcomes.diary && typeof pkg.outcomes.diary === "object") state.diary = pkg.outcomes.diary;
    if (pkg.outcomes.tv && typeof pkg.outcomes.tv === "object") state.tv = pkg.outcomes.tv;
    if (pkg.outcomes.partner && typeof pkg.outcomes.partner === "object") state.partner = pkg.outcomes.partner;
    if (pkg.outcomes.music && typeof pkg.outcomes.music === "object") state.music = pkg.outcomes.music;
  }
  if (pkg.safety) {
    state.paused = Boolean(pkg.safety.paused);
    if (Array.isArray(pkg.safety.events)) state.events = pkg.safety.events;
  }
  if (pkg.protocol) {
    state.week = Math.max(1, Math.min(8, Number(pkg.protocol.week || 1)));
    state.baselineDone = Boolean(pkg.protocol.baselineDone);
    state.completed = Boolean(pkg.protocol.completed);
    state.retentionDone = Boolean(pkg.protocol.retentionDone);
  }
  if (Array.isArray(pkg.objectives)) state.legacyObjectives = pkg.objectives;
  save();
  renderAll();
  alert("Pacote importado.");
}


/* ------------------------------------------------------------------ */
/* Plano personalizado                                                 */
/* ------------------------------------------------------------------ */

const PROFILE_FIELDS = [
  { id: "hearing_aid", label: "Marca e modelo dos aparelhos", type: "text" },
  { id: "hearing_aid_streaming", label: "Os aparelhos já transmitem áudio da TV?", type: "select", options: ["none", "bluetooth", "tv_adapter", "remote_mic", "unknown"] },
  { id: "tv_setup", label: "Como é a TV da casa?", type: "select", options: ["smart_tv", "cable_box", "old_tv", "streaming_stick", "unknown"] },
  { id: "tv_can_configure", label: "Alguém consegue configurar a TV hoje?", type: "bool" },
  { id: "favourite_program", label: "Programa favorito", type: "text" },
  { id: "favourite_time", label: "Horário em que costuma assistir", type: "text" },
  { id: "living", label: "Com quem mora?", type: "select", options: ["alone", "with_family", "care_facility"] },
  { id: "caregiver_hours_per_day", label: "Horas por dia com cuidador por perto", type: "number" },
  { id: "top_complaints", label: "Principais queixas", type: "complaints", options: ["tv", "noise", "group", "phone", "quick_speech", "female_voice", "fatigue"] },
  { id: "medications_ototoxic", label: "Usa medicamentos que podem afetar audição ou equilíbrio?", type: "bool" },
  { id: "walk_minutes_per_day", label: "Minutos de caminhada por dia", type: "number" },
  { id: "uses_captions", label: "Costuma usar legenda?", type: "bool" },
  { id: "tinnitus", label: "Tem zumbido?", type: "bool" },
  { id: "falls_last_year", label: "Quedas no último ano", type: "number" },
  { id: "cognitive_impairment", label: "Diagnóstico de declínio cognitivo?", type: "bool" }
];

const OPTION_PT = {
  none: "Não", bluetooth: "Bluetooth", tv_adapter: "Adaptador de TV", remote_mic: "Microfone remoto", unknown: "Não sei",
  smart_tv: "Smart TV", cable_box: "TV a cabo", old_tv: "TV antiga", streaming_stick: "Fire Stick / Chromecast",
  alone: "Mora sozinho", with_family: "Com a família", care_facility: "Instituição de cuidado"
};

const COMPLAINT_PT = {
  tv: "TV", noise: "ruído", group: "grupo", phone: "telefone",
  quick_speech: "fala rápida", female_voice: "voz feminina", fatigue: "cansaço"
};

const CONTEXT_FIELDS = [
  { id: "age", label: "Idade", type: "number" },
  { id: "device", label: "Aparelho auditivo (marca, modelo, idade)", type: "text" },
  { id: "mfi", label: "Made for iPhone / streaming?", type: "bool" },
  { id: "interests", label: "Interesses (para o conteúdo)", type: "text" },
  { id: "complaint", label: "Queixa principal", type: "text" },
  { id: "autonomy", label: "Autonomia e mobilidade", type: "text" }
];

function renderPlanForms() {
  if (planRendered) return;
  planRendered = true;
  const box = $("#profileForm");
  if (!box) return;
  box.innerHTML = "";
  PROFILE_FIELDS.forEach(f => {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.className = "field";
    label.textContent = f.label;
    label.htmlFor = "pf_" + f.id;
    wrap.appendChild(label);
    let input;
    if (f.type === "select") {
      input = document.createElement("select");
      input.id = "pf_" + f.id;
      f.options.forEach(o => {
        const op = document.createElement("option");
        op.value = o; op.textContent = OPTION_PT[o] || o;
        if (state.profile[f.id] === o) op.selected = true;
        input.appendChild(op);
      });
    } else if (f.type === "bool") {
      input = document.createElement("select");
      input.id = "pf_" + f.id;
      [["true", "Sim"], ["false", "Não"]].forEach(([v, t]) => {
        const op = document.createElement("option");
        op.value = v; op.textContent = t;
        if (String(Boolean(state.profile[f.id])) === v) op.selected = true;
        input.appendChild(op);
      });
    } else if (f.type === "complaints") {
      input = document.createElement("div");
      input.id = "pf_" + f.id;
      const selected = state.profile[f.id] || [];
      input.innerHTML = f.options.map(o =>
        "<label class='checkline'><input type='checkbox' data-complaint='" + o + "' " + (selected.indexOf(o) >= 0 ? "checked" : "") + "><span>" + esc(COMPLAINT_PT[o] || o) + "</span></label>"
      ).join("");
    } else {
      input = document.createElement("input");
      input.id = "pf_" + f.id;
      input.type = f.type === "number" ? "number" : "text";
      input.value = state.profile[f.id] != null ? state.profile[f.id] : "";
    }
    wrap.appendChild(input);
    box.appendChild(wrap);
  });
  const ctx = $("#contextForm");
  if (ctx) {
    ctx.innerHTML = "";
    CONTEXT_FIELDS.forEach(f => {
      const wrap = document.createElement("div");
      const label = document.createElement("label");
      label.className = "field";
      label.textContent = f.label;
      label.htmlFor = "ctx_" + f.id;
      wrap.appendChild(label);
      let input;
      if (f.type === "bool") {
        input = document.createElement("select");
        input.id = "ctx_" + f.id;
        [["true", "Sim"], ["false", "Não"]].forEach(([v, t]) => {
          const op = document.createElement("option");
          op.value = v; op.textContent = t;
          if (String(Boolean(state.context[f.id])) === v) op.selected = true;
          input.appendChild(op);
        });
      } else {
        input = document.createElement("input");
        input.id = "ctx_" + f.id;
        input.type = f.type === "number" ? "number" : "text";
        input.value = state.context[f.id] != null ? state.context[f.id] : "";
      }
      wrap.appendChild(input);
      ctx.appendChild(wrap);
    });
  }
}

function readProfileFromForm() {
  const p = {};
  PROFILE_FIELDS.forEach(f => {
    const el = $("#pf_" + f.id);
    if (!el) return;
    if (f.type === "number") p[f.id] = Number(el.value || 0);
    else if (f.type === "bool") p[f.id] = el.value === "true";
    else if (f.type === "complaints") p[f.id] = $$("input[data-complaint]:checked", el).map(x => x.dataset.complaint);
    else p[f.id] = el.value;
  });
  return p;
}

function readContextFromForm() {
  const c = { interests: state.context.interests, complaint: state.context.complaint, autonomy: state.context.autonomy };
  CONTEXT_FIELDS.forEach(f => {
    const el = $("#ctx_" + f.id);
    if (!el) return;
    if (f.type === "number") c[f.id] = Number(el.value || 0);
    else if (f.type === "bool") c[f.id] = el.value === "true";
    else c[f.id] = el.value;
  });
  return c;
}

function buildAndRenderProtocol() {
  if (!engine()) { alert("O motor local (protocol.js) não carregou. Recarregue a página."); return; }
  const p = readProfileFromForm();
  if (!p.top_complaints || !p.top_complaints.length) { alert("Escolha pelo menos uma queixa."); return; }
  let protocol;
  try { protocol = engine().buildProtocol(p); }
  catch (err) { $("#protocolOut").innerHTML = "<div class='card err'>Não foi possível gerar: " + esc(err.message) + "</div>"; return; }
  state.profile = p;
  state.context = readContextFromForm();
  save();
  renderProtocol(protocol);
  toast("Protocolo gerado e salvo.");
}

function renderProtocol(protocol) {
  const out = $("#protocolOut");
  if (!out) return;
  const parts = [];
  parts.push("<div class='card ok'><h2>Resumo do motor</h2><p>" + protocol.agents.length + " agentes, " + protocol.plan.length + " semanas, " + protocol.references.length + " referências resolvidas. Nenhuma decisão por modelo de linguagem.</p><p class='small muted'>Esta aba mostra o texto técnico e auditável do motor, em inglês. A interface do app e o relatório estão em português.</p></div>");
  protocol.agents.forEach(a => parts.push(renderAgent(a)));
  parts.push("<div class='card'><h2>Plano de 8 semanas</h2>" + table(["Semana", "Foco", "Ação principal", "TV"], protocol.plan.map(w => ["<strong>" + esc(w.week) + "</strong>", esc(w.focus), esc((w.actions || []).join(" · ")), esc(w.tv_content)])) + "</div>");
  parts.push("<div class='card'><h2>Acompanhamento</h2>" + table(["Semana", "Checkpoint", "Medir", "Alvo", "Se não atingir"], protocol.followup.map(s => [esc(s.week), esc(s.checkpoint), esc(s.measures.join(" · ")), esc(s.target), esc(s.action_if_not_met)])) + "</div>");
  const m = protocol.measurement;
  parts.push("<div class='card'><h2>Plano de medição</h2><p class='muted'>Desfecho primário: " + esc(m.primary_outcome) + ".</p>" +
    table(["Nível", "Medida", "Papel", "O que é"], m.outcome_hierarchy.map(x => [esc(x.level), esc(x.measure), esc(x.role), esc(x.statement)])) +
    "<h3>Regras</h3><ul>" + m.rules.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" +
    "<h3>Limites</h3><ul>" + m.limits.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>");
  const ct = protocol.content;
  if (ct) {
    parts.push("<div class='card'><h2>Conteúdo das frases</h2><p class='muted'>" + esc(ct.principle) + "</p>" +
      table(["Semana", "Níveis", "Foco"], ct.training_ladder.map(r => [esc(r.weeks.join("–")), esc(r.tiers.join(" + ")), esc(r.focus)])) +
      "<h3>Degraus</h3>" + table(["Nível", "Máx. palavras", "O que é", "Por quê"], Object.keys(ct.material.tiers).map(k => [esc(k), esc(ct.material.tiers[k].max_words), esc(ct.material.tiers[k].what), esc(ct.material.tiers[k].why)])) +
      (Array.isArray(ct.discourse_ladder) ? "<h3>Texto corrido</h3>" + table(["Semana", "Nível", "Foco"], ct.discourse_ladder.map(r => [esc(r.weeks.join("–")), esc(r.tier), esc(r.focus)])) : "") +
      "<h3>Material</h3><ul>" +
      "<li>Prática: " + esc(ct.material.practice_items) + " · formas A/B/C: " + esc(ct.material.test_forms.A) + " cada · treino: " + esc(ct.material.training_items) + " · vida real: " + esc(ct.material.real_life_items) + " · texto corrido: " + esc(ct.material.discourse_passages) + " textos e " + esc(ct.material.discourse_questions) + " perguntas</li>" +
      "<li>" + esc(ct.material.kept_simple) + "</li><li>" + esc(ct.material.test_forms_untouched) + "</li>" +
      "</ul><p class='small'>" + esc(ct.plan) + "</p></div>");
  }
  const tr = protocol.training;
  parts.push("<div class='card'><h2>Plano de treino no app</h2><p class='muted'>" + esc(tr.model) + ". " + esc(tr.dose_note) + "</p>" +
    table(["Semana", "Sessões", "Min", "SNR inicial", "Velocidade", "Ruído", "Foco"], tr.weeks.map(w => [esc(w.week), esc(w.sessions_planned), esc(w.minutes), esc(w.snr_start_db) + " dB", esc(w.rate) + "x", esc(w.noise) + " n" + esc(w.noise_level), esc(w.focus)])) +
    "<h3>Limites do treino</h3><ul>" + tr.limits.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>");
  parts.push("<div class='card warn'><h2>Limites globais</h2><ul>" + protocol.limits.notes.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul><p class='small'>calibrated_db=" + esc(protocol.limits.calibrated_db) + " · medical_device=" + esc(protocol.limits.medical_device) + " · clinical_inference=" + esc(protocol.limits.clinical_inference) + "</p></div>");
  parts.push("<div class='card'><h2>Referências</h2><p class='small muted'>" + esc(protocol.references.join(", ")) + "</p><div class='small'>" + protocol.references.filter(k => CITATIONS[k]).map(k => "<p><strong>" + esc(k) + "</strong>: " + esc(CITATIONS[k]) + "</p>").join("") + "</div></div>");
  out.innerHTML = parts.join("");
}

function renderAgent(a) {
  const fired = (a.triggers || []).filter(t => t.fired).map(t => t.id).join(", ") || "nenhum";
  const stop = Array.isArray(a.stop_criteria) ? a.stop_criteria.join(" · ") : a.stop_criteria;
  let html = "<div class='card'><h2>" + esc(a.agent) + "</h2><p class='muted'>" + esc(a.objective) + "</p><p class='small'><em>" + esc(a.rationale) + "</em></p>";
  html += "<p class='small'><span class='badge'>gatilhos: " + esc(fired) + "</span> <span class='badge'>parada: " + esc(stop) + "</span></p>";
  if (a.actions) {
    a.actions.forEach(act => {
      html += "<div class='kv'><div><strong>" + esc(act.action) + "</strong> <span class='badge'>P" + esc(act.priority) + " · " + esc(act.effort) + " · custo " + esc(act.cost_band) + "</span><br><span class='small muted'>" + esc(act.detail) + "</span><br><span class='small'>efeito esperado: " + esc(act.expected_effect) + "</span><br><span class='tiny muted'>refs: " + esc((act.refs || []).join(", ")) + "</span></div></div>";
    });
  }
  if (a.micro_sessions_per_day != null) {
    html += "<div class='kv'><span>Sessões/dia</span><span class='v'>" + esc(a.micro_sessions_per_day) + " (uma por dia de treino)</span></div>";
    html += "<div class='kv'><span>Minutos/sessão</span><span class='v'>" + esc(a.minutes_per_session) + "</span></div>";
    html += "<div class='kv'><span>Dias/semana</span><span class='v'>" + esc(a.days_per_week) + "</span></div>";
    html += "<div class='kv'><span>Teto diário</span><span class='v'>" + esc(a.dose_cap_seconds) + " s</span></div>";
    html += "<p class='small muted'>" + esc(a.dose_rationale) + "</p>";
    html += "<div class='kv'><span>Platô esperado</span><span class='v'>" + esc(a.expected_plateau_weeks) + "</span></div>";
    html += listHtml("Estrutura", a.session_structure) + listHtml("Progressão", a.progression) + listHtml("Sinais de fadiga", a.fatigue_signs) + listHtml("Regras de parada", a.stop_rules);
  }
  if (a.tv_ladder) {
    html += "<div class='kv'><span>Escada de TV</span><span class='v'>" + esc(a.tv_ladder.join(" → ")) + "</span></div>";
    html += listHtml("Alvos por degrau", a.tv_ladder.map(t => t + ": " + (a.tv_targets[t] || "")));
    html += listHtml("Escada de telefone", a.phone_ladder);
    html += listHtml("Escada de conversa", a.conversation_ladder);
    html += "<p class='small'>" + esc(a.transfer_note) + "</p>";
    html += "<div class='kv'><span>Música</span><span class='v'>" + esc(a.music.minutes_per_session) + " min, " + esc(a.music.sessions_per_week) + "x/semana</span></div>";
    html += "<p class='small muted'>" + esc(a.generalisation_check) + "</p>";
    html += listHtml("Ingredientes ativos", a.active_ingredients);
  }
  if (a.do_rules) {
    html += listHtml("Faça", a.do_rules) + listHtml("Não faça", a.dont_rules) + listHtml("Sessão com o parceiro", a.training_session) + listHtml("Frases de reparo", a.repair_strategies) + listHtml("Ambiente", a.environment_checklist);
  }
  if (a.red_flags) {
    html += listHtml("Sinais de alerta", a.red_flags.map(f => f.sign + " → " + f.target + " (" + f.urgency + ")"));
    html += listHtml("Sinais para parar o treino", a.training_stop_signs);
    html += listHtml("Precauções", a.precautions);
    html += "<p class='small'><strong>Cognição:</strong> " + esc(a.cognition_note) + "</p>";
    html += listHtml("Encaminhamentos", a.referral_targets) + listHtml("Contraindicações", a.contraindications);
    html += "<p class='small muted'>" + esc(a.ceiling) + "</p>";
  }
  html += listHtml("Lacunas de evidência", a.evidence_gaps || []);
  html += "</div>";
  return html;
}

function listHtml(title, items) {
  if (!items || !items.length) return "";
  return "<h3>" + esc(title) + "</h3><ul>" + items.map(i => "<li>" + esc(i) + "</li>").join("") + "</ul>";
}

function table(headers, rows) {
  let html = "<table><thead><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>";
  rows.forEach(r => { html += "<tr>" + r.map(c => "<td>" + c + "</td>").join("") + "</tr>"; });
  return html + "</tbody></table>";
}

/* ------------------------------------------------------------------ */
/* Ajustes e diagnóstico                                               */
/* ------------------------------------------------------------------ */

function renderSettings() {
  Voice.populateSelect();
  Voice.renderStatus();
  const st = $("#storageStatus");
  if (st) st.textContent = "Modo de armazenamento: " + Storage.mode + ". " + (Storage.mode === "localStorage" ? "Persistente neste navegador." : "Temporário: exporte um backup antes de fechar.");
  applyUI();
}

function runDiagnostics() {
  const box = $("#diagnostics");
  if (!box) return;
  const rows = [];
  rows.push(["Armazenamento", Storage.mode]);
  rows.push(["Voz (speechSynthesis)", ("speechSynthesis" in window) ? (Voice.blocked ? "bloqueada ou não testada" : "disponível") : "indisponível"]);
  rows.push(["Vozes pt-BR", String(Voice.voices.length)]);
  rows.push(["Áudio (Web Audio)", Audio.ctx ? Audio.ctx.state : "disponível; inicia no primeiro toque (não cria contexto sem gesto)"]);
  rows.push(["Frases de treino", String(ITEMS.filter(i => i.split === "train").length)]);
  rows.push(["Frases de teste", String(ITEMS.filter(i => i.split === "A" || i.split === "B" || i.split === "C").length)]);
  rows.push(["Sessões", String(state.sessions.length)]);
  rows.push(["HHIE-S", String(state.hhie.length)]);
  rows.push(["Testes de fala", String(state.speechTests.length)]);
  rows.push(["Testes de gap", String(state.gapTests.length)]);
  rows.push(["Eventos adversos", String(state.events.length) + (state.paused ? " (treino pausado)" : "")]);
  rows.push(["Versão", APP_VERSION + " · build " + BUILD]);
  box.innerHTML = rows.map(r => "<div class='kv'><span>" + esc(r[0]) + "</span><span class='v'>" + esc(r[1]) + "</span></div>").join("");
}

function applyUI() {
  document.body.classList.toggle("large", Boolean(state.ui && state.ui.large));
  document.body.classList.toggle("contrast", Boolean(state.ui && state.ui.contrast));
}

function toggleUI(key) {
  state.ui = state.ui || {};
  state.ui[key] = !state.ui[key];
  save();
  applyUI();
  toast(key === "large" ? (state.ui.large ? "Letra aumentada." : "Letra normal.") : (state.ui.contrast ? "Alto contraste ligado." : "Contraste normal."));
}

/* ------------------------------------------------------------------ */
/* Eventos e inicialização                                             */
/* ------------------------------------------------------------------ */

function registerEvent() {
  const desc = prompt("Descreva o evento (dor, zumbido, tontura, piora súbita, apito no aparelho, cansaço):");
  if (!desc) return;
  state.events.push({ date: new Date().toISOString(), description: desc });
  state.paused = true;
  save();
  renderAll();
  alert("Evento registrado. Treino PAUSADO. Procure otorrinolaringologista ou fonoaudiólogo antes de retomar.");
}

function releaseTraining() {
  if (!confirm("Confirma que o evento foi avaliado por profissional ou resolvido?")) return;
  state.paused = false;
  save();
  renderAll();
  toast("Treino liberado.");
}

function resetAll() {
  if (!confirm("Apagar TODOS os dados deste app?")) return;
  if (!confirm("Tem certeza? Exporte um backup antes se quiser guardar o histórico.")) return;
  /* apaga também o espelho e a cópia do servidor, senão o "apagar tudo"
     ressuscitaria o estado antigo na próxima abertura. */
  [STORAGE_KEY, MIRROR_KEY, DRAFT_KEY, DIARY_KEY].forEach(k => { try { Storage.remove(k); } catch (e) { /* ignore */ } });
  state = newState();
  save();
  location.reload();
}

function importLegacy() {
  const raw = Storage.get(LEGACY_KEY);
  if (!raw) { alert("Nenhum dado do app antigo (v3.1) encontrado neste navegador."); return; }
  let old;
  try { old = JSON.parse(raw); } catch (e) { alert("Dados antigos ilegíveis."); return; }
  if (!confirm("Importar sessões e objetivos do app v3.1? Isso adiciona registros, sem apagar os atuais.")) return;
  let count = 0;
  (old.sessoes || old.sessions || []).forEach(s => {
    state.sessions.push({
      id: "legacy" + Math.random().toString(36).slice(2),
      date: s.data || new Date().toISOString(),
      week: Number(s.semana || 1),
      accuracy: Number(s.porcentagem || 0),
      correct: Number(s.acertos || 0),
      total: Number(s.total || 0),
      startSnr: "—", endSnr: "—", moves: 0,
      fatigue: null, durationSec: 0,
      noise: s.ruido || "—", level: "—", rate: s.velocidade || 0.9,
      endedOnSuccess: false, legacy: true
    });
    count += 1;
  });
  if (Array.isArray(old.objetivos)) state.legacyObjectives = old.objetivos;
  if (old.semana) state.week = Math.max(1, Math.min(8, Number(old.semana)));
  if (old.objetivos && old.objetivos.length) state.baselineDone = true;
  save();
  renderAll();
  alert("Importados " + count + " sessões antigas. Elas aparecem no relatório como legado, sem SNR nem fuso de horário confiável.");
}

function renderAll() {
  renderHeader();
  renderHome();
  renderAssessmentButtons();
  renderAssessmentHistory();
  renderTrainingConfig();
  renderTrainingHistory();
  renderDiscourse();
  renderVida();
  renderReport();
  renderSettings();
  if (!planRendered) renderPlanForms();
}

function bindEvents() {
  $$(".tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
  const exitDemo = $("#exitDemo");
  if (exitDemo) exitDemo.addEventListener("click", () => { location.href = location.pathname; });
  const storageBackup = $("#btnStorageBackup");
  if (storageBackup) storageBackup.addEventListener("click", exportPackage);
  const dismissStorage = $("#dismissStorageBanner");
  if (dismissStorage) dismissStorage.addEventListener("click", () => { storageDismissed = true; renderStorageBanner(); });
  $("#weekSelect").addEventListener("change", ev => {
    flushDiary();
    state.week = Number(ev.target.value) || 1;
    diaryViewWeek = state.week;
    state.diaryViewWeek = state.week;
    const protocol = protocolFor();
    const cfg = weekConfig(protocol, state.week);
    if (cfg) {
      state.settings.noise = cfg.noise;
      state.settings.level = cfg.noise_level;
      state.settings.rate = cfg.rate;
    }
    delete state.settings.overrideWeek;
    save();
    renderAll();
  });
  $("#btnStartAssessment").addEventListener("click", () => startAssessment("baseline"));
  $("#btnStartTraining").addEventListener("click", startTraining);
  $("#btnReport").addEventListener("click", () => setTab("relatorio"));
  $("#btnEvent").addEventListener("click", registerEvent);
  $("#btnRelease").addEventListener("click", releaseTraining);
  $("#btnLargeFont").addEventListener("click", () => toggleUI("large"));
  $("#btnContrast").addEventListener("click", () => toggleUI("contrast"));
  $("#btnLargeFontSettings").addEventListener("click", () => toggleUI("large"));
  $("#btnContrastSettings").addEventListener("click", () => toggleUI("contrast"));
  $("#btnCalibrateNoise").addEventListener("click", () => {
    const btn = $("#btnCalibrateNoise");
    const status = $("#calibrationStatus");
    if (Audio.playing) {
      Audio.stopNoise();
      btn.textContent = "Tocar ruído de calibração";
      if (status) status.textContent = "Ruído parado. Ajuste o volume do aparelho até ouvir o ruído confortavelmente e não mexa mais durante o teste.";
    } else {
      Audio.startNoise("rosa", 2);
      btn.textContent = "Parar ruído";
      if (status) status.textContent = "Ruído de calibração tocando. Ajuste o volume do aparelho agora; ele deve ficar fixo durante toda a avaliação.";
    }
  });
  $("#btnTestVoice").addEventListener("click", async () => {
    await Voice.speak("Teste de voz em português do Brasil. Um, dois, três.", 0.95);
  });
  $("#rateSlider").addEventListener("input", ev => {
    state.settings.rate = Number(ev.target.value);
    $("#rateVal").textContent = Number(ev.target.value).toFixed(2);
  });
  $("#rateSlider").addEventListener("change", () => {
    state.settings.overrideWeek = state.week;
    save();
  });
  $$(".noise-btn").forEach(btn => btn.addEventListener("click", () => {
    state.settings.noise = btn.dataset.noise;
    state.settings.level = Number(state.settings.level) || 1;
    state.settings.overrideWeek = state.week;
    save();
    renderTrainingConfig();
    toast("Ruído: " + noiseLabel(btn.dataset.noise));
  }));
  $("#btnTestAudio").addEventListener("click", async () => {
    const cfg = weekConfig(protocolFor(), state.week);
    const eff = effectiveSettings(cfg);
    Audio.startNoise(eff.noise, eff.level);
    await Voice.speak("Teste de áudio com o ruído selecionado.", eff.rate);
    Audio.stopNoise();
  });
  $("#btnStartSession").addEventListener("click", startTraining);
  $("#btnPartnerSession").addEventListener("click", () => {
    const rec = state.partner[state.week] || { sessions: 0, rules: {} };
    rec.sessions = (rec.sessions || 0) + 1;
    state.partner[state.week] = rec;
    save();
    $("#partnerStatus").textContent = "Sessões de 20 min nesta semana: " + rec.sessions;
    toast("Sessão do parceiro registrada.");
  });
  $("#btnMusic").addEventListener("click", () => {
    state.music[state.week] = (state.music[state.week] || 0) + 1;
    save();
    $("#musicCount").textContent = state.music[state.week] + " nesta semana";
    toast("Música registrada.");
  });
  $("#diaryFatigue").addEventListener("input", ev => {
    $("#diaryFatigueVal").textContent = ev.target.value;
    onDiaryEdit();
  });
  ["#diaryTv", "#diaryConv", "#diaryNote"].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", onDiaryEdit);
    el.addEventListener("change", onDiaryEdit);
    el.addEventListener("blur", flushDiary);
  });
  const diaryWeekSel = $("#diaryWeekSelect");
  if (diaryWeekSel) diaryWeekSel.addEventListener("change", ev => {
    flushDiary();
    diaryViewWeek = Number(ev.target.value) || Number(state.week);
    state.diaryViewWeek = diaryViewWeek;
    save();
    renderDiaryForm();
    renderDiaryHistory();
  });
  $("#btnSaveDiary").addEventListener("click", () => {
    clearTimeout(diaryTimer);
    diaryTimer = null;
    diaryPendingWeek = null;
    const week = currentDiaryWeek();
    const ok = commitDiary({ manual: true, force: true, week: week });
    toast(ok ? "Diário da semana " + week + " salvo." : "Não foi possível salvar: exporte o backup.");
  });
  $("#btnGenerateReport").addEventListener("click", generateReport);
  $("#btnExportPackage").addEventListener("click", exportPackage);
  $("#btnImportPackage").addEventListener("click", importPackage);
  $("#btnExportBackup").addEventListener("click", exportPackage);
  $("#btnImportBackup").addEventListener("click", importPackage);
  $("#btnLegacy").addEventListener("click", importLegacy);
  $("#btnReset").addEventListener("click", resetAll);
  $("#btnMakeResumeCode").addEventListener("click", () => {
    $("#resumeCodeOut").value = makeResumeCode();
    $("#resumeCodeStatus").textContent = "Código gerado agora. Copie e guarde; ele vale como backup do progresso.";
    toast("Código de retomada gerado. Toque em copiar.");
  });
  $("#btnCopyResumeCode").addEventListener("click", () => {
    const ta = $("#resumeCodeOut");
    if (!ta.value) ta.value = makeResumeCode();
    copyText(ta.value).then(ok => toast(ok ? "Código copiado." : "Selecione o texto e copie manualmente."));
  });
  $("#btnApplyResumeCode").addEventListener("click", () => {
    applyResumeCode($("#resumeCodeOut").value);
  });
  $("#btnBuildProtocol").addEventListener("click", buildAndRenderProtocol);
  $("#btnDiagnostics").addEventListener("click", runDiagnostics);
  $("#btnVoiceTest").addEventListener("click", async () => {
    const ok = await Voice.speak("Teste de voz em português do Brasil. Um, dois, três.", 0.95);
    toast(ok ? "Se você ouviu, a voz está funcionando." : "A voz não iniciou. Abra em janela completa.");
  });
  $("#voiceSelect").addEventListener("change", ev => {
    state.settings.voiceIndex = ev.target.value === "" ? null : Number(ev.target.value);
    save();
    Voice.speak("Esta é a voz selecionada.", 0.95);
  });
  $("#openFullWindow").addEventListener("click", () => window.open(location.href, "_blank"));
  $("#btnOpenWindow2").addEventListener("click", () => window.open(location.href, "_blank"));
  $("#dismissVoiceBanner").addEventListener("click", () => $("#voiceBanner").classList.add("hidden"));
  $$("[data-test-noise]").forEach(btn => btn.addEventListener("click", () => Audio.test(btn.dataset.testNoise, 4000)));
}

function init() {
  if (DEMO_MODE) {
    $("#demoBanner").classList.remove("hidden");
    if (DEMO === "2") setTimeout(() => { setTab("relatorio"); generateReport(); }, 50);
    if (DEMO === "3") setTimeout(() => { setTab("plano"); buildAndRenderProtocol(); }, 50);
  }
  Voice.load();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => Voice.load();
    setTimeout(() => Voice.load(), 600);
  }
  if (!engine()) {
    const banner = $("#globalBanner");
    if (banner) banner.innerHTML = "<div class='banner err' role='alert'>O motor local (<span class='mono'>protocol.js</span>) não carregou. Recarregue a página; sem ele não há medição nem plano.</div>";
  }
  if (!DEMO_MODE) {
    diaryViewWeek = Number(state.diaryViewWeek) || Number(state.week);
    mergeHotDiary();
  }
  pendingDraft = DEMO_MODE ? null : loadDraft();
  if (restoredFrom === "espelho") {
    save();
    setTimeout(() => toast("Progresso recuperado da cópia local (a chave principal tinha se perdido)."), 400);
  }
  renderStorageBanner();
  setSaveStatus(DEMO_MODE ? "demo: não salva" : (Storage.mode === "localStorage" ? "pronto para salvar" : "memória temporária"),
    DEMO_MODE || Storage.mode !== "localStorage" ? "err" : "ok");
  bindEvents();
  renderAll();
  renderAssessment();
  renderSyncLine();
  restoreFromServer();
  window.addEventListener("pagehide", flushSession);
  window.addEventListener("beforeunload", flushSession);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSession();
  });
  $("#foot").textContent =
    "Base científica: Humes 2014 (dose); Bieber & Gordon-Salant 2020 (transferência limitada); Kishon-Rabin 2013 (gap); Ventry & Weinstein 1983 (HHIE-S); Killion 2004 (QuickSIN); ACHIEVE 2023 (cognição). " +
    "Protótipo experimental — não é dispositivo médico, não diagnostica e não substitui avaliação audiológica.";
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
