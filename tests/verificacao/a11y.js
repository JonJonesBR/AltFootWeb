'use strict';
// tests/verificacao/a11y.js — acessibilidade por CÓDIGO: os controles das configurações
// precisam ter efeito real (não ser placebo), o movimento reduzido tem de valer de
// verdade, os alvos de toque existem e os modais têm semântica e foco.
// Uso: node tests/verificacao/a11y.js [caminho/index.html]
const { lerIndex, semComentarios, estiloDo, criarRelatorio, encerrar } = require('./_lib');

const src = lerIndex(process.argv[2]);
const codigo = semComentarios(src);
const estilo = estiloDo(src);
const conta = (s) => src.split(s).length - 1;
const rel = criarRelatorio('acessibilidade');

// --- P0: os toggles das configurações não podem ser placebo ---
rel.t('existe regra CSS body.text-bigger', /body\.text-bigger\s*\{/.test(estilo));
rel.t('existe regra CSS body.high-contrast', /body\.high-contrast\s*\{/.test(estilo));
rel.t('text-bigger aumenta a fonte base', /body\.text-bigger\s*\{[^}]*font-size/.test(estilo));
rel.t('high-contrast redefine --text-muted', /body\.high-contrast\s*\{[^}]*--text-muted/.test(estilo));
rel.t('o JS ainda alterna as duas classes',
    src.includes("classList.toggle('text-bigger'") && src.includes("classList.toggle('high-contrast'"));

// --- Movimento reduzido ---
rel.t('media query global de reduced-motion',
    /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\*,[\s\S]*?animation-duration/.test(estilo));
rel.t('neutraliza animation-duration globalmente', /animation-duration:\s*\.001ms\s*!important/.test(estilo));
rel.t('neutraliza transition-duration globalmente', /transition-duration:\s*\.001ms\s*!important/.test(estilo));
rel.t('existe helper prefereMenosMovimento()', src.includes('prefereMenosMovimento()'));
rel.t('burstParticles respeita a preferência',
    /burstParticles\([^)]*\)\s*\{\s*\n?\s*if \(ui\.prefereMenosMovimento\(\)\) return;/.test(src));
rel.t('fxShake respeita a preferência',
    /fxShake\(\)\s*\{\s*\n?\s*if \(ui\.prefereMenosMovimento\(\)\) return;/.test(src));
rel.t('impactFlash respeita a preferência',
    /impactFlash\(\)\s*\{\s*\n?\s*if \(ui\.prefereMenosMovimento\(\)\) return;/.test(src));
rel.t('o helper consulta matchMedia de verdade',
    /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(src));

// --- Modais: semântica e foco ---
rel.t('preparação de acessibilidade existe', src.includes('_prepararAcessibilidade()'));
rel.t('aplica role="dialog" nos modais', /setAttribute\('role',\s*'dialog'\)/.test(src));
rel.t('aplica aria-modal', /setAttribute\('aria-modal',\s*'true'\)/.test(src));
rel.t('liga aria-labelledby ao título', /setAttribute\('aria-labelledby'/.test(src));
rel.t('devolve o foco ao fechar', src.includes('_a11yAnterior'));
rel.t('é chamada no init()',
    /this\.initSettings\(\);\s*\n\s*ui\.init\(\);\s*\n\s*this\._prepararAcessibilidade\(\);/.test(src));

// --- Botões de fechar: nome acessível e alvo de toque ---
rel.t('piso de 44px para [data-close-x]', /\[data-close-x\][^}]*min-height:\s*44px/.test(estilo));
rel.t('5 botões de fechar marcados', conta('data-close-x') >= 5, 'encontrados: ' + conta('data-close-x'));
rel.t('aria-label "Fechar cartas táticas"', src.includes('aria-label="Fechar cartas táticas"'));
rel.t('aria-label "Cancelar substituição"', src.includes('aria-label="Cancelar substituição"'));
rel.t('aria-label no tutorial', src.includes('aria-label="Fechar tutorial"'));
rel.t('aria-label no guia', src.includes('aria-label="Fechar guia"'));

// --- Alvos de toque ---
rel.t('.deck-filter-btn com min-height 44px', /\.deck-filter-btn\s*\{[^}]*min-height:\s*44px/.test(estilo));
rel.t('.tab-btn com min-height 44px', /\.tab-btn\s*\{[^}]*min-height:\s*44px/.test(estilo));
rel.t('.how-to-play-btn com min-height 44px', /\.how-to-play-btn\s*\{[^}]*min-height:\s*44px/.test(estilo));
rel.t('foco visível inclui [role="button"]', /\[role="button"\]:focus-visible/.test(estilo));

// --- P0: o card do tutorial não pode travar em tela pequena ---
rel.t('#ui-tutorial-card com max-height', /#ui-tutorial-card\s*\{[^}]*max-height/.test(estilo));
rel.t('#ui-tutorial-card com overflow-y', /#ui-tutorial-card\s*\{[^}]*overflow-y:\s*auto/.test(estilo));

// --- GPU/performance ---
rel.t('sem will-change:transform permanente nas cartas',
    !/rarity-(Ouro|Diamante)[\s\S]{0,120}will-change/.test(estilo));

// --- Guardas do projeto ---
rel.t('nenhum backdrop-filter efetivo',
    (estilo.match(/backdrop-filter\s*:\s*([^;}]+)/g) || []).every(d => /:\s*none\s*$/.test(d.trim())));
rel.t('aria-live do feed preservado (B8)', src.includes('aria-live="polite"'));
rel.t('locução humana removida (decisão 2026-10-14)',
    !codigo.includes('NARRACAO_DIR') && !codigo.includes('playNarracao'));
rel.t('sem manifest/service worker referenciados',
    !codigo.includes('rel="manifest"') && !codigo.includes('serviceWorker'));

encerrar(rel);
