// tests/carreira-lib.js — sandbox de CARREIRA: carrega o domínio, o motor, o GameState e o próprio
// objeto `app` do index.html (sem DOM real). Usado por tests/carreira.js para simular temporadas com
// as funções REAIS do jogo (generateOffers, openDraft, closeMatchResult, startNewSeason, afterRound…).
// Zero build: só Node. Não faz parte do runtime do jogo.
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX_PADRAO = path.join(__dirname, '..', 'index.html');

function lerFonte(indexPath) {
    return fs.readFileSync(indexPath || INDEX_PADRAO, 'utf8').replace(/\r\n/g, '\n');
}

function recorte(src, ini, fim) {
    const a = src.indexOf(ini);
    const b = src.indexOf(fim, a + ini.length);
    if (a < 0 || b < 0) throw new Error('marcador não encontrado: ' + ini.slice(0, 40) + ' → ' + fim.slice(0, 40));
    return src.slice(a, b);
}

// Corpo de carreira: domínio + motor (igual ao engine-lib) + GameState/SaveRepository + app inteiro.
function extrairCorpo(src) {
    const dominio = recorte(src, '// data.js', '// engine.js v3');
    const motor = recorte(src, 'function mulberry32(seed)', '// --- Renderer da tela de partida')
        + recorte(src, 'function escalarTitularesXI(elenco, formacao)', '// --- Facade: orquestração')
        + recorte(src, 'const Engine = {', '// ui.js')
        + recorte(src, 'const TutorialManager = {', '// game-state.js');
    const estado = recorte(src, '// game-state.js', '// app.js');
    const iApp = src.indexOf('\nconst app = {');
    const fApp = src.indexOf('\n};\n', iApp);
    if (iApp < 0 || fApp < 0) throw new Error('objeto app não achado');
    const app = src.slice(iApp + 1, fApp + 3);
    return dominio + motor + estado + app;
}

// Stub genérico de elemento DOM: qualquer propriedade/método existe e não faz nada.
function elementoFalso() {
    const alvo = function () { return elementoFalso(); };
    return new Proxy(alvo, {
        get(_, prop) {
            if (prop === Symbol.toPrimitive) return () => '';
            if (prop === 'value') return '';
            if (prop === 'length') return 0;
            if (prop === 'then') return undefined;
            if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains: (c) => c === 'hidden' }; // modais fechados por padrão
            if (prop === 'style') return new Proxy({}, { get: () => '', set: () => true });
            if (prop === 'children' || prop === 'childNodes') return [];
            if (prop === 'innerHTML' || prop === 'innerText' || prop === 'textContent') return '';
            if (prop === Symbol.iterator) return function* () {};
            return elementoFalso();
        },
        set() { return true; },
        apply() { return elementoFalso(); }
    });
}

// Sandbox de carreira. opts.index = caminho do index.html (padrão: o do projeto).
function novoSandboxCarreira(opts = {}) {
    let vnow = 0;
    const fila = [];
    let seq = 1;
    const cancelados = new Set();
    const vSetTimeout = (fn, ms) => {
        const id = seq++;
        fila.push({ id, t: vnow + Math.max(0, Number(ms) || 0), ordem: id, fn });
        return id;
    };
    const vClearTimeout = (id) => { cancelados.add(id); };
    const TempoPagina = { agora: () => vnow, agendar: vSetTimeout, limpar: vClearTimeout, repetir: vSetTimeout, pausado: false };
    const MatchUIBase = {
        _revisaoAtiva: false, _replayAtivo: false, promptCalls: [],
        prompt(desc, o, cb, ms, def) {
            // Só prompts de CHANCE seguem a política; os demais (ética etc.) usam o padrão (fair play = 0).
            const chance = !!(o && o[0] && o[0].eff);
            const politica = MatchUI._politicaDecisao;
            const i = !chance ? 0 : (typeof politica === 'function' ? politica({ desc, opts: o, def }) : (Number.isInteger(politica) ? politica : (Number.isInteger(def) ? def : 1)));
            cb(i, true);
        },
        _politicaDecisao: 1,
        score() {}, stats() {}, pressao() {}, clock() {}, status() {}, clearPrompt() {},
        fieldInit() {}, fieldBindXI() {}, fieldEvent() {}, timeline() {}, varReview() { return false; },
        encerrarTransmissao() {}, stopCrowdLoop() {}, radioHide() {}, corCamisa() { return '#fff'; },
        corRivalContraste() { return '#000'; }, startCrowdLoop() {}, _nivelTorcida() { return 0.1; }
    };
    // Qualquer método de UI ausente vira no-op (a copa chama MatchUI.init e outros).
    const MatchUI = new Proxy(MatchUIBase, { get: (t, p) => (p in t ? t[p] : () => undefined) });
    const document = Object.assign({ removeEventListener() {}, addEventListener() {} }, opts.document || {
        getElementById: () => elementoFalso(),
        querySelectorAll: () => [],
        querySelector: () => null,
        createElement: () => elementoFalso(),
        addEventListener() {}, body: elementoFalso()
    });
    // UI stub: qualquer método é no-op; propriedades de leitura comuns retornam vazio.
    const ui = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (() => undefined)), set: () => true });
    const storageFalso = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null, length: 0 };
    const UIRenderer = undefined; // definido no corpo
    const src = lerFonte(opts.index);
    const corpo = extrairCorpo(src);
    const fabrica = new Function(
        'document', 'MatchUI', 'TempoPagina', 'window', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'ui', 'localStorage', 'navigator', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
        corpo + '\n;return { app, MatchSim, Engine, escalarTitularesXI, bonusQuimica, CONDICOES_JOGO, mulberry32, hashStr'
        + ', Player, Club, League, TransferMarket, LockerRoom, ClubEcosystem, CompetitionSystem, GAME_DATA, TaticaCard, TutorialManager, MetaProgress, GameState, SaveRepository, PATROCINIOS, fecharPartidaElenco, rivalHistorico, mancheteDaGazeta, calcularXPParticipacao, HistoricalScenarios };'
    );
    const api = fabrica(document, MatchUI, TempoPagina, {}, vSetTimeout, vClearTimeout, vSetTimeout, vClearTimeout,
        ui, storageFalso, { userAgent: 'node' }, { now: () => vnow }, (fn) => vSetTimeout(fn, 0), vClearTimeout);
    return {
        ...api,
        MatchUI,
        get agora() { return vnow; },
        drenarTimers(maxPassos = 200000) {
            let passos = 0;
            while (fila.length) {
                if (++passos > maxPassos) { const c={}; fila.slice(0,50).forEach(x=>{const k=String(x.fn).slice(0,90); c[k]=(c[k]||0)+1;}); throw new Error('loop de timers: ' + passos + ' ' + JSON.stringify(c).slice(0,900)); }
                fila.sort((a, b) => (a.t - b.t) || (a.ordem - b.ordem));
                const it = fila.shift();
                if (cancelados.has(it.id)) continue;
                vnow = Math.max(vnow, it.t);
                it.fn();
            }
        }
    };
}

module.exports = { novoSandboxCarreira, extrairCorpo, lerFonte, INDEX_PADRAO, elementoFalsoCarreira: elementoFalso };
