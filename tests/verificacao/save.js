'use strict';
// tests/verificacao/save.js — extrai o SaveRepository REAL do index.html e prova que
// gravação e leitura produzem o mesmo checksum (saves de jogadores continuam válidos),
// que a adulteração segue sendo detectada e que o round-trip funciona.
// Uso: node tests/verificacao/save.js [caminho/index.html]
const vm = require('vm');
const { lerIndex, criarRelatorio, encerrar } = require('./_lib');
const L = require('../carreira-lib.js');

const src = lerIndex(process.argv[2]);
const rel = criarRelatorio('SaveRepository');

function recorte(ini, fim) {
    const a = src.indexOf(ini);
    if (a < 0) throw new Error('marcador inicial não encontrado: ' + ini);
    const b = src.indexOf(fim, a);
    if (b < 0) throw new Error('marcador final não encontrado: ' + fim);
    return src.slice(a, b);
}

const codigo = recorte('const ABA_ID', "GameState.on('save:erro'");
const sb = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, Array, Object,
    String, Error, Boolean, Map, Set, WeakMap, parseInt, parseFloat, isNaN, isFinite,
    indexedDB: undefined,
    GameState: { emit() { }, on() { } },
    ui: { showActionFeedback() { } }
};
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(codigo + '\n;globalThis.__SR = SaveRepository;', sb);
const SR = sb.__SR;
if (!SR) throw new Error('SaveRepository não foi carregado do index.html');

// Carreira sintética com acentos, decimais e estruturas aninhadas.
function carreira() {
    const elenco = [];
    for (let i = 0; i < 24; i++) {
        elenco.push({
            id: 'p' + i, nome: 'Atleta Ção ' + i, ovr: 60 + (i % 30),
            folego: 87.5, pos: 'ATA', historico: [1, 2, 3]
        });
    }
    const clubes = [];
    for (let i = 0; i < 20; i++) {
        clubes.push({ nome: 'Clube ' + i, elenco, orcamento: 1234567.89, formaRecente: ['V', 'E', 'D'] });
    }
    return { club: clubes[0], league: { clubes, rodada: 12, nome: 'Série D' }, marketPlayers: clubes.slice(0, 10) };
}

rel.t('schema declarado é 3', SR.schema === 3, 'schema=' + SR.schema);

rel.t('checksum(gravação) === checksum(leitura)', (() => {
    const env = SR.envelope(carreira(), 1);
    return env.checksum === SR.checksum(env.data);
})());

rel.t('checksum aceita texto e objeto com o mesmo resultado', (() => {
    const data = carreira();
    const texto = JSON.stringify(data);
    return SR.checksum(texto) === SR.checksum(data);
})());

rel.t('verify() aceita envelope recém-gerado', (() => {
    try { SR.verify(SR.envelope(carreira(), 2)); return true; } catch (e) { return false; }
})());

rel.t('verify() rejeita envelope adulterado', (() => {
    const env = SR.envelope(carreira(), 2);
    env.data.club.orcamento = 999999999;
    try { SR.verify(env); return false; } catch (e) { return true; }
})());

rel.t('envelope rejeita estado inválido', (() => {
    try { SR.envelope({ club: { nome: 'x' }, league: { clubes: [] } }, 1); return false; }
    catch (e) { return true; }
})());

rel.t('round-trip grava e lê pelo storage', (() => {
    const store = new Map();
    sb.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k)
    };
    const data = carreira();
    SR.write(3, data, false);
    const lido = SR.read(3, false);
    return !!lido && lido.data.club.nome === data.club.nome && lido.data.league.rodada === 12;
})());

rel.t('slot de autosave é separado do slot principal', SR.key(1, false) !== SR.key(1, true),
    SR.key(1, false) + ' vs ' + SR.key(1, true));

// B64: campo novo aditivo precisa de guarda para save antigo (sem bump de schema).
rel.t('save antigo ganha os fios narrativos (guarda em normalizeNewFields)',
    /if \(club\.fios == null \|\| typeof club\.fios !== 'object'/.test(src));

// --- B40: cascata de migração e B39: importação hostil ---
rel.t('B40: schema antigo (2) verifica e migra até o atual', (() => {
    const env = SR.envelope(carreira(), 1);
    env.schema = 2;
    return SR.verify(env) === env && SR.migrar(env).schema === SR.schema;
})());
rel.t('B40: schema de versão futura é recusado (não adivinha)', (() => {
    const env = SR.envelope(carreira(), 1);
    env.schema = SR.schema + 6;
    try { SR.verify(env); return false; } catch (e) { return true; }
})());
rel.t('B39: nome de clube com marcação é recusado na importação', (() => {
    const d = carreira();
    d.club.nome = '<img src=x onerror=alert(1)>';
    return SR.validData(d) === false;
})());
rel.t('B41: restauração decide pelo RAW (stats/clubeId não herdam o construtor)',
    /_restaurarJogador\(rawP\)/.test(src) && /bruto\.stats/.test(src) && /bruto\.clubeId/.test(src));
rel.t('B33: init não regrava o save logo após carregar',
    /B33: NÃO salvar aqui/.test(src));
rel.t('B32: loadGame limpa a carreira em memória quando o slot falha',
    /B32: o slot selecionado não carregou/.test(src));
rel.t('B3: recuperação de fôlego é idempotente por temporada:rodada',
    /ultimaRecuperacaoFadiga === chave/.test(src));

// =====================================================================================
// B44 (2026-10-21) — os três buracos que restaram da auditoria de 2026-10-15:
// `normalizeNewFields` por faixa de versão, import/export de ARQUIVO e quota de
// armazenamento. B28/B29 passaram com 23/23 verde justamente porque nada disso era testado.
// =====================================================================================

// ---- (1) normalizeNewFields executado de verdade, sobre um clube "v1" ----
const metodoCru = recorte('normalizeNewFields(club) {', '\n    stadiumRevenue() {');
const metodoNorm = metodoCru.replace(/,?\s*$/, '');
const stubsMigracao = {
    ClubEcosystem: { normalize() { } },
    GAME_DATA: { taticas: Array.from({ length: 8 }, (_, i) => ({ id: 't' + i, nome: 'Tática ' + i })) },
    TaticaCard: class { constructor(base) { Object.assign(this, base || {}); } },
    _perfilTatico: () => ({ formacao: '4-3-3', mentalidade: 'ofensiva', perfilJogo: 'posse' })
};
const normalize = new Function('ClubEcosystem', 'GAME_DATA', 'TaticaCard', '_perfilTatico',
    'return ({\n' + metodoNorm + '\n}).normalizeNewFields;'
)(
    stubsMigracao.ClubEcosystem, stubsMigracao.GAME_DATA, stubsMigracao.TaticaCard, stubsMigracao._perfilTatico
);
const clubeV1 = () => ({
    nome: 'Antigo FC', isUser: true, orcamento: 250000,
    elenco: [{ id: 'p1', nome: 'Zé Velho', posicao: 'ATA', overall: 64 }]
});
rel.t('B44: normalizeNewFields é extraível e roda sobre um save v1 (sem construtor)',
    typeof normalize === 'function' && (() => { const c = clubeV1(); normalize(c); return c.saveVersion === 1; })());

rel.t('B44: save v1 ganha os campos guardados (clube e jogador)', (() => {
    const c = clubeV1();
    normalize(c);
    const p = c.elenco[0];
    return c.estadioNivel === 1 && c.baseNivel === 1 && c.moral === 75 && c.fans === 50
        && c.etica === 50 && Array.isArray(c.ofertas) && Array.isArray(c.missoes)
        && typeof c.fios === 'object' && !Array.isArray(c.fios)
        && Array.isArray(c.historicoTemporadas) && typeof c.recordes === 'object'
        && c.patrocinio && c.patrocinio.tipo === 'passivo'
        && p.folego === 100 && p.moral === 70 && p.tier === 'Bronze'
        && p.origem === 'mercado' && p.potencialRevelado === false
        && p.stats && typeof p.stats === 'object' && p.rodadasRecuperacao === 0;
})());

rel.t('B44: normalizeNewFields é idempotente (rodar duas vezes não muda o save)', (() => {
    const c = clubeV1();
    normalize(c);
    const primeira = JSON.stringify(c);
    normalize(c);
    return JSON.stringify(c) === primeira;
})());

rel.t('B44: faixa de versão é respeitada (saveVersion 2 não é rebaixado)', (() => {
    const c = clubeV1();
    c.saveVersion = 2;
    normalize(c);
    return c.saveVersion === 2;
})());

rel.t('B44: contrato de patrocínio do save novo não vira legado', (() => {
    const c = clubeV1();
    c.patrocinio = { id: 'p_fixo', nome: 'Banco', tipo: 'fixo', fixo: 40000, metas: [], ativo: true };
    normalize(c);
    return c.patrocinio.tipo === 'fixo' && c.patrocinio.fixo === 40000;
})());

rel.t('B44: ética inválida cai no neutro 50; ética válida é preservada', (() => {
    const a = clubeV1(); a.etica = 'abc'; normalize(a);
    const b = clubeV1(); b.etica = 88; normalize(b);
    return a.etica === 50 && b.etica === 88;
})());

rel.t('B44: clube da IA não recebe a coleção de táticas e ganha o perfil do nome', (() => {
    const c = clubeV1();
    c.isUser = false;
    c.formacao = '4-4-2'; c.mentalidade = 'equilibrada';
    normalize(c);
    return (c.taticas || []).length === 0 && c.formacao === '4-3-3' && c.perfilJogo === 'posse';
})());

rel.t('B44: save do usuário completa a coleção com 4 táticas (e só 4)', (() => {
    const c = clubeV1();
    normalize(c);
    const primeira = c.taticas.length;
    normalize(c);
    return primeira === 4 && c.taticas.length === 4;
})());

// ---- (2) export/import de ARQUIVO: o mesmo texto que o Blob baixa é o que a importação lê ----
const ev = SR.envelope(carreira(), 2);
const arquivo = JSON.stringify(ev); // exatamente o que exportSave põe no Blob
rel.t('B44: o arquivo exportado volta pelo parse + verify sem perder nada', (() => {
    const lido = SR.verify(SR.parse(arquivo));
    return lido.slot === 2 && lido.schema === SR.schema && lido.checksum === ev.checksum
        && lido.data.club.nome === ev.data.club.nome && lido.data.league.rodada === 12;
})());
rel.t('B44: arquivo adulterado é recusado na importação', (() => {
    const ruim = JSON.parse(arquivo);
    ruim.data.club.orcamento = 987654321;
    try { SR.verify(ruim); return false; } catch (e) { return true; }
})());
rel.t('B44: parse recusa arquivo acima de 12 MB (sem ler o conteúdo)', (() => {
    try { SR.parse('x'.repeat(12000001)); return false; } catch (e) { return true; }
})());
rel.t('B44: parse recusa __proto__ (poluição de protótipo)', (() => {
    try { SR.parse('{"__proto__":{"poluido":1}}'); return false; } catch (e) { return true; }
})());
rel.t('B44: parse recusa número não finito', (() => {
    try { SR.parse('{"a":1e999}'); return false; } catch (e) { return true; }
})());
rel.t('B44: exportSave usa envelope + Blob, e importSave passa por parse/verify/_restoreFromRaw',
    /exportSave\(\) \{[\s\S]{0,900}SaveRepository\.envelope\(/.test(src)
    && /exportSave\(\) \{[\s\S]{0,1400}new Blob\(/.test(src)
    && /_handleImportFile\(file\) \{[\s\S]{0,700}SaveRepository\.parse\(reader\.result\)/.test(src)
    && /_handleImportFile\(file\) \{[\s\S]{0,2200}this\._restoreFromRaw\(/.test(src));
rel.t('B44: importação ainda aceita save legado (version 1/2) e limita o arquivo a 12 MB',
    /\[1, 2\]\.includes\(payload\.version\)/.test(src) && /file\.size > 12000000/.test(src));

// ---- B-SAVE (2026-10-28): NOVO JOGO com confirmação, dificuldade validada no import/load ----
// (a) startNewGame executado de verdade (classe montada a partir do trecho do index.html).
const novoJogoCodigo = recorte('startNewGame() {', '// B31: ESC no modal de criação').replace(/,\s*$/, '');
function criarAppNovoJogo(ocupados, respostaConfirm) {
    const log = { modal: 0, selects: [], confirms: 0 };
    const ui = { openClubNameModal() { log.modal++; } };
    const confirm = () => { log.confirms++; return respostaConfirm; };
    const Classe = new Function('ui', 'confirm', 'return class {' + novoJogoCodigo + '}')(ui, confirm);
    const app = new Classe();
    app.slot = 1;
    app.hasSaveInSlot = n => ocupados.includes(n);
    app.selectSlot = n => { log.selects.push(n); app.slot = n; app.startNewGame(); };
    return { app, log };
}
rel.t('B-SAVE: NOVO JOGO em slot vazio abre o modal sem perguntar', (() => {
    const { app, log } = criarAppNovoJogo([], true);
    app.startNewGame();
    return log.modal === 1 && log.confirms === 0;
})());
rel.t('B-SAVE: slot ocupado + slot vazio, confirmar: troca para o vazio e abre o modal', (() => {
    const { app, log } = criarAppNovoJogo([1], true);
    app.startNewGame();
    return log.confirms === 1 && JSON.stringify(log.selects) === '[2]' && log.modal === 1;
})());
rel.t('B-SAVE: slot ocupado + slot vazio, cancelar: nada muda e o modal não abre', (() => {
    const { app, log } = criarAppNovoJogo([1], false);
    app.startNewGame();
    return log.confirms === 1 && log.selects.length === 0 && log.modal === 0 && app.slot === 1;
})());
rel.t('B-SAVE: todos os slots ocupados, cancelar: carreira mantida (sem modal)', (() => {
    const { app, log } = criarAppNovoJogo([1, 2, 3], false);
    app.startNewGame();
    return log.confirms === 1 && log.selects.length === 0 && log.modal === 0;
})());
rel.t('B-SAVE: todos os slots ocupados, confirmar: substitui e abre o modal', (() => {
    const { app, log } = criarAppNovoJogo([1, 2, 3], true);
    app.startNewGame();
    return log.confirms === 1 && log.selects.length === 0 && log.modal === 1;
})());
rel.t('B-SAVE: startNewGame usa hasSaveInSlot antes de qualquer confirm/modal',
    /startNewGame\(\) \{[\s\S]{0,300}hasSaveInSlot\(atual\)[\s\S]{0,400}confirm\(/.test(src));

// (b) normalizarDificuldade: só 0.75/0.9/1/1.3 passam; o resto vira 1.0 (nome recalculado por diffName).
const difCodigo = recorte('diffName(mult) {', '// Bônus de XP conforme dificuldade').replace(/\}\s*,/g, '}');
const Dificuldade = new Function('return class {' + difCodigo + '}')();
const dif = new Dificuldade();
rel.t('B-SAVE: normalizarDificuldade preserva 0.75/0.9/1/1.3 com o nome de diffName', (() => {
    const esperado = [[0.75, 'Fácil'], [0.9, 'Médio'], [1, 'Profissional'], [1.3, 'Lenda']];
    return esperado.every(([m, nome]) => {
        const r = dif.normalizarDificuldade(m);
        return r.multiplier === m && r.nome === nome;
    });
})());
rel.t('B-SAVE: normalizarDificuldade troca valores fora do seletor e tipos errados por 1.0', (() => {
    const lixo = [7, -5, 1e6, 'x', null, undefined, NaN, '0.9', {}, [0.9]];
    return lixo.every(v => {
        const r = dif.normalizarDificuldade(v);
        return r.multiplier === 1 && r.nome === 'Profissional';
    });
})());
rel.t('B-SAVE: import valida a dificuldade e migra o envelope antes de ler o conteúdo',
    /_handleImportFile\(file\) \{[\s\S]{0,700}SaveRepository\.migrar\(SaveRepository\.verify\(payload\)\)/.test(src)
    && /_handleImportFile\(file\) \{[\s\S]{0,2200}this\.difficulty = this\.normalizarDificuldade\(payload\.difficulty\.multiplier\)/.test(src));
rel.t('B-SAVE: carregar carreira valida a dificuldade gravada',
    /if \(clubRaw\.difficulty\) this\.difficulty = this\.normalizarDificuldade\(clubRaw\.difficulty\.multiplier\)/.test(src));

// ---- B39 (2026-10-28): XSS residual — validação ESTRITA só na importação; escape no render ----
// Save de verdade: clube criado pelas funções reais do jogo (mesmo caminho do tests/carreira.js).
const sbJogo = L.novoSandboxCarreira({ index: process.argv[2] });
sbJogo.app.createNewClub('Clube Import Teste');
const jogoReal = () => JSON.parse(JSON.stringify({
    club: sbJogo.app.club, league: sbJogo.app.league, marketPlayers: sbJogo.app.marketPlayers || []
}));
const codigoEscape = recorte('function escaparHTML(valor) {', '// --- Renderer da tela de partida');
vm.runInContext(codigoEscape + '\n;globalThis.__escaparHTML = escaparHTML; globalThis.__idSeguro = idSeguro;', sb);
const escaparHTML = sb.__escaparHTML, idSeguro = sb.__idSeguro;
const lidoSemErro = d => { try { SR.verify(JSON.parse(JSON.stringify(SR.envelope(d, 1)))); return true; } catch (e) { return false; } };
const comOvr = v => { const d = jogoReal(); d.club.elenco[0].overall = v; return d; };
const comIdRuim = () => { const d = jogoReal(); d.club.elenco[0].id = "x'y"; return d; };

rel.t('B39: save gerado pelo jogo passa na importação ESTRITA', SR.validDataEstrito(jogoReal()) === true);
rel.t('B39: save gerado pelo jogo passa na leitura (verify)', lidoSemErro(jogoReal()));
rel.t('B39: escaparHTML neutraliza " \' < & (texto e atributo)',
    escaparHTML('"\'<&>') === '&quot;&#39;&lt;&amp;&gt;');
rel.t('B39: idSeguro devolve o id base36 e vazio para id com apóstrofo',
    idSeguro('a778cygkw') === 'a778cygkw' && idSeguro("x'y") === '' && idSeguro('') === '');
rel.t('B39: import aceita aspas soltas num nome de tática (o render é que escapa)', (() => {
    const d = jogoReal();
    d.club.taticas = [{ id: 't_pressao', nome: 'Pressão "total" de O\'Neil', raridade: 'Prata' }];
    return SR.validDataEstrito(d) === true;
})());
rel.t('B39: id com apóstrofo é recusado na importação', SR.validDataEstrito(comIdRuim()) === false);
rel.t('B39: id com apóstrofo continua legível na leitura legada (read não é estrito)', lidoSemErro(comIdRuim()));
rel.t('B39: overall 0 é recusado na importação', SR.validDataEstrito(comOvr(0)) === false);
rel.t('B39: overall 100 é recusado na importação', SR.validDataEstrito(comOvr(100)) === false);
rel.t("B39: overall 'x' é recusado na importação", SR.validDataEstrito(comOvr('x')) === false);
rel.t('B39: overall NaN é recusado na importação', SR.validDataEstrito(comOvr(NaN)) === false);
rel.t('B39: posicao fora de A-Z (x"y) é recusada na importação', (() => {
    const d = jogoReal(); d.club.elenco[0].posicao = 'x"y';
    return SR.validDataEstrito(d) === false;
})());
rel.t('B39: "<" em notícia é recusado na importação', (() => {
    const d = jogoReal(); d.league.noticias = ['<img src=x onerror=alert(1)>'];
    return SR.validDataEstrito(d) === false;
})());
rel.t('B39: "<" em notícia continua legível na leitura (estrito só no import)', (() => {
    const d = jogoReal(); d.league.noticias = ['<b>x</b>'];
    return lidoSemErro(d);
})());
rel.t('B39: taticas que não é lista de objetos com nome é recusado na importação', (() => {
    const d = jogoReal(); d.club.taticas = 'x';
    return SR.validDataEstrito(d) === false;
})());
rel.t('B39: importação usa validDataEstrito e leitura (verify/read) não usa',
    /_handleImportFile\(file\) \{[\s\S]{0,900}SaveRepository\.validDataEstrito\(/.test(src)
    && !/verify\(raw\) \{[\s\S]{0,400}validDataEstrito/.test(src)
    && !/read\(slot, auto = false\) \{[\s\S]{0,600}validDataEstrito/.test(src));
rel.t('B39: handlers inline não recebem p.id/o.playerId/stat crus',
    !/'\$\{(p|o)\.(id|playerId)\}'/.test(src) && !/'\$\{stat\}'/.test(src));
rel.t('B39: atributos title com nome de tática/gol/decisão passam por escape',
    !/title="\$\{(t\.nome|e\.label|d\.label)/.test(src));

// ---- TAREFA A (2026-10-28): gravação da memória sem reviver e sem 2º stringify ----
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Cópia fiel do envelope() ANTERIOR à mudança: referência para a prova byte a byte.
function envelopeAntigo(data, slot) {
    const texto = JSON.stringify(data);
    const snapshot = SR.parse(texto);
    if (!SR.validData(snapshot)) throw new Error('Estado da carreira inválido.');
    SR.clock = Math.max(Date.now(), SR.clock + 1);
    return { app: 'AltFootELITE', schema: SR.schema, slot, savedAt: SR.clock, data: snapshot, checksum: SR.checksum(texto) };
}
function lojaMemoria() {
    const store = new Map();
    sb.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k)
    };
    return store;
}
// Conta chamadas de JSON.parse que receberam reviver (a sandbox usa o mesmo objeto JSON do processo).
function contarReviver(fn) {
    const orig = JSON.parse;
    let n = 0;
    JSON.parse = function (texto, reviver) { if (typeof reviver === 'function') n++; return orig.call(JSON, texto, reviver); };
    try { fn(); } finally { JSON.parse = orig; }
    return n;
}
function casosBytes() {
    const a = jogoReal();
    a.club.fracao = NaN; a.club.pequeno = 1.5e-7; a.club.negZero = -0; a.club.grande = 1e21;
    a.league.noticias = ['Ação "rápida"\n\t✓   \ud83d'];
    return [[a, 2], [carreira(), 1], [jogoReal(), 3]];
}

rel.t('A: envelope() novo == envelope antigo, byte a byte (JSON.stringify), 3 casos', casosBytes().every(([d, slot]) => {
    SR.clock = 4e12; const velho = JSON.stringify(envelopeAntigo(d, slot));
    SR.clock = 4e12; const novo = JSON.stringify(SR.envelope(d, slot));
    return velho === novo;
}));
rel.t('A: envelope() sem slot == envelope antigo, byte a byte', (() => {
    const d = jogoReal();
    SR.clock = 4e12; const velho = JSON.stringify(envelopeAntigo(d, undefined));
    SR.clock = 4e12; const novo = JSON.stringify(SR.envelope(d, undefined));
    return velho === novo;
})());
rel.t('A: texto gravado no localStorage == JSON.stringify do envelope antigo, byte a byte', (() => {
    const store = lojaMemoria(); SR.db = null; SR.cache = new Map();
    return casosBytes().every(([d, slot]) => {
        SR.clock = 4e12; const velho = JSON.stringify(envelopeAntigo(d, slot));
        SR.clock = 4e12; SR.write(slot, d, false);
        return store.get(SR.key(slot, false)) === velho;
    });
})());
rel.t('A: round-trip write→read devolve dado idêntico (deepStrictEqual) em carreira do jogo', (() => {
    lojaMemoria(); SR.db = null;
    const d = jogoReal();
    SR.cache = new Map(); SR.write(3, d, false);
    SR.cache = new Map();
    try {
        assert.deepStrictEqual(SR.read(3, false).data, d);   // pela leitura do localStorage (reviver)
        assert.deepStrictEqual(SR.read(3, false).data, d);   // pelo cache da sessão (sem reviver)
        return true;
    } catch (e) { return false; }
})());
rel.t('A: adulteração de 1 caractere no texto gravado é rejeitada pelo checksum', (() => {
    const store = lojaMemoria(); SR.db = null; SR.cache = new Map();
    const d = jogoReal();
    SR.write(3, d, false);
    const txt = store.get(SR.key(3, false));
    const nome = d.club.nome;
    const trocado = nome.replace(/[a-z]/i, c => (c === 'a' ? 'b' : 'a'));
    const adulterado = txt.replace('"' + nome + '"', '"' + trocado + '"');
    if (adulterado === txt) return false;
    store.set(SR.key(3, false), adulterado);
    SR.cache = new Map();
    return SR.read(3, false) === null;
})());
rel.t('A: write() de dado da memória não chama reviver (0 chamadas)', (() => {
    lojaMemoria(); SR.db = null; SR.cache = new Map();
    const d = jogoReal();
    return contarReviver(() => SR.write(1, d, false)) === 0;
})());
rel.t('A: leitura do localStorage chama reviver', (() => {
    lojaMemoria(); SR.db = null; SR.cache = new Map();
    SR.write(1, jogoReal(), false);
    SR.cache = new Map();
    return contarReviver(() => SR.read(1, false)) > 0;
})());
rel.t('A: import por arquivo (parse) chama reviver', contarReviver(() => SR.parse(arquivo)) > 0);
rel.t('A: leitura do cache da sessão não chama reviver', (() => {
    lojaMemoria(); SR.db = null; SR.cache = new Map();
    SR.write(1, jogoReal(), false);
    sb.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
    const semReviver = contarReviver(() => SR.read(1, false)) === 0;
    return semReviver && SR.read(1, false) !== null;
})());

// (e) medição INFORMATIVA, sem assert de tempo: antes (snapshot pré-Lote 1C) x depois.
(function medirInformativo() {
    const caminho = process.env.ALTFOOT_SNAP_PRE || path.join(os.tmpdir(), 'altfoot-snap', 'index.pre-lote1C.html');
    if (!fs.existsSync(caminho)) { console.log('  [info] medição omitida: snapshot pré-Lote 1C ausente em ' + caminho); return; }
    try {
        const txtAntes = fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
        const a0 = txtAntes.indexOf('const SaveRepository = {');
        const b0 = txtAntes.indexOf("GameState.on('save:erro'", a0);
        const sbAntes = {
            console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, Array, Object,
            String, Error, Boolean, Map, Set, WeakMap, parseInt, parseFloat, isNaN, isFinite,
            indexedDB: undefined, GameState: { emit() { }, on() { } }, ui: { showActionFeedback() { } }
        };
        sbAntes.globalThis = sbAntes;
        vm.createContext(sbAntes);
        vm.runInContext(txtAntes.slice(a0, b0) + '\n;globalThis.__SR = SaveRepository;', sbAntes);
        const SRAntigo = sbAntes.__SR;
        const lojaAntiga = new Map();
        sbAntes.localStorage = { getItem: k => (lojaAntiga.has(k) ? lojaAntiga.get(k) : null), setItem: (k, v) => lojaAntiga.set(k, String(v)), removeItem: k => lojaAntiga.delete(k) };
        const dados = jogoReal();
        const mediana = fn => {
            const t = [];
            for (let i = 0; i < 7; i++) { const t0 = process.hrtime.bigint(); fn(); t.push(Number(process.hrtime.bigint() - t0) / 1e6); }
            t.sort((x, y) => x - y);
            return t[3].toFixed(2);
        };
        SRAntigo.db = null; SR.db = null;
        lojaMemoria();
        const tamKB = (JSON.stringify(dados).length / 1024).toFixed(0);
        console.log('  [info] carreira de teste: ' + tamKB + ' KB (mediana de 7 execuções, ms)');
        console.log('  [info] envelope():  antes ' + mediana(() => SRAntigo.envelope(dados, 1)) + ' · depois ' + mediana(() => SR.envelope(dados, 1)));
        console.log('  [info] write():     antes ' + mediana(() => SRAntigo.write(1, dados, false)) + ' · depois ' + mediana(() => SR.write(1, dados, false)));
        SRAntigo.write(1, dados, false); SR.write(1, dados, false);
        lojaMemoria(); SRAntigo.write(1, dados, false); SR.write(1, dados, false);
        console.log('  [info] read():      antes ' + mediana(() => { SRAntigo.cache = new Map(); SRAntigo.read(1, false); }) + ' · depois ' + mediana(() => { SR.cache = new Map(); SR.read(1, false); }));
    } catch (e) {
        console.log('  [info] medição não pôde rodar: ' + e.message);
    }
})();

// ---- TAREFA B (2026-10-28): prestígio (MetaProgress) no export/import ----
const codigoMeta = recorte('const MetaProgress = {', '// fut-cards.js');
vm.runInContext(codigoMeta + '\n;globalThis.__MP = MetaProgress;', sb);
const MP = sb.__MP;
if (!MP) throw new Error('MetaProgress não foi carregado do index.html');
const metaBase = { prestigio: 320, temporadas: 4, titulos: 1, museu: { 'Clube A': 3 } };

rel.t('B-META: mesclar é idempotente (aplicar 2x = 1x)', (() => {
    lojaMemoria();
    MP.mesclarImport(metaBase);
    const uma = JSON.stringify(MP.ler());
    MP.mesclarImport(metaBase);
    return JSON.stringify(MP.ler()) === uma && MP.ler().prestigio === 320;
})());
rel.t('B-META: import com prestígio menor não reduz (máximo por campo; museu = melhor posição)', (() => {
    lojaMemoria();
    MP.salvar({ versao: 1, prestigio: 400, temporadas: 6, titulos: 2, ultimaChave: 'x', museu: { 'Clube A': 2 } });
    MP.mesclarImport({ prestigio: 50, temporadas: 1, titulos: 0, museu: { 'Clube A': 9, 'Clube B': 5 } });
    const m = MP.ler();
    const ok1 = m.prestigio === 400 && m.temporadas === 6 && m.titulos === 2 && m.ultimaChave === 'x'
        && m.museu['Clube A'] === 2 && m.museu['Clube B'] === 5;
    MP.mesclarImport({ prestigio: 0, temporadas: 0, titulos: 0, museu: { 'Clube A': 1 } });
    return ok1 && MP.ler().museu['Clube A'] === 1;
})());
rel.t('B-META: import sem meta não altera o prestígio atual', (() => {
    lojaMemoria();
    MP.salvar(Object.assign(MP.padrao(), { prestigio: 120 }));
    const r = MP.mesclarImport(undefined);
    return r === null && MP.ler().prestigio === 120;
})());
rel.t('B-META: meta hostil (negativo, string, NaN, <, valor inválido, lista, primitivo) é ignorado sem lançar', (() => {
    const hostis = [
        { prestigio: -5, temporadas: 0, titulos: 0 },
        { prestigio: '999', temporadas: 0, titulos: 0 },
        { prestigio: NaN, temporadas: 0, titulos: 0 },
        { prestigio: 1e9, temporadas: 0, titulos: 0 },
        { prestigio: 10, temporadas: 0, titulos: 0, museu: { '<script>': 3 } },
        { prestigio: 10, temporadas: 0, titulos: 0, museu: { 'Clube A': 'x' } },
        { prestigio: 10, temporadas: 0, titulos: 0, museu: { constructor: 3 } },
        { prestigio: 10, temporadas: 0, titulos: 0, museu: { 'Clube A': 999 } },
        { prestigio: 10, temporadas: 0, titulos: 0, museu: [] },
        'texto', [1, 2], null, 42
    ];
    lojaMemoria();
    MP.salvar(Object.assign(MP.padrao(), { prestigio: 7 }));
    const todosNulos = hostis.every(h => { try { return MP.mesclarImport(h) === null; } catch (e) { return false; } });
    const m = MP.ler();
    return todosNulos && m.prestigio === 7 && !('Clube A' in m.museu);
})());
rel.t('B-META: o bloco meta vai dentro de data e o checksum cobre (adulteração rejeitada)', (() => {
    const d = Object.assign(jogoReal(), { meta: Object.assign(MP.padrao(), metaBase) });
    const ok = (() => { try { SR.verify(JSON.parse(JSON.stringify(SR.envelope(d, 1)))); return true; } catch (e) { return false; } })();
    const env = JSON.parse(JSON.stringify(SR.envelope(d, 1)));
    env.data.meta.prestigio = 5;
    let rejeitou = false;
    try { SR.verify(env); } catch (e) { rejeitou = true; }
    return ok && rejeitou;
})());
rel.t('B-META: validData e validDataEstrito toleram o campo meta', (() => {
    const d = Object.assign(jogoReal(), { meta: { prestigio: 10, museu: { 'Clube A': 3 } } });
    return SR.validData(d) === true && SR.validDataEstrito(d) === true;
})());
rel.t('B-META: exportSave põe meta: MetaProgress.ler() dentro do envelope (uma única vez no código)',
    /exportSave\(\) \{[\s\S]{0,900}meta: MetaProgress\.ler\(\)/.test(src)
    && (src.match(/meta: MetaProgress\.ler\(\)/g) || []).length === 1);
rel.t('B-META: import mescla payload.meta só quando ele existe',
    /if \(payload\.meta !== undefined\) MetaProgress\.mesclarImport\(payload\.meta\)/.test(src));
SR.cache = new Map(); SR.db = null;

// ---- (3) quota: localStorage cheio, IndexedDB quebrado e o caminho silencioso ----
const emitidos = [];
sb.GameState.emit = (evento) => emitidos.push(evento);

function storageQuebrado() {
    sb.localStorage = {
        getItem: () => null,
        setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; },
        removeItem: () => { }
    };
}
function storageOk() {
    const store = new Map();
    sb.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k)
    };
}
const dbQuebrado = () => ({
    transaction() { return { objectStore() { return { put() { throw new Error('QuotaExceededError (IndexedDB)'); } }; } }; }
});

(async () => {
    // 3a — localStorage cheio e sem IndexedDB: a gravação falha ALTO (o jogador é mandado exportar).
    SR.db = null;
    SR.queue = Promise.resolve();
    storageQuebrado();
    let falhouAlto = false;
    try { SR.write(1, carreira(), false); } catch (e) { falhouAlto = /Armazenamento indisponível/.test(String(e.message)); }
    rel.t('B44: sem localStorage e sem IndexedDB, write() falha alto (nunca finge que salvou)', falhouAlto);

    // 3b — localStorage cheio e IndexedDB quebrado: emite save:erro para a UI avisar.
    emitidos.length = 0;
    storageQuebrado();
    SR.db = dbQuebrado();
    SR.queue = Promise.resolve();
    SR.write(1, carreira(), false);
    await SR.queue;
    rel.t('B44: quota no localStorage + IndexedDB quebrado emite save:erro', emitidos.indexOf('save:erro') >= 0,
        'eventos: ' + emitidos.join(',') || '(nenhum)');

    // 3c — localStorage gravou: IndexedDB quebrado NÃO vira alarme (há cópia boa).
    emitidos.length = 0;
    storageOk();
    SR.db = dbQuebrado();
    SR.queue = Promise.resolve();
    const gravado = SR.write(2, carreira(), false);
    await SR.queue;
    rel.t('B44: com fallback no localStorage, falha do IndexedDB é silenciosa',
        gravado && emitidos.indexOf('save:erro') < 0, 'eventos: ' + (emitidos.join(',') || '(nenhum)'));

    // 3d — a cópia lida depois da falha do banco continua sendo a última boa.
    const relido = SR.read(2, false);
    rel.t('B44: a carreira lida depois da falha bate com a última gravação', !!relido && relido.data.league.rodada === 12);

    // 3e (B-SAVE) — cota cheia com cópia antiga no localStorage: a antiga é removida e não volta.
    const armazem = new Map();
    sb.localStorage = {
        getItem: k => (armazem.has(k) ? armazem.get(k) : null),
        setItem: (k, v) => armazem.set(k, String(v)),
        removeItem: k => armazem.delete(k)
    };
    SR.db = null; SR.queue = Promise.resolve(); SR.cache = new Map();
    const antiga = carreira(); antiga.league.rodada = 5;
    SR.write(3, antiga, false);
    const chave = SR.key(3, false);
    const havia = armazem.has(chave);
    sb.localStorage = {
        getItem: k => (armazem.has(k) ? armazem.get(k) : null),
        setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; },
        removeItem: k => armazem.delete(k)
    };
    SR.db = dbQuebrado(); SR.queue = Promise.resolve();
    SR._avisoCotaMostrado = false;
    emitidos.length = 0;
    const nova = carreira(); nova.league.rodada = 99;
    SR.write(3, nova, false);
    SR.write(3, nova, false);
    await SR.queue;
    rel.t('B-SAVE: pré-condição: a cópia antiga estava no localStorage', havia);
    rel.t('B-SAVE: cota cheia remove a cópia antiga da mesma chave', !armazem.has(chave));
    rel.t('B-SAVE: a leitura seguinte devolve a carreira nova, não a antiga', (() => {
        const lido = SR.read(3, false);
        return !!lido && lido.data.league.rodada === 99;
    })());
    SR.cache = new Map();
    rel.t('B-SAVE: sem cache em memória, a cópia antiga não reaparece na leitura', SR.read(3, false) === null);
    rel.t('B-SAVE: aviso de cota sai uma única vez por sessão (duas falhas, um save:cota)',
        emitidos.filter(e => e === 'save:cota').length === 1, 'eventos: ' + emitidos.join(','));

    // ---- (4) duas abas com o mesmo slot: concorrência otimista pelo carimbo no localStorage ----
    // Cada "aba" é um sandbox novo (ABA_ID próprio) sobre o MESMO localStorage falso.
    const mapaStorage = armazem => ({
        getItem: k => (armazem.has(k) ? armazem.get(k) : null),
        setItem: (k, v) => armazem.set(k, String(v)),
        removeItem: k => armazem.delete(k)
    });
    const dbOk = () => ({
        transaction() {
            const tx = { objectStore() { return { put() { } }; } };
            setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
        }
    });
    function novaAba(armazem, extras) {
        const emit = [];
        const ctx = {
            console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, Array, Object,
            String, Error, Boolean, Map, Set, WeakMap, parseInt, parseFloat, isNaN, isFinite,
            indexedDB: undefined,
            GameState: { emit: e => emit.push(e), on() { } },
            ui: { showActionFeedback() { } },
            localStorage: armazem,
            ...extras
        };
        ctx.globalThis = ctx;
        vm.createContext(ctx);
        vm.runInContext(codigo + '\n;globalThis.__SR = SaveRepository;', ctx);
        return { SR: ctx.__SR, emit, aba: vm.runInContext('ABA_ID', ctx) };
    }
    const conflitos = aba => aba.emit.filter(e => e === 'save:conflito').length;

    {   // (1) A grava; B carregou antes; A grava de novo; B tenta gravar -> bloqueada + aviso
        const arm = new Map();
        const A = novaAba(mapaStorage(arm)), B = novaAba(mapaStorage(arm));
        A.SR.db = null; B.SR.db = null;
        A.SR.write(1, carreira(), false);
        B.SR.reconhecerCarimbo(1);
        A.SR.write(1, carreira(), false);
        const principalAntes = arm.get(A.SR.key(1, false));
        const dadosB = carreira(); dadosB.league.rodada = 77;
        const r = B.SR.write(1, dadosB, false);
        rel.t('(1) aba defasada (B) tem a gravação bloqueada e o save da aba A permanece intacto',
            r === null && arm.get(A.SR.key(1, false)) === principalAntes);
        rel.t('(1) aba bloqueada emite save:conflito', conflitos(B) === 1, 'eventos: ' + B.emit.join(',') || '(nenhum)');
    }
    {   // (2) B recarrega (lê o slot) e depois grava -> permitido
        const arm = new Map();
        const A = novaAba(mapaStorage(arm)), B = novaAba(mapaStorage(arm));
        A.SR.db = null; B.SR.db = null;
        A.SR.write(1, carreira(), false);
        B.SR.reconhecerCarimbo(1);
        A.SR.write(1, carreira(), false);
        const dadosB = carreira(); dadosB.league.rodada = 77;
        B.SR.write(1, dadosB, false);                       // bloqueada
        B.SR.reconhecerCarimbo(1);                          // recarrega o slot
        const ok = B.SR.write(1, dadosB, false);
        rel.t('(2) após recarregar o slot, a aba B grava normalmente',
            !!ok && ok.data.league.rodada === 77 && conflitos(B) === 1);
    }
    {   // (3) save antigo sem carimbo -> grava normal
        const arm = new Map();
        const C = novaAba(mapaStorage(arm)); C.SR.db = null;
        C.SR.reconhecerCarimbo(2);
        const r = C.SR.write(2, carreira(), false);
        rel.t('(3) sem carimbo (save antigo) a gravação é normal e sem aviso',
            !!r && arm.has(C.SR.key(2, false)) && C.emit.length === 0);
    }
    {   // (4) localStorage lançando ou ausente -> grava pelo IndexedDB, sem erro e sem conflito
        const lanca = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
        const E = novaAba(lanca); E.SR.db = dbOk();
        const F = novaAba(undefined); F.SR.db = dbOk();
        let rE = null, errE = false, rF = null, errF = false;
        try { E.SR.reconhecerCarimbo(1); rE = E.SR.write(1, carreira(), false); } catch (e) { errE = true; }
        try { F.SR.reconhecerCarimbo(1); rF = F.SR.write(1, carreira(), false); } catch (e) { errF = true; }
        await E.SR.queue; await F.SR.queue;
        // save:cota é o aviso anterior de cota cheia (localStorage falhou): não é conflito nem erro de gravação.
        const semConflitoNem = aba => !aba.emit.includes('save:conflito') && !aba.emit.includes('save:erro');
        rel.t('(4) localStorage lançando: grava normal (IndexedDB), sem erro nem conflito', !errE && !!rE && semConflitoNem(E),
            'eventos: ' + (E.emit.join(',') || '(nenhum)'));
        rel.t('(4) localStorage ausente: grava normal (IndexedDB), sem erro nem conflito', !errF && !!rF && semConflitoNem(F),
            'eventos: ' + (F.emit.join(',') || '(nenhum)'));
    }
    {   // (5) o aviso sai uma única vez por sessão e por slot
        const arm = new Map();
        const A = novaAba(mapaStorage(arm)), B = novaAba(mapaStorage(arm));
        A.SR.db = null; B.SR.db = null;
        A.SR.write(1, carreira(), false); B.SR.reconhecerCarimbo(1); A.SR.write(1, carreira(), false);
        B.SR.write(1, carreira(), false); B.SR.write(1, carreira(), false); B.SR.write(1, carreira(), false);
        const n1 = conflitos(B);
        A.SR.write(2, carreira(), false); B.SR.reconhecerCarimbo(2); A.SR.write(2, carreira(), false);
        B.SR.write(2, carreira(), false); B.SR.write(2, carreira(), false);
        const n2 = conflitos(B);
        rel.t('(5) aviso uma vez por slot: 3 tentativas no slot 1 geram 1 aviso; slot 2 soma o seu',
            n1 === 1 && n2 === 2, 'avisos: ' + n1 + ' (slot 1) e ' + n2 + ' (total)');
    }
    {   // (6) evento 'storage' de outra aba no slot ativo dispara o aviso; o que não é o slot ativo não
        const arm = new Map();
        const A = novaAba(mapaStorage(arm));
        const B = novaAba(mapaStorage(arm), { app: { slot: 1 } });
        A.SR.db = null; B.SR.db = null;
        A.SR.write(1, carreira(), false);
        B.SR.reconhecerCarimbo(1);
        A.SR.write(1, carreira(), false);                   // outra aba grava depois
        const chave1 = B.SR._carimboKey(1);
        B.SR._onStorage({ key: chave1, newValue: arm.get(chave1) });
        rel.t('(6) evento storage de outra aba, mais novo, no slot ativo dispara o aviso', conflitos(B) === 1);
        // controles: sem aviso se o carimbo é da própria aba, se não é mais novo, se é outro slot ou se foi removido
        const D = novaAba(mapaStorage(arm), { app: { slot: 1 } }); D.SR.db = null;
        D.SR.reconhecerCarimbo(1);
        const suaAba = JSON.stringify({ savedAt: Date.now() + 1e9, aba: D.aba });
        D.SR._onStorage({ key: chave1, newValue: suaAba });
        D.SR._onStorage({ key: chave1, newValue: arm.get(chave1) });
        D.SR._onStorage({ key: D.SR._carimboKey(2), newValue: JSON.stringify({ savedAt: Date.now() + 1e9, aba: 'outra' }) });
        D.SR._onStorage({ key: chave1, newValue: null });
        rel.t('(6) controles: própria aba, carimbo não mais novo, outro slot e remoção não avisam', conflitos(D) === 0);
    }
    {   // (7) ligações no index.html (o trecho do app que o sandbox não executa)
        rel.t('(7) listener de storage ligado ao SaveRepository', /window\.addEventListener\('storage', e => SaveRepository\._onStorage\(e\)\)/.test(src));
        rel.t('(7) aviso de conflito com texto pt-BR em toast warning', /GameState\.on\('save:conflito', \(\) => ui\.showActionFeedback\('Esta carreira foi alterada em outra aba\. Recarregue a página antes de continuar para não perder progresso\.', 'warning'\)\)/.test(src));
        rel.t('(7) saveGame não segue depois de gravação bloqueada', /if \(!SaveRepository\.write\(this\.slot \|\| 1, data\)\) return;/.test(src));
        rel.t('(7) loadSavedData registra o carimbo conhecido do slot', /loadSavedData\(\) \{[\s\S]{0,200}SaveRepository\.reconhecerCarimbo\(slot\)/.test(src));
    }

    encerrar(rel);
})();
