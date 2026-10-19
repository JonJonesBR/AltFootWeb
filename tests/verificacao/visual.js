'use strict';
// tests/verificacao/visual.js — FIAÇÃO VISUAL da partida (estádio, efeitos, campo, legibilidade).
//
// Por que este harness existe: em 2026-09 um "patch de transmissão limpa" desligou o estádio
// inteiro (`estadio-gramado{display:none}` + board opaco) e ninguém percebeu por semanas; os
// efeitos de gol (`.fx-shake`, `.fx-flash`) eram chamados no JS e nunca tiveram regra CSS. São
// regressões silenciosas: nenhum teste de comportamento as pega. Aqui elas são verificadas por
// FIAÇÃO (a regra existe? quem usa o quê?), não por pixel — julgamento estético é EXIGE HUMANO.
//
// Uso: node tests/verificacao/visual.js
const { lerIndex, blocosDeScript, semComentarios, estiloDo, criarRelatorio, encerrar } = require('./_lib');

const rel = criarRelatorio('visual da partida (estádio, efeitos, campo e legibilidade)');
const html = lerIndex(process.argv[2]);
const css = estiloDo(html);
const js = semComentarios(blocosDeScript(html).map(b => b.codigo).join('\n'));
const ocorrencias = (texto, agulha) => texto.split(agulha).length - 1;
const regra = seletor => {
    const i = css.indexOf(seletor + ' {');
    if (i < 0) return null;
    const f = css.indexOf('}', i);
    return css.slice(i, f + 1);
};

// ---------------------------------------------------------------- B56: estádio de volta
rel.t('o gramado não está mais escondido',
    !/#screen-match \.estadio-gramado \{[^}]*display:\s*none/.test(css)
    && /#screen-match \.estadio-gramado \{ display: block; \}/.test(css));
rel.t('o board da partida não tem fundo opaco',
    !/#screen-match \.match-board \{[^}]*background:\s*#0c1520/.test(css)
    && /#screen-match \.match-board \{ background: transparent; \}/.test(css));
rel.t('o estádio vem antes do board no DOM (fica atrás)',
    html.indexOf('class="estadio-bg"') > 0
    && html.indexOf('class="estadio-bg"') < html.indexOf('class="match-board"'));
rel.t('o painel do placar é translúcido para o estádio aparecer',
    /#screen-match \.match-header-card \{[^}]*rgba\(24, 16, 8, 0\.86\)/.test(css));

// ---------------------------------------------------------------- B56: efeitos com CSS
rel.t('`.fx-shake` tem animação (antes só existia no JS)', /\.fx-shake \{ animation: fxShake/.test(css));
rel.t('`@keyframes fxShake` existe', css.includes('@keyframes fxShake'));
rel.t('`.fx-flash` é camada fixa com animação', /\.fx-flash \{[\s\S]{0,200}position: fixed/.test(css)
    && /\.fx-flash\.on \{ animation: fxFlash/.test(css));
rel.t('`@keyframes fxFlash` existe', css.includes('@keyframes fxFlash'));
rel.t('`.fx-floating` tem posição e animação', /\.fx-floating \{[\s\S]{0,200}position: fixed/.test(css)
    && css.includes('@keyframes fxFloat'));
rel.t('as três animações novas caem no bloco de movimento reduzido',
    /animation-duration:\.001ms !important/.test(css));

// ---------------------------------------------------------------- B57: campo completo
rel.t('o campo é desenhado por SVG (função única)', js.includes('function campoSvg()'));
rel.t('as DUAS renderizações usam o mesmo SVG', ocorrencias(js, 'campo.innerHTML = campoSvg();') === 2,
    ocorrencias(js, 'campo.innerHTML = campoSvg();') + ' usos');
rel.t('o SVG tem gol/rede (retângulo fora da linha e linhas de rede)',
    js.includes('x="0.6" y="40"') && js.includes('width="2.4" height="10"'));
rel.t('o SVG tem marca do pênalti, meia-lua e arcos de canto',
    js.includes('cx="16" cy="45"') && js.includes('A12 12 0 0 1 25 57') && js.includes('A6 6 0 0 1 9 3'));
rel.t('o SVG escala no mesmo espaço das fichas (viewBox 160x90)',
    js.includes('viewBox="0 0 160 90"'));
rel.t('o container do SVG é posicionado por CSS',
    /\.campo-2d \.campo-svg \{ position: absolute; inset: 0;/.test(css));

// ---------------------------------------------------------------- B58: legibilidade
rel.t('a fonte fantasma "Inter" saiu da pilha', !/font-family: 'Inter'/.test(css));
rel.t('o placar do resultado recuperou a cor por desfecho', !/color:#ffc04d!important/.test(css));
rel.t('os rótulos pequenos subiram de piso',
    /\.hud-metric \.hm-label \{ font-size: 0\.7rem; \}/.test(css)
    && /\.match-timeline \.tl-legend \{ font-size: 0\.66rem; \}/.test(css));

// ---------------------------------------------------------------- B61: engrenagem e toque
rel.t('#btn-settings mantém alvo de 44px', /#btn-settings \{[\s\S]{0,160}width: 44px; height: 44px;/.test(css));
rel.t('o cabeçalho reserva espaço para a engrenagem', /#screen-game header \{ padding-right: 60px; \}/.test(css));
rel.t('a barra do placar reserva espaço para a engrenagem', /\.match-top-bar \{ padding-right: 56px; \}/.test(css));
rel.t('o contorno antigo (padding-top:48px) saiu', !css.includes('padding-top:48px'));

// ---------------------------------------------------------------- B59: feedback de ação
const toast = js.slice(js.indexOf('showActionFeedback(text'), js.indexOf('showFloatingText'));
rel.t('o toast tem largura máxima e transição',
    toast.includes("maxWidth = 'min(92vw, 420px)'") && toast.includes('transition'));
rel.t('o toast continua sendo região viva', toast.includes("setAttribute('role', 'status')"));

// ---------------------------------------------------------------- B58: paleta única
rel.t('a transmissão usa os tokens de carvão/âmbar', css.includes('--match-panel') && css.includes('--match-deep'));
rel.t('não sobrou o azul-ardósia da partida', !css.includes('#0c1520') && !/rgba\(8, 15, 26/.test(css));
rel.t('os !important não cresceram (restantes são funcionais)', (css.match(/!important/g) || []).length < 70);

// ---------------------------------------------------------------- B60: arte com identidade
rel.t('o header usa o escudo vetorial (não o ⚽)', html.includes('id="ui-club-crest"')
    && /ui-club-crest[\s\S]{0,220}FUTCards\.crest/.test(js));
rel.t('o radar do verso normaliza 99 no anel externo', js.includes('/99*40'));
rel.t('recompensas mantêm o tier coerente com a raridade',
    (js.match(/p\.tier = p\.raridade/g) || []).length >= 4);

// ---------------------------------------------------------------- B78: ritual enxuto
rel.t('o atalho JOGAR RÁPIDO existe e pula a preparação',
    html.includes('playQuickMatch') && js.includes('this._modoRapido'));
rel.t('a recompensa do draft pode ser pulada (sem prêmio)',
    html.includes('app.pularDraft') && js.includes('pularDraft()'));

encerrar(rel);