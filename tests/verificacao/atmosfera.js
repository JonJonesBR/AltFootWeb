'use strict';
// tests/verificacao/atmosfera.js — a atmosfera do estádio é função pura, então dá para
// testar sem áudio. Garante que o leito da torcida reage a momento, placar e relógio, e
// que os picos (replay/gol) continuam acima dele.
// Uso: node tests/verificacao/atmosfera.js [caminho/index.html]
const { lerIndex, blocoCom, sandboxComDom, avaliar, exportar, criarRelatorio, encerrar } =
    require('./_lib');

const src = lerIndex(process.argv[2]);
const rel = criarRelatorio('atmosfera do estádio');

const bloco = blocoCom(src, 'const MatchUI = {');
const sb = avaliar(sandboxComDom(), bloco.codigo);
const atmosfera = exportar(sb, 'MatchUI._atmosfera.bind(MatchUI)');

const casos = [
    ['início 0-0, sem momento', { _pressao: 0, gols: [0, 0], minuto: 0 }],
    ['meio 0-0 morno', { _pressao: 0, gols: [0, 0], minuto: 45 }],
    ['fim 0-0 com pressão máxima', { _pressao: 100, gols: [0, 0], minuto: 90 }],
    ['fim 1-0 com pressão máxima', { _pressao: 90, gols: [1, 0], minuto: 88 }],
    ['goleada 3-0 aos 85', { _pressao: 20, gols: [3, 0], minuto: 85 }],
    ['pressão do rival aos 90', { _pressao: -95, gols: [1, 1], minuto: 90 }]
];
const v = {};
for (const [nome, m] of casos) {
    v[nome] = atmosfera(m);
    rel.nota(nome.padEnd(32) + v[nome].toFixed(3));
}

rel.t('sempre dentro de [0,1]',
    casos.every(([, m]) => { const a = atmosfera(m); return a >= 0 && a <= 1; }));
rel.t('fim tenso > início morno',
    v['fim 0-0 com pressão máxima'] > v['início 0-0, sem momento'],
    v['fim 0-0 com pressão máxima'].toFixed(3) + ' vs ' + v['início 0-0, sem momento'].toFixed(3));
rel.t('goleada esfria o estádio',
    v['goleada 3-0 aos 85'] < v['fim 1-0 com pressão máxima'],
    v['goleada 3-0 aos 85'].toFixed(3) + ' vs ' + v['fim 1-0 com pressão máxima'].toFixed(3));
rel.t('pressão do rival também levanta o estádio',
    v['pressão do rival aos 90'] > v['meio 0-0 morno'],
    v['pressão do rival aos 90'].toFixed(3) + ' vs ' + v['meio 0-0 morno'].toFixed(3));
rel.t('robusto a entrada vazia', (() => {
    const a = atmosfera(); return Number.isFinite(a) && a >= 0 && a <= 1;
})());
rel.t('robusto a valores lixo', (() => {
    const a = atmosfera({ _pressao: 'x', gols: null, minuto: null });
    return Number.isFinite(a) && a >= 0 && a <= 1;
})());

// A faixa de volume do leito é derivada da atmosfera; confere os limites e a hierarquia.
{
    const nivel = (a) => Math.max(0.05, Math.min(0.20, 0.055 + a * 0.16));
    let min = Infinity, max = -Infinity;
    for (let p = -100; p <= 100; p += 5) {
        for (let d = 0; d <= 4; d++) {
            for (const minuto of [0, 45, 80, 90]) {
                const lvl = nivel(atmosfera({ _pressao: p, gols: [d, 0], minuto }));
                min = Math.min(min, lvl); max = Math.max(max, lvl);
            }
        }
    }
    rel.t('leito dentro de [0.05, 0.20]', min >= 0.05 && max <= 0.20,
        min.toFixed(3) + ' .. ' + max.toFixed(3));
    rel.t('pico do leito <= pico do replay (0.22)', max <= 0.22, 'max=' + max.toFixed(3));
    rel.t('piso do leito >= 0.05 (sempre audível)', min >= 0.05, 'min=' + min.toFixed(3));
}

encerrar(rel);
