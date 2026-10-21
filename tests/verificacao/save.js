'use strict';
// tests/verificacao/save.js — extrai o SaveRepository REAL do index.html e prova que
// gravação e leitura produzem o mesmo checksum (saves de jogadores continuam válidos),
// que a adulteração segue sendo detectada e que o round-trip funciona.
// Uso: node tests/verificacao/save.js [caminho/index.html]
const vm = require('vm');
const { lerIndex, criarRelatorio, encerrar } = require('./_lib');

const src = lerIndex(process.argv[2]);
const rel = criarRelatorio('SaveRepository');

function recorte(ini, fim) {
    const a = src.indexOf(ini);
    if (a < 0) throw new Error('marcador inicial não encontrado: ' + ini);
    const b = src.indexOf(fim, a);
    if (b < 0) throw new Error('marcador final não encontrado: ' + fim);
    return src.slice(a, b);
}

const codigo = recorte('const SaveRepository = {', "GameState.on('save:erro'");
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

    encerrar(rel);
})();
