/**
 * Conversa com a API da Anthropic direto do navegador, usando o SDK oficial
 * (baixado do CDN só na primeira vez que alguém gera uma planta).
 *
 * O site é estático (sem servidor), então a chave da API é a da própria pessoa:
 * ela vai do navegador direto para a Anthropic e não passa por mais ninguém.
 */
import { IA } from '../../constants/ia.js';
import { ESQUEMA_RESPOSTA, INSTRUCOES, montarPedido } from '../../domain/planta-ia.js';

let carregamento = null;

/** Baixa o SDK uma única vez; se falhar, permite tentar de novo. */
export function carregarSdk() {
  carregamento ??= import(IA.sdkUrl)
    .then((m) => m.default)
    .catch((e) => { carregamento = null; throw e; });
  return carregamento;
}

/**
 * Envia as fotos e devolve a resposta da IA já como objeto (no formato de ESQUEMA_RESPOSTA).
 * aoProgredir(fase) recebe 'enviando' | 'analisando' | 'desenhando'.
 * Lança Error com mensagem amigável; cancelamento lança um erro com `cancelado = true`.
 */
export async function pedirPlanta({ chave, fotos, dicas, aoProgredir, sinal }) {
  let Anthropic;
  try {
    Anthropic = await carregarSdk();
  } catch (e) {
    console.error(e);
    throw new Error('Não foi possível baixar o cliente da IA. Confira a conexão com a internet.');
  }

  const client = new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true });
  const conteudo = [
    ...fotos.flatMap((f, i) => [
      { type: 'text', text: `Foto ${i + 1}:` },
      { type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.base64 } },
    ]),
    { type: 'text', text: montarPedido(fotos.length, dicas) },
  ];

  aoProgredir?.('enviando');
  const stream = client.beta.messages.stream({
    model: IA.modelo,
    max_tokens: IA.maxTokens,
    betas: [IA.betaFallback],
    fallbacks: 'default',
    system: INSTRUCOES,
    output_config: {
      effort: IA.esforco,
      format: { type: 'json_schema', schema: ESQUEMA_RESPOSTA },
    },
    messages: [{ role: 'user', content: conteudo }],
  }, { signal: sinal });

  stream.on('connect', () => aoProgredir?.('analisando'));
  let escrevendo = false;
  stream.on('text', () => {
    if (!escrevendo) { escrevendo = true; aoProgredir?.('desenhando'); }
  });

  let mensagem;
  try {
    mensagem = await stream.finalMessage();
  } catch (e) {
    throw traduzirErro(e, Anthropic);
  }

  if (mensagem.stop_reason === 'refusal') {
    throw new Error('A IA não aceitou analisar essas imagens. Tente com outras fotos dos cômodos.');
  }
  if (mensagem.stop_reason === 'max_tokens') {
    throw new Error('A resposta da IA ficou longa demais e foi cortada. Tente de novo, talvez com menos fotos.');
  }
  const texto = mensagem.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('A IA devolveu uma resposta incompleta. Tente gerar de novo.');
  }
}

/** Erros do SDK → mensagens para quem está usando o site. */
function traduzirErro(e, Anthropic) {
  console.error(e);
  const detalhe = e?.error?.error?.message || e?.message || '';
  let texto;
  if (e instanceof Anthropic.APIUserAbortError || e?.name === 'AbortError') {
    const cancelado = new Error('Geração cancelada.');
    cancelado.cancelado = true;
    return cancelado;
  } else if (e instanceof Anthropic.AuthenticationError) {
    texto = 'A chave da API não foi aceita. Confira se copiou a chave inteira (começa com "sk-ant-").';
  } else if (e instanceof Anthropic.PermissionDeniedError) {
    texto = `Esta chave não tem permissão para usar o modelo. ${detalhe}`;
  } else if (e instanceof Anthropic.RateLimitError) {
    texto = 'Muitos pedidos em pouco tempo. Espere um minuto e tente de novo.';
  } else if (e instanceof Anthropic.BadRequestError) {
    texto = /credit balance/i.test(detalhe)
      ? 'A conta da API está sem créditos. Adicione créditos no console da Anthropic e tente de novo.'
      : `A API recusou o pedido: ${detalhe}`;
  } else if (e instanceof Anthropic.APIConnectionError) {
    texto = 'Não foi possível falar com a API. Confira a conexão com a internet.';
  } else if (e instanceof Anthropic.APIError) {
    texto = 'A API da Anthropic está instável agora. Tente de novo em alguns minutos.';
  } else {
    texto = `Algo deu errado: ${detalhe || 'erro desconhecido'}`;
  }
  return new Error(texto);
}
