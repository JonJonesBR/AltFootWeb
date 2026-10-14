'use strict';
// tests/verificacao/_lib.js — utilidades compartilhadas da bancada de verificação.
// Zero build, só Node (como o resto de tests/).
//
// Uso típico num harness:
//     const { lerIndex, blocosDeScript, sandboxComDom, criarRelatorio, encerrar } = require('./_lib');
//     const src = lerIndex();
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const INDEX_PADRAO = path.join(RAIZ, 'index.html');

// Caminho do index.html: 1º argumento, ou a variável de ambiente, ou o padrão do repo.
// Sai com código 3 quando o arquivo não é utilizável: isso é erro de INFRAESTRUTURA
// (harness não conseguiu rodar) e o runner da bancada precisa distingui-lo de uma
// verificação que simplesmente falhou (código 1).
function lerIndex(caminho) {
    const alvo = caminho || process.env.ALTFOOT_INDEX || INDEX_PADRAO;
    if (!fs.existsSync(alvo)) {
        console.error('ERRO DE INFRAESTRUTURA: index.html não encontrado em: ' + alvo);
        process.exit(3);
    }
    const conteudo = fs.readFileSync(alvo, 'utf8');
    if (!conteudo.includes('<html')) {
        console.error('ERRO DE INFRAESTRUTURA: ' + alvo + ' não parece ser o index.html do jogo');
        process.exit(3);
    }
    return conteudo.replace(/\r\n/g, '\n');
}

// Blocos <script> inline (ignora os que têm src). Devolve [{indice, linhaInicial, codigo}].
function blocosDeScript(src) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const out = [];
    let m, i = 0;
    while ((m = re.exec(src))) {
        const attrs = m[1] || '';
        const indice = i++;
        if (/\bsrc\s*=/.test(attrs)) continue;
        out.push({
            indice,
            linhaInicial: src.slice(0, m.index).split('\n').length,
            codigo: m[2]
        });
    }
    return out;
}

// Bloco de script que contém um marcador (ex.: a definição do MatchUI).
function blocoCom(src, marcador) {
    const achado = blocosDeScript(src).find(b => b.codigo.includes(marcador));
    if (!achado) throw new Error('nenhum bloco <script> contém: ' + marcador);
    return achado;
}

// Remove comentários de CSS/JS antes de casar texto — comentários explicativos citam
// nomes de APIs e gerariam falso positivo.
function semComentarios(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

// Recorta o conteúdo do bloco <style> (sem comentários).
function estiloDo(src) {
    const a = src.indexOf('<style>');
    const b = src.indexOf('</style>', a);
    if (a < 0 || b < 0) throw new Error('bloco <style> não encontrado');
    return semComentarios(src.slice(a, b));
}

// Stub de DOM/browser suficiente para AVALIAR os blocos do jogo (declarar classes) e
// chamar funções puras. Não simula layout nem áudio de verdade.
function sandboxComDom() {
    const noop = () => { };
    const elStub = () => ({
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        style: { setProperty: noop }, dataset: {}, children: [],
        addEventListener: noop, removeEventListener: noop, appendChild: noop,
        removeChild: noop, insertBefore: noop, prepend: noop,
        querySelector: () => null, querySelectorAll: () => [], getContext: () => null,
        setAttribute: noop, getAttribute: () => null, closest: () => null,
        getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
        textContent: '', innerHTML: '', value: '50'
    });
    const sb = {
        console, JSON, Math, Date, Number, String, Array, Object, Error, Promise, RegExp,
        Boolean, Map, Set, WeakMap, Symbol, parseInt, parseFloat, isNaN, isFinite, encodeURI,
        setTimeout, clearTimeout, setInterval, clearInterval,
        requestAnimationFrame: noop, cancelAnimationFrame: noop,
        document: {
            body: elStub(), documentElement: elStub(), hidden: false, visibilityState: 'visible',
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            createElement: elStub, createTextNode: () => ({}), addEventListener: noop,
            removeEventListener: noop, readyState: 'complete', getAnimations: () => []
        },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'node' }, location: { href: 'http://localhost/' },
        indexedDB: undefined,
        MutationObserver: class { observe() { } disconnect() { } takeRecords() { return []; } },
        Event: class { constructor(t) { this.type = t; } },
        CustomEvent: class { constructor(t) { this.type = t; } },
        Audio: class { constructor() { } addEventListener() { } removeEventListener() { } play() { return Promise.resolve(); } pause() { } },
        Image: class { }, Blob: class { }, URL: { createObjectURL: () => '', revokeObjectURL: noop },
        matchMedia: () => ({ matches: false, addEventListener: noop, removeListener: noop, addListener: noop }),
        performance: { now: () => 0 },
        scrollTo: noop, getComputedStyle: () => ({ getPropertyValue: () => '' })
    };
    sb.window = sb;
    sb.globalThis = sb;
    sb.addEventListener = noop;
    sb.removeEventListener = noop;
    sb.dispatchEvent = () => true;
    return sb;
}

// Roda um bloco de script no sandbox e devolve o contexto.
function avaliar(sandbox, codigo) {
    if (!sandbox.__contexto) vm.createContext(sandbox);
    sandbox.__contexto = true;
    vm.runInContext(codigo, sandbox);
    return sandbox;
}

// Exporta um binding léxico (const/class de dentro do bloco) para o mundo do Node.
// `const MatchUI` NÃO vira propriedade do sandbox — precisa ser resolvido por dentro.
function exportar(sandbox, expr) {
    vm.runInContext(`globalThis.__exportado = ${expr};`, sandbox);
    return sandbox.__exportado;
}

// Contador de verificações com saída legível.
function criarRelatorio(titulo) {
    let ok = 0, falhas = 0;
    const linhas = [];
    if (titulo) linhas.push('=== ' + titulo + ' ===');
    return {
        get ok() { return ok; },
        get falhas() { return falhas; },
        t(nome, cond, extra) {
            if (cond) { ok++; linhas.push('  ✔ ' + nome); }
            else { falhas++; linhas.push('  ✘ ' + nome + (extra ? ' -> ' + extra : '')); }
        },
        imprimir() { console.log(linhas.join('\n')); },
        resumo() { return `${ok}/${ok + falhas} verificações passaram`; },
        // Anota informação sem contar verificação.
        nota(msg) { linhas.push('    ' + msg); }
    };
}

// Imprime, define o exit code e encerra.
function encerrar(rel) {
    rel.imprimir();
    console.log('');
    console.log('=== ' + rel.resumo() + ' ===');
    process.exit(rel.falhas === 0 ? 0 : 1);
}

module.exports = {
    RAIZ, INDEX_PADRAO, lerIndex, blocosDeScript, blocoCom, semComentarios, estiloDo,
    sandboxComDom, avaliar, exportar, criarRelatorio, encerrar
};
