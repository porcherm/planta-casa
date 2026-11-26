/**
 * Baixa o three.js só quando é preciso (abas "Modelo 3D" e "Caminhar").
 * Assim a página abre mais rápido: quem só olha a planta 2D não baixa ~600 KB de 3D.
 *
 * Os scripts são carregados em ordem (o OrbitControls depende do three.js)
 * e uma única vez: chamadas repetidas reaproveitam a mesma promessa.
 */
import { THREE_CDN, GLTF_EXPORTER_CDN } from '../../constants/visualizacao.js';

let carregamento = null;

function carregarScript(src) {
  return new Promise((ok, erro) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = ok;
    script.onerror = () => erro(new Error(`Não foi possível baixar ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Mostra "Carregando…" enquanto baixa; se falhar, mostra o aviso de erro.
 * Retorna true quando o three.js está pronto.
 */
export async function aguardarThree(carregandoEl, avisoEl) {
  if (window.THREE?.OrbitControls) return true;
  avisoEl.dataset.textoOriginal ??= avisoEl.textContent; // "não carregou neste aparelho" (sem WebGL)
  carregandoEl.hidden = false;
  try {
    await carregarThree();
    avisoEl.textContent = avisoEl.dataset.textoOriginal;
    avisoEl.hidden = true;
    return true;
  } catch (e) {
    console.error(e);
    avisoEl.textContent = 'Não foi possível baixar o 3D. Confira a conexão com a internet e abra a aba de novo.';
    avisoEl.hidden = false;
    return false;
  } finally {
    carregandoEl.hidden = true;
  }
}

let exportador = null;

/** Baixa o GLTFExporter (só quando a pessoa pede para baixar o modelo 3D). */
export function carregarExportador() {
  if (window.THREE?.GLTFExporter) return Promise.resolve();
  exportador ??= carregarThree().then(() => carregarScript(GLTF_EXPORTER_CDN)).catch((e) => {
    exportador = null;
    throw e;
  });
  return exportador;
}

/** Resolve quando `window.THREE` (com OrbitControls) estiver pronto. */
export function carregarThree() {
  if (window.THREE?.OrbitControls) return Promise.resolve(window.THREE);
  carregamento ??= (async () => {
    for (const src of THREE_CDN) await carregarScript(src);
    return window.THREE;
  })().catch((e) => {
    carregamento = null; // permite tentar de novo (ex.: a internet voltou)
    throw e;
  });
  return carregamento;
}
