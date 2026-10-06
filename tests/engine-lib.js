// tests/engine-lib.js — carrega o motor de partida do index.html sem DOM, com relógio virtual.
// Uso: const { runMatch, quickSim, makeTeam, makeSquad } = require('./engine-lib');
// Zero build: node tests/run.js. Não faz parte do runtime do jogo (index.html não referencia esta pasta).
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');

function extrairFonte() {
    const src = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
    const recorte = (ini, fim) => {
        const a = src.indexOf(ini);
        const b = src.indexOf(fim, a);
        if (a < 0 || b < 0) throw new Error('marcador não encontrado: ' + ini.slice(0, 40));
        return src.slice(a, b);
    };
    // Domínio completo: data/models/transfer-market/locker-room/club-ecosystem/
    // Club+League/competitions/fut-cards/historical-scenarios (sem UI, sem app).
    const dominio = recorte('// data.js', '// engine.js v3');
    // RNG + helpers de XI/química + CONDICOES_JOGO + class MatchSim + fachada Engine.
    return dominio
        + recorte('function mulberry32(seed)', '// --- Renderer da tela de partida')
        + recorte('function escalarTitularesXI(elenco, formacao)', '// --- Facade: orquestração')
        + recorte('const Engine = {', '// ui.js');
}

function novoSandbox(opts = {}) {
    // Fila de timers com relógio virtual: a partida inteira roda sincronizada e determinística.
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
    const vSetInterval = (fn, ms) => vSetTimeout(fn, ms); // não usado pelo motor de partida
    const TempoPagina = {
        agora: () => vnow,
        agendar: vSetTimeout,
        limpar: vClearTimeout,
        repetir: vSetInterval,
        pausado: false
    };
    // MatchUI stub: os métodos do motor são cosméticos — o _el(id) real faz fallback por null-check.
    const MatchUI = {
        _revisaoAtiva: false,
        _replayAtivo: false,
        promptCalls: [],
        prompt(desc, opts, cb, ms, def) {
            this.promptCalls.push({ desc, opts: (opts || []).map(o => o.label), ms, def });
            const politica = MatchUI._politicaDecisao;
            const i = typeof politica === 'function' ? politica({ desc, opts, def }) : (Number.isInteger(politica) ? politica : (Number.isInteger(def) ? def : 1));
            cb(i, true);
        },
        _politicaDecisao: 1,
        score() {}, stats() {}, pressao() {}, clock() {}, status() {}, clearPrompt() {},
        fieldInit() {}, fieldBindXI() {}, fieldEvent() {}, timeline() {}, varReview() { return false; },
        encerrarTransmissao() {}, stopCrowdLoop() {}, radioHide() {}, corCamisa() { return '#fff'; },
        corRivalContraste() { return '#000'; }
    };
    const documentStub = {
        getElementById: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {} })
    };

    const corpo = extrairFonte();
    // ATENÇÃO: o corpo declara const ClubEcosystem/GAME_DATA/etc. — os parâmetros
    // NÃO podem repetir esses nomes (SyntaxError de redeclaração). Só entram aqui
    // os livres que o corpo não declara: document/MatchUI/TempoPagina/window/timers.
    // `ui`/`app` ficam undefined: o motor usa typeof-guard em todas as chamadas.
    const fabrica = new Function(
        'document', 'MatchUI', 'TempoPagina', 'window',
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'ui', 'app',
        corpo + '\n;return { MatchSim, Engine, escalarTitularesXI, bonusQuimica, CONDICOES_JOGO, mulberry32, hashStr'
        + ', calcularXPParticipacao: (typeof calcularXPParticipacao === "function" ? calcularXPParticipacao : null)'
        + ', fecharPartidaElenco: (typeof fecharPartidaElenco === "function" ? fecharPartidaElenco : null)'
        + ', Player, Club, League, TransferMarket, LockerRoom, ClubEcosystem, CompetitionSystem, GAME_DATA, TaticaCard };'
    );
    const appStub = opts.app || {};
    const api = fabrica(
        documentStub, MatchUI, TempoPagina, {},
        vSetTimeout, vClearTimeout, vSetInterval, vClearTimeout,
        undefined, appStub
    );
    return {
        ...api,
        MatchUI,
        TempoPagina,
        app: appStub,
        get agora() { return vnow; },
        drenarTimers(maxPassos = 200000) {
            let passos = 0;
            while (fila.length) {
                if (++passos > maxPassos) throw new Error('loop de timers: ' + passos);
                fila.sort((a, b) => (a.t - b.t) || (a.ordem - b.ordem));
                const it = fila.shift();
                if (cancelados.has(it.id)) continue;
                vnow = Math.max(vnow, it.t);
                it.fn();
            }
        }
    };
}

// ---- Elencos sintéticos controlados (mesma forma dos objetos Player que o motor lê) ----
function makePlayer(id, posicao, overall, opts = {}) {
    return {
        id: String(id),
        nome: (opts.nome || ('Jogador ' + id)),
        posicao,
        overall,
        ovrEfetivo() {
            const m = (this.moral == null ? 70 : this.moral);
            return (this.overall || 55) + (m < 30 ? -3 : (m >= 85 ? 1 : 0));
        },
        folego: opts.folego == null ? 100 : opts.folego,
        folegMax: 100,
        moral: opts.moral == null ? 70 : opts.moral,
        stats: Object.assign({ GK: 50, DEF: 50, MID: 50, ATT: 50, VEL: 50, PAS: 50, FIN: 50 }, opts.stats),
        traits: opts.traits || [],
        origem: opts.origem || 'mercado',
        machucado: false,
        gols: 0, assistencias: 0, partidas: 0
    };
}

function makeSquad(prefix, overall, opts = {}) {
    // 1 GK · 4 DEF · 4 MID · 3 ATT — mesma densidade de linha do elenco real.
    const plan = [
        ['GK', 1], ['DEF', 4], ['MID', 4], ['ATT', 3]
    ];
    const elenco = [];
    let n = 0;
    plan.forEach(([pos, qtd]) => {
        for (let i = 0; i < qtd; i++) {
            const jitter = opts.jitter == null ? 0 : ((i * 7 + n * 3) % (opts.jitter * 2 + 1)) - opts.jitter;
            elenco.push(makePlayer(prefix + '-' + (n++), pos, Math.max(20, Math.min(99, overall + jitter)), opts));
        }
    });
    // banco extra (3 reservas) para a IA de substituição ter material
    ['DEF', 'MID', 'ATT'].forEach((pos, i) => {
        elenco.push(makePlayer(prefix + '-B' + i, pos, Math.max(20, overall - 6 + (opts.jitter || 0)), opts));
    });
    return elenco;
}

function makeTeam(nome, overall, opts = {}) {
    return {
        nome,
        isUser: !!opts.isUser,
        elenco: opts.elenco || makeSquad(nome.replace(/\W/g, '').slice(0, 4) + overall, overall, opts),
        formacao: opts.formacao || '4-4-2',
        moral: opts.moral == null ? 75 : opts.moral,
        mentalidade: opts.mentalidade || 'equilibrada',
        perfilJogo: opts.perfilJogo || null,
        orcamento: opts.orcamento == null ? 1000000 : opts.orcamento,
        fans: 50, etica: 50,
        _infra: opts.infra || {}
    };
}

// ---- Execução de uma partida detalhada (relógio virtual, mesma matemática do jogo) ----
function runMatch(cfg = {}) {
    const sb = novoSandbox();
    const home = cfg.home || makeTeam('Casa', cfg.ovrH == null ? 70 : cfg.ovrH, { isUser: cfg.userHome !== false, formacao: cfg.formH, mentalidade: cfg.mentalH });
    const away = cfg.away || makeTeam('Fora', cfg.ovrA == null ? 70 : cfg.ovrA, { formacao: cfg.formA, mentalidade: cfg.mentalA });
    sb.MatchUI._politicaDecisao = cfg.decisao == null ? 1 : cfg.decisao;
    let resultado = null;
    const sim = new sb.MatchSim(home, away, cfg.onTick || null, (h, a, pen) => {
        resultado = { h, a, pen: pen || null, sim };
    }, {
        seed: cfg.seed == null ? 1 : cfg.seed,
        modo: 'detalhado',
        minDurMs: 0,
        tempoMin: cfg.tempoMin || 90,
        estilo: cfg.estilo || 'equilibrado',
        craque: cfg.craque || null,
        regra: cfg.regra || null,
        condicao: cfg.condicao || 'normal',
        startMinute: cfg.startMinute || 0,
        startScore: cfg.startScore || null,
        startRedUser: cfg.startRedUser || 0
    });
    if (cfg.preSim) cfg.preSim(sim);
    sim.start();
    sb.drenarTimers();
    if (!resultado) throw new Error('partida não terminou (seed ' + cfg.seed + ')');
    return { ...resultado, sim, home, away, sb };
}

// ---- quickSim (mesma fachada usada pelos jogos IA×IA em simulateAIMatches) ----
// Chama o Engine.quickSim REAL do jogo (seedExtra = amostra independente):
// a bancada mede exatamente o modelo que roda na tabela da liga.
function quickSimSeedado(h, a, seedStr) {
    const sb = novoSandbox();
    return sb.Engine.quickSim(h, a, seedStr);
}

module.exports = { novoSandbox, extrairFonte, makePlayer, makeSquad, makeTeam, runMatch, quickSimSeedado };
