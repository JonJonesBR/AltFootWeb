// tests/match-stats.js — bancada estatística do MatchSim (§5 do brief).
// Roda centenas/milhares de partidas com seeds fixas e mede gols, mandos, xG,
// impacto de OVR, formação, estilo, clima, cartas e decisões do técnico.
// Uso: node tests/match-stats.js [--n 400] [--detalhado 120]
'use strict';
const { runMatch, quickSimSeedado, makeTeam } = require('./engine-lib');

const args = process.argv.slice(2);
const argNum = (nome, padrao) => {
    const i = args.indexOf('--' + nome);
    return i >= 0 ? Number(args[i + 1]) : padrao;
};
const N = argNum('n', 400);              // amostras por cenário (quickSim)
const NDET = argNum('detalhado', 120);   // amostras por cenário (partida completa)

function pct(n, total) { return ((n / total) * 100).toFixed(1) + '%'; }
function media(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

function classificar(h, a) { return h > a ? 'H' : h === a ? 'D' : 'A'; }

function agregado(resultados) {
    const t = resultados.length;
    let H = 0, D = 0, A = 0, gols = 0, gh = 0, ga = 0, xgh = 0, xga = 0;
    const placares = {};
    resultados.forEach(r => {
        const k = classificar(r.h, r.a);
        if (k === 'H') H++; else if (k === 'D') D++; else A++;
        gols += r.h + r.a; gh += r.h; ga += r.a;
        xgh += (r.xG && r.xG[0]) || 0; xga += (r.xG && r.xG[1]) || 0;
        const p = r.h + 'x' + r.a;
        placares[p] = (placares[p] || 0) + 1;
    });
    const top = Object.entries(placares).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([p, c]) => p + ' (' + pct(c, t) + ')').join(' ');
    return {
        n: t,
        linha: 'H ' + pct(H, t) + ' · E ' + pct(D, t) + ' · A ' + pct(A, t)
            + ' · gols/jogo ' + (gols / t).toFixed(2) + ' (' + (gh / t).toFixed(2) + '/' + (ga / t).toFixed(2) + ')'
            + (xgh + xga > 0 ? ' · xG ' + (xgh / t).toFixed(2) + '/' + (xga / t).toFixed(2) : '')
            + ' · placares: ' + top,
        H, D, A, gols: gols / t
    };
}

function rodarQuick(cenario, n, base) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const h = makeTeam('Casa', cenario.ovrH == null ? base : cenario.ovrH, { formacao: cenario.formH, mentalidade: cenario.mentalH, jitter: 3 });
        const a = makeTeam('Fora', cenario.ovrA == null ? base : cenario.ovrA, { formacao: cenario.formA, mentalidade: cenario.mentalA, jitter: 3 });
        out.push(quickSimSeedado(h, a, 'seed-' + i));
    }
    return out;
}

function rodarDetalhado(cenario, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const r = runMatch({
            seed: 1000 + i,
            ovrH: cenario.ovrH, ovrA: cenario.ovrA,
            formH: cenario.formH, formA: cenario.formA,
            mentalH: cenario.mentalH, mentalA: cenario.mentalA,
            estilo: cenario.estilo, condicao: cenario.condicao,
            decisao: cenario.decisao, craque: cenario.craque,
            userHome: cenario.userHome !== false,
            startRedUser: cenario.startRedUser || 0,
            startMinute: cenario.startMinute || 0,
            startScore: cenario.startScore || null
        });
        const sim = r.sim;
        out.push({
            h: r.h, a: r.a,
            xG: [Number(sim.xG[0].toFixed(2)), Number(sim.xG[1].toFixed(2))],
            cartoes: sim.cartoes.slice(), expulsos: [sim._expulsos[0], sim._expulsos[1]],
            posse: Math.round(sim.posse), chutes: sim.chutes.slice(),
            decisoes: (sim._decisoes || []).length,
            folegoMedio: media(sim._emCampo[0].map(id => {
                const p = r.home.elenco.find(x => x.id === id); return p ? p.folego : 100;
            }))
        });
    }
    return out;
}

// Times com atributos de elenco controlados (fôlego/moral) para medir o impacto real.
function rodarDetalhadoCustom(optsH, optsA, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const home = makeTeam('Casa', 70, Object.assign({ isUser: true, jitter: 3 }, optsH));
        const away = makeTeam('Fora', 70, Object.assign({ jitter: 3 }, optsA));
        const r = runMatch({ seed: 2000 + i, home, away });
        const sim = r.sim;
        out.push({
            h: r.h, a: r.a,
            xG: [Number(sim.xG[0].toFixed(2)), Number(sim.xG[1].toFixed(2))],
            cartoes: sim.cartoes.slice(), expulsos: [sim._expulsos[0], sim._expulsos[1]],
            posse: Math.round(sim.posse), chutes: sim.chutes.slice(),
            decisoes: (sim._decisoes || []).length
        });
    }
    return out;
}

console.log('=== ALTFOOT ELITE · bancada estatística do MatchSim ===');
console.log('index.html:', require('fs').statSync(require('path').join(__dirname, '..', 'index.html')).size, 'bytes');
console.log('');

// ---------- 1. Baseline simétrica (dois times iguais, ambos IA) ----------
console.log('--- 1. Baseline simétrica (OVR 70 × 70) · quickSim ×' + N);
console.log('   ' + agregado(rodarQuick({}, N, 70)).linha);

// ---------- 2. Impacto de OVR ----------
console.log('--- 2. Impacto de diferença de OVR · quickSim ×' + N + ' por faixa');
[[0, 70, 70], [3, 73, 70], [6, 76, 70], [10, 80, 70], [15, 85, 70], [25, 95, 70]].forEach(([dif, oH, oA]) => {
    const r = agregado(rodarQuick({ ovrH: oH, ovrA: oA }, N, 70));
    console.log('   ΔOVR ' + String(dif).padStart(2) + ' (' + oH + '×' + oA + '): ' + r.linha);
});

// ---------- 3. Mando ----------
console.log('--- 3. Mando · quickSim ×' + N + ' (mesma força; quickSim não distingue mando — conferir no detalhado)');

// ---------- 4. Estilos do usuário (partida detalhada, usuário em casa) ----------
console.log('--- 4. Estilo do técnico · detalhado ×' + NDET);
['equilibrado', 'ofensivo', 'retranca'].forEach(estilo => {
    const rs = rodarDetalhado({ estilo }, NDET);
    const ag = agregado(rs);
    console.log('   ' + estilo.padEnd(11) + ': ' + ag.linha
        + ' · posse ' + Math.round(media(rs.map(r => r.posse))) + '%'
        + ' · cartões ' + media(rs.map(r => r.cartoes[0] + r.cartoes[1])).toFixed(1)
        + ' · expulsões ' + media(rs.map(r => r.expulsos[0] + r.expulsos[1])).toFixed(2));
});

// ---------- 5. Formações ----------
console.log('--- 5. Formações (usuário) · detalhado ×' + NDET);
['4-4-2', '4-3-3', '3-5-2', '5-3-2'].forEach(form => {
    const rs = rodarDetalhado({ formH: form }, NDET);
    console.log('   ' + form + '   : ' + agregado(rs).linha);
});

// ---------- 6. Clima ----------
console.log('--- 6. Condição de campo · detalhado ×' + NDET);
['normal', 'sol', 'chuva', 'lama'].forEach(condicao => {
    const rs = rodarDetalhado({ condicao }, NDET);
    console.log('   ' + condicao.padEnd(7) + ' : ' + agregado(rs).linha);
});

// ---------- 7. Craque emprestado ----------
console.log('--- 7. Craque da Rodada · detalhado ×' + NDET);
{
    const sem = rodarDetalhado({}, NDET);
    const com = rodarDetalhado({ craque: { nome: 'Craque', overall: 90 } }, NDET);
    console.log('   sem craque : ' + agregado(sem).linha);
    console.log('   com craque : ' + agregado(com).linha);
}

// ---------- 8. Decisões do técnico (política automática) ----------
console.log('--- 8. Decisões do técnico · detalhado ×' + NDET);
{
    // "melhor percentual" = o que um jogador atento escolhe lendo o hint
    // (ataque: maior chance de gol; defesa: menor risco de sofrer).
    const politicaMelhor = ({ opts }) => {
        const risco = /risco/i.test((opts && opts[0] && opts[0].hint) || '');
        const ps = (opts || []).map(o => Number(o.eff && o.eff.p) || 0);
        let idx = 0;
        ps.forEach((p, i) => { if (risco ? p < ps[idx] : p > ps[idx]) idx = i; });
        return idx;
    };
    const politicaPior = ({ opts }) => {
        const risco = /risco/i.test((opts && opts[0] && opts[0].hint) || '');
        const ps = (opts || []).map(o => Number(o.eff && o.eff.p) || 0);
        let idx = 0;
        ps.forEach((p, i) => { if (risco ? p > ps[idx] : p < ps[idx]) idx = i; });
        return idx;
    };
    const casos = [
        ['ler o contexto (melhor %)', politicaMelhor],
        ['opção central (assistente)', 1],
        ['contrário ao contexto', politicaPior],
        ['opção 0 sempre', 0],
        ['opção 2 sempre', 2]
    ];
    casos.forEach(([nome, pol]) => {
        const rs = rodarDetalhado({ decisao: pol }, NDET);
        console.log('   ' + nome.padEnd(30) + ': ' + agregado(rs).linha
            + ' · xG usuário ' + media(rs.map(r => r.xG[0])).toFixed(2));
    });
}

// ---------- 9. Dificuldade (força do rival multiplicada) ----------
console.log('--- 9. Força do rival (OVR adversário) · detalhado ×' + NDET);
[[60, 70], [70, 70], [80, 70]].forEach(([oA, oH]) => {
    const rs = rodarDetalhado({ ovrH: oH, ovrA: oA }, NDET);
    console.log('   rival OVR ' + oA + ' : ' + agregado(rs).linha);
});

// ---------- 10. Expulsão / fôlego / moral ----------
console.log('--- 10. Expulsão do usuário desde o início · detalhado ×' + NDET);
{
    const base = rodarDetalhado({}, NDET);
    console.log('   11 × 11                 : ' + agregado(base).linha);
    const comVermelho = rodarDetalhado({ startRedUser: 1 }, NDET);
    console.log('   usuário com 1 a menos   : ' + agregado(comVermelho).linha);
}
console.log('--- 11. Fôlego e moral do time do usuário · detalhado ×' + NDET);
{
    const cenarioEquipes = (optsH, optsA) => rodarDetalhadoCustom(optsH, optsA, NDET);
    const fresco = cenarioEquipes({ folego: 100, moral: 70 }, { folego: 100, moral: 70 });
    console.log('   fôlego 100 × 100 : ' + agregado(fresco).linha);
    const pego = cenarioEquipes({ folego: 45, moral: 70 }, { folego: 100, moral: 70 });
    console.log('   fôlego  45 × 100 : ' + agregado(pego).linha);
    const unido = cenarioEquipes({ folego: 100, moral: 92 }, { folego: 100, moral: 70 });
    console.log('   moral   92 ×  70 : ' + agregado(unido).linha);
    const bravo = cenarioEquipes({ folego: 100, moral: 22 }, { folego: 100, moral: 70 });
    console.log('   moral   22 ×  70 : ' + agregado(bravo).linha);
}

// ---------- 12. Reprodutibilidade (mesma seed = mesmo resultado) ----------
{
    const a = runMatch({ seed: 4242 });
    const b = runMatch({ seed: 4242 });
    const igual = a.h === b.h && a.a === b.a && JSON.stringify(a.sim.xG.map(x => x.toFixed(4))) === JSON.stringify(b.sim.xG.map(x => x.toFixed(4)));
    console.log('--- 12. Determinismo: mesma seed 4242 → ' + (igual ? 'IDÊNTICO ✔' : 'DIVERGENTE ✘') + ' (' + a.h + 'x' + a.a + ' / ' + b.h + 'x' + b.a + ')');
}

console.log('');
console.log('=== fim da bancada ===');
