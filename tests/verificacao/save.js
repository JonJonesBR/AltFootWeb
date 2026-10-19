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

encerrar(rel);
