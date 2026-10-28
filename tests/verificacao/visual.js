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
rel.t('as DUAS renderizações usam o mesmo SVG', ocorrencias(js, 'campoSvg();') === 2,
    ocorrencias(js, 'campoSvg();') + ' usos');
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
// B58 estava incompleto: os painéis internos (rádio, estatísticas, relógio, decisão)
// seguiam azul-ardósia e o cabeçalho tinha um `!important` azul que anulava o fundo quente.
rel.t('não sobrou azul-ardósia nos painéis da partida',
    ['#0c1520', '#101b2b', '#111e2c', '#1b2b40', '#17263a', '#203145', '#2c4057', '#53677d', '#40516a', '#23344b', '#09121d']
        .every(hex => !css.toLowerCase().includes(hex))
    && !/rgba\(6, 12, 24/.test(css) && !/rgba\(8, 15, 26/.test(css));
rel.t('rádio, estatísticas e decisão usam o token quente (--match-deep)',
    /#screen-match \.match-narrative-section,#screen-match \.match-stats-row,#screen-match #match-decision \{ background:var\(--match-deep\);/.test(css));
rel.t('os !important não cresceram (restantes são funcionais)', (css.match(/!important/g) || []).length < 70);

// ---------------------------------------------------------------- B60: arte com identidade
rel.t('o header usa o escudo vetorial (não o ⚽)', html.includes('id="ui-club-crest"')
    && /ui-club-crest[\s\S]{0,220}FUTCards\.crest/.test(js));
rel.t('o radar do verso normaliza 99 no anel externo', js.includes('/99*40'));
// radar SVG puro (sem Chart.js): a função real radarSVG gera o SVG da ficha e do verso
const radarFonte = (js.match(/function radarSVG\([\s\S]*?\r?\n\}/) || [''])[0];
let radarSvg = '';
try { radarSvg = new Function(radarFonte + '\nreturn radarSVG({GK:80,DEF:70,MID:60,ATT:90,VEL:75,PAS:65,FIN:85});')(); } catch (e) { radarSvg = ''; }
rel.t('o radar é SVG puro gerado por radarSVG (sem Chart.js)', radarSvg.startsWith('<svg') && !/Chart/.test(radarFonte) && !html.includes('<canvas id="player-radar-chart"') && !/new Chart\(/.test(js));
rel.t('o radar tem ≥ 3 pontos com <title> e aria-label com os valores', ocorrencias(radarSvg, '<circle') >= 3 && ocorrencias(radarSvg, '<title>') >= 3 && /role="img" aria-label="Atributos: GK 80, DEF 70, MID 60, ATT 90/.test(radarSvg));
rel.t('o radar preserva a normalização B60 (99 no anel de 40)', radarFonte.includes('/99*40') && js.includes('radarSVG(p.stats)'));
rel.t('recompensas mantêm o tier coerente com a raridade',
    (js.match(/p\.tier = p\.raridade/g) || []).length >= 4);

// ---------------------------------------------------------------- B78: ritual enxuto
rel.t('o atalho JOGAR RÁPIDO existe e pula a preparação',
    html.includes('playQuickMatch') && js.includes('this._modoRapido'));
rel.t('a recompensa do draft pode ser pulada (sem prêmio)',
    html.includes('app.pularDraft') && js.includes('pularDraft()'));

// ---------------------------------------------------------------- B36/B42: fiação do tutorial e FPS
rel.t('B36: o tutorial aponta para o estilo (não para o seletor de modo)',
    js.includes("targetSel: '[data-estilo]'"));
rel.t('B42: measureFrames só roda em modo debug (?debug-fps)',
    js.includes('debug-fps') && js.includes('__ALTFOOT_FPS'));

// ---------------------------------------------------------------- Rodada gráfica (Arena 95.3)
// A partida deixou de ser um diagrama de bolinhas: câmera, jogadores com
// silhueta, traçado de chute, rede, pressão e placar pulsante. O harness
// protege a fiação (as regras/classes existem e são usadas), não o gosto.
rel.t('o campo da partida tem plano de câmera e HUD separados',
    js.includes("camera.className = 'campo-camera'")
    && js.includes("hud.className = 'campo-hud'")
    && js.includes('_campoPlano()') && js.includes('_campoHud()'));
rel.t('as fichas viraram jogadores (cabeça, camisa, número e sombra)',
    js.includes('pl-shadow') && js.includes('pl-body') && js.includes('pl-head') && js.includes('pl-num')
    && /\.campo-chip \.pl-body \{/.test(css) && /\.campo-chip \.pl-head \{/.test(css));
rel.t('a câmera aproxima no lance e respeita 4×/PULAR e movimento reduzido',
    js.includes('_camFoco(') && js.includes('--cam-z')
    && js.includes('(this._vel || 1) >= 4') && js.includes('prefereMenosMovimento'));
rel.t('o zoom nunca abre buraco nas bordas (pan limitado)',
    js.includes('Math.max(-lim, Math.min(lim'));
rel.t('o chute tem traçado e a defesa não vira laser',
    js.includes('_tracoChute(') && js.includes("if (tipo !== 'def')") && css.includes('.shot-trail'));
rel.t('a rede balança no gol', js.includes('campo-rede') && css.includes('@keyframes redeGol'));
rel.t('o lance tem strap de transmissão', js.includes('_eventoCampo(') && css.includes('.campo-evento {'));
rel.t('a pressão acende a borda do lado dominante',
    js.includes("classList.toggle('pressao-casa'") && css.includes('#campo-2d.pressao-casa .campo-pressao'));
rel.t('o placar pulsa quando muda',
    js.includes("classList.add('score-pop')") && css.includes('.score-big.score-pop'));
rel.t('a reta final pulsa na moldura',
    js.includes("classList.toggle('reta-final'") && css.includes('#campo-2d.reta-final'));
rel.t('o desktop monta arquibancada, gramado 3:2 e placas',
    css.includes('aspect-ratio: 3 / 2') && css.includes('#campo-2d.campo-tv::before')
    && css.includes('#campo-2d .campo-ads') && css.includes('translateY(-50%)'));
rel.t('a ficha antiga (::before) não duplica a camisa no campo da partida',
    css.includes('#screen-match #campo-2d .campo-chip::before { content: none; }'));
rel.t('as animações novas caem no bloco de movimento reduzido',
    /#campo-2d \.campo-camera \{ transition: none !important; \}/.test(css)
    && /#campo-2d \.shot-trail,/.test(css));
rel.t('o campo tem selo AO VIVO e placas de publicidade acessíveis',
    js.includes('campo-bug') && js.includes('campo-ads') && js.includes('aria-hidden="true"'));

// ---------------------------------------------------------------- B86: landscape de celular
// Em 844×390 o gramado era uma faixa de 640×132 (4,8:1): a regra genérica `24 / 9`
// brigava com `max-height:34vh`. Agora o landscape usa a composição de dois painéis do
// desktop e o tamanho do campo vem do grid (nunca de uma proporção fixa).
const blocoB86 = (() => {
    const i = css.indexOf('@media (max-height: 480px) and (orientation: landscape) and (max-width: 1099px)');
    if (i < 0) return '';
    const fim = css.indexOf('#screen-match .estadio-selo', i);
    return css.slice(i, fim > 0 ? fim + 200 : i + 4000);
})();
rel.t('B86: existe um layout próprio para celular deitado',
    blocoB86.length > 0 && blocoB86.includes('"feed   field"') && blocoB86.includes('"footer footer"'));
rel.t('B86: o gramado deixa de ser uma faixa (saiu a proporção 24/9)',
    !css.includes('24 / 9') && !css.includes('24/9'));
rel.t('B86: o gramado é dimensionado pelo grid, não por uma proporção fixa',
    /#screen-match #campo-2d \{[\s\S]{0,220}height: 100%[\s\S]{0,220}aspect-ratio: auto/.test(blocoB86));
rel.t('B86: o invólucro de rolagem vira parte do grid no landscape',
    /#screen-match \.match-content-scroll \{ display: contents; \}/.test(blocoB86));
rel.t('B86: a partida usa a largura toda do aparelho (o app travava em 640 px)',
    /#screen-match \{ position: fixed; inset: 0; \}/.test(blocoB86));
rel.t('B86: os 7 controles continuam no pé, numa linha, com 44 px',
    /repeat\(7, minmax\(0, 1fr\)\)/.test(blocoB86)
    && /#screen-match \.match-speed-btn, #screen-match \.match-skip-btn \{ min-height: 44px/.test(blocoB86));
rel.t('B86: a decisão do técnico flutua (não empurra o gramado para fora da tela)',
    /#screen-match #match-decision \{[\s\S]{0,200}position: absolute;/.test(blocoB86)
    && /bottom: 52px/.test(blocoB86));
rel.t('B86: o feed rola dentro do painel da esquerda',
    /#screen-match \.match-narrative-section \{[\s\S]{0,240}grid-area: feed;/.test(blocoB86));
rel.t('B86: as fichas e o duelo encolhem para caber no painel da direita',
    /#campo-2d \.campo-chip \{ width: 16px; height: 20px/.test(blocoB86)
    && /#campo-2d \.campo-duelo \.duelo-mini \.dm-pos \{ display: none; \}/.test(blocoB86));

// B61/2026-10-21: o selo da competição era um `absolute` em cima do relógio no mobile
// (medido no Chromium em 390×844: o pill "BRASILEIRÃO" cobria o "67'"). Em ≤1099 quem
// informa a competição é o meta-row do placar.
rel.t('o selo da competição não cobre o relógio em telas pequenas',
    /#screen-match \.estadio-selo \{ display:none; \}/.test(css));

// ---------------------------------------------------------------- B152: tutorial e ajuda completos
// O Treino Guiado ensina cartas/Foco, SUB e velocidade; o contador "PASSO X DE N" bate com o nº
// real de passos; a Central de ajuda cobre diretoria, draft, patrocínio e intervalo, e os números
// escritos batem com o código (metaTemporada e o limite de rodadas do Clássico).
const blocoPassos = (() => {
    const i = js.indexOf('steps: [');
    const f = js.indexOf('_clonarClube(origem)', i);
    return i < 0 || f < 0 ? '' : js.slice(i, f);
})();
const idsPassos = [...blocoPassos.matchAll(/\bid:\s*'([a-z_]+)'/g)].map(m => m[1]);
const contadores = [...blocoPassos.matchAll(/badge:\s*'PASSO (\d+) DE (\d+)'/g)].map(m => ({ n: +m[1], total: +m[2] }));
rel.t('B152: o tutorial tem os passos novos (cartas_foco e substituicao_velocidade)',
    idsPassos.includes('cartas_foco') && idsPassos.includes('substituicao_velocidade'), 'ids: ' + idsPassos.join(', '));
rel.t('B152: o contador "PASSO X DE N" usa o nº real de passos',
    idsPassos.length > 0 && contadores.length > 0 && contadores.every(c => c.total === idsPassos.length),
    'passos: ' + idsPassos.length + ' · contadores: ' + contadores.map(c => c.total).join(','));
rel.t('B152: os números dos passos são sequenciais e o último passo é a conclusão',
    contadores.every((c, i) => c.n === i + 1) && idsPassos[idsPassos.length - 1] === 'conclusao');
const textoDoPasso = id => {
    const m = blocoPassos.match(new RegExp("id:\\s*'" + id + "'[\\s\\S]*?text:\\s*'([^']*)'"));
    return m ? m[1] : '';
};
const passoFoco = textoDoPasso('cartas_foco');
const passoSub = textoDoPasso('substituicao_velocidade');
rel.t('B152: o passo de cartas explica o Foco, as cartas táticas e o custo de 25 a 45',
    /Foco/.test(passoFoco) && /cartas táticas/.test(passoFoco) && /25 a 45/.test(passoFoco));
rel.t('B152: o passo de SUB explica ⚤ SUB, a velocidade (1×/2×/4×/PULAR) e o prazo da decisão',
    /⚤ SUB/.test(passoSub) && /1×/.test(passoSub) && /PULAR/.test(passoSub) && /8 s a 1×/.test(passoSub));
rel.t('B152: os dois passos novos são só de leitura (noSpotlight, sem targetSel)',
    ['cartas_foco', 'substituicao_velocidade'].every(id => {
        const m = blocoPassos.match(new RegExp("id:\\s*'" + id + "'[\\s\\S]*?\\n        \\}"));
        return !!m && /noSpotlight:\s*true/.test(m[0]) && !/targetSel/.test(m[0]);
    }));
rel.t('B152: a barra de progresso usa o nº de passos (steps.length), não um valor fixo',
    /const total = this\.steps\.length;/.test(js));

const blocoCentral = (() => {
    const i = html.indexOf('id="modal-help-guide"');
    const f = html.indexOf('id="ui-tutorial-overlay"', i);
    return i < 0 || f < 0 ? '' : html.slice(i, f);
})();
rel.t('B152: a Central tem a aba Diretoria (botão, conteúdo e entrada no switchHelpTab)',
    /data-tab="diretoria"/.test(blocoCentral) && /id="help-tab-content-diretoria"/.test(blocoCentral)
    && js.includes("['fases', 'posicoes', 'focos', 'diretoria']"));
rel.t('B152: a Central cobre diretoria, draft, patrocínio e intervalo',
    /<strong>📋 Paciência da diretoria:<\/strong>/.test(blocoCentral)
    && /<strong>🎯 Meta da temporada:<\/strong>/.test(blocoCentral)
    && /<strong>🎁 Draft:<\/strong>/.test(blocoCentral)
    && /<strong>💼 Patrocínio:<\/strong>/.test(blocoCentral)
    && /<strong>⏸️ Intervalo:<\/strong>/.test(blocoCentral));
rel.t('B152: a Central cobre Rodada do Dia, Clássico e dilema do vestiário',
    /<strong>🌅 Rodada do Dia:<\/strong>/.test(blocoCentral)
    && /<strong>🌆 Clássico da Semana:<\/strong>/.test(blocoCentral)
    && /<strong>🚪 Dilemas do vestiário:<\/strong>/.test(blocoCentral));
// Amarração com o código: se a meta ou o limite de rodadas mudar, a Central tem de mudar junto.
rel.t('B152: a meta da Série A escrita na Central bate com metaTemporada (12 na T1, 8 depois)',
    /primeiraTemp \? 12 : 8/.test(js) && /entre os 12 na 1ª temporada e entre os 8 depois/.test(blocoCentral));
rel.t('B152: o limite de rodadas do Clássico escrito na Central bate com _desafioRodadaLivre',
    /_desafioRodadaLivre\('classico', 5\)/.test(js) && /depois de 5 rodadas da liga/.test(blocoCentral));
rel.t('B152: o modal "Manual do Treinador" leva à Central completa',
    /app\.closeHowToPlay\(\); app\.openHelpModal\(\);/.test(html));

encerrar(rel);