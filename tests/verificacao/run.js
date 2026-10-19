'use strict';
// tests/verificacao/run.js — roda a bancada de VERIFICAÇÃO (complementa tests/run.js,
// que cobre as regressões do motor). Cada harness é independente e imprime o próprio
// resumo; aqui eles são reunidos num resultado único para o gate da rodada.
//
// Uso:
//   node tests/verificacao/run.js                 # todos
//   node tests/verificacao/run.js audio atmosfera # só alguns
//   node tests/verificacao/run.js --index outro/index.html
//
// Códigos de saída: 0 = tudo passou, 1 = alguma verificação falhou,
//                   2 = erro de infraestrutura (harness não pôde rodar).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HARNESSES = ['audio', 'a11y', 'atmosfera', 'visual', 'save', 'temporada', 'workflow'];

const args = process.argv.slice(2);
let indexCustom = null;
const filtros = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--index') { indexCustom = args[++i]; continue; }
    filtros.push(args[i]);
}

const alvos = filtros.length ? HARNESSES.filter(h => filtros.includes(h)) : HARNESSES.slice();
if (!alvos.length) {
    console.error('nenhum harness corresponde a: ' + filtros.join(', '));
    console.error('disponíveis: ' + HARNESSES.join(', '));
    process.exit(2);
}

const soH = [];
const resumo = [];
let falhas = 0, infra = 0;

console.log('=== AltFoot ELITE · bancada de verificação ===');
console.log('index: ' + (indexCustom || 'index.html (padrão do repo)'));
console.log('');

for (const nome of alvos) {
    const arquivo = path.join(__dirname, nome + '.js');
    if (!fs.existsSync(arquivo)) {
        console.log(`--- ${nome}: AUSENTE (${arquivo})`);
        infra++;
        resumo.push({ nome, estado: 'AUSENTE', detalhe: '' });
        continue;
    }
    const argv = [arquivo];
    // Só os harnesses que leem o index aceitam o caminho; workflow não usa.
    if (indexCustom && nome !== 'workflow') argv.push(indexCustom);

    const r = spawnSync(process.execPath, argv, { encoding: 'utf8' });
    const saida = (r.stdout || '') + (r.stderr || '');
    // Repassa a saída do harness, indentada sob um cabeçalho.
    for (const linha of saida.split('\n')) {
        if (linha.trim()) console.log('  ' + linha);
    }
    console.log('');

    const m = saida.match(/=== (\d+)\/(\d+) verificações passaram ===/);
    if (r.status === 0 && m) {
        // Rodou e passou.
        resumo.push({ nome, estado: 'PASS', detalhe: `${m[1]}/${m[2]}` });
    } else if (r.status === 1 && m) {
        // Rodou e encontrou verificação falhando (o harness imprimiu o resumo).
        falhas++;
        resumo.push({ nome, estado: 'FAIL', detalhe: `${m[1]}/${m[2]}` });
    } else {
        // Não chegou a rodar (arquivo ausente, index inválido, exceção): infraestrutura.
        // O harness usa código 3 para isso; qualquer saída sem resumo cai aqui também.
        infra++;
        const motivo = r.status === null ? 'não iniciou' : 'exit ' + r.status;
        resumo.push({ nome, estado: 'ERRO', detalhe: motivo });
    }
}

console.log('--- resumo da bancada de verificação ---');
for (const r of resumo) {
    const marca = r.estado === 'PASS' ? '✔' : (r.estado === 'FAIL' ? '✘' : '!');
    console.log(`  ${marca} ${r.nome.padEnd(12)} ${r.estado.padEnd(7)} ${r.detalhe}`);
}
console.log('');

if (infra) {
    console.log(`RESULTADO: ${infra} harness(es) não puderam rodar`);
    process.exit(2);
}
if (falhas) {
    console.log(`RESULTADO: ${falhas} harness(es) com falha`);
    process.exit(1);
}
console.log(`RESULTADO: bancada de verificação inteira verde (${resumo.length} harnesses)`);
process.exit(0);
