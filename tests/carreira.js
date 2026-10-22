// tests/carreira.js — simulação de CARREIRA com as funções REAIS do jogo (zero-build).
// Uso:
//   node tests/carreira.js                      matriz completa (gestor/passivo × Série A/D × Pro/Lenda, 6 seeds, 10 temporadas)
//   node tests/carreira.js --index <caminho>    usa outro index.html (ex.: baseline do commit 3219978)
//   node tests/carreira.js --run pol div dif seed temps [--index X]   uma carreira (saída JSON)
// Cada carreira chama app.playMatch → confirmarPreparacao → Engine.simulateRound → closeMatchResult,
// CompetitionSystem.play (copa/continental), app.openDraft/escolherDraft, app.acceptOffer,
// app.renovarContrato, app.upgradeInfra e app.startNewSeason. Só o salvamento (IndexedDB) é stub.
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const L = require('./carreira-lib.js');

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let SB_REF = null;
function simular({ pol, div, dif, seed, temps, index }) {
    Math.random = mulberry(seed * 7919 + 13);
    const prestigio = dif >= 1.3 ? 100 : 0;
    const docFalso = {
        getElementById: (id) => id === 'division-select' ? { value: String(div) }
            : id === 'difficulty-select' ? { value: String(dif) } : L.elementoFalsoCarreira(),
        querySelectorAll: () => [], querySelector: () => null, createElement: () => L.elementoFalsoCarreira(),
        addEventListener() {}, body: L.elementoFalsoCarreira()
    };
    const sb = L.novoSandboxCarreira({ index, document: docFalso });
    const { app, Engine, CompetitionSystem, ClubEcosystem, TransferMarket, MetaProgress, Club, PATROCINIOS } = sb;
    SB_REF = sb;
    CLUBES_REF = (lg) => CompetitionSystem.all(lg);
    // Persistência e UI não entram na economia: stubs.
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    // Um jogador real joga o Desafio do Dia e o Clássico ~1 vez por rodada; no harness a data é fixa, então a chave segue a rodada.
    app._dailyChallengeKey = () => (league.temporada || 1) * 1000 + Math.floor((league.rodada || 1) / 5); // 1 desafio a cada 5 rodadas
    app._classicoKey = () => (league.temporada || 1) * 1000 + Math.floor((league.rodada || 1) / 5);
    MetaProgress.ler = () => ({ versao: 1, prestigio, temporadas: 0, titulos: 0, ultimaChave: '', museu: {} });
    MetaProgress.salvar = (d) => d;
    // Medidores (acumuladores da temporada corrente).
    const K = zero();
    let motivo = null;
    const origGate = app.stadiumRevenue;
    app.stadiumRevenue = function () { const v = origGate.call(this); K.gate += v; return v; };
    const origSettle = CompetitionSystem.settle;
    CompetitionSystem.settle = function (league, kind, scores, user) {
        const net = origSettle.call(this, league, kind, scores, user);
        K[kind === 'copa' ? 'copa' : 'conti'] += net || 0; return net;
    };
    const origPremio = ClubEcosystem.premio;
    ClubEcosystem.premio = function (club, v) { const net = origPremio.call(this, club, v); if (club && club.isUser && !K.emCopa) K.liga += net - 0; return net; };
    const origSal = Club.prototype.pagarSalarios;
    Club.prototype.pagarSalarios = function () { const f = origSal.call(this); if (this.isUser) K.sal += f; return f; };
    const origAceitar = app.acceptOffer;
    app.acceptOffer = function (id) { const c0 = this.club.orcamento; const r = origAceitar.call(this, id); const d = this.club.orcamento - c0; if (d > 0) K.ofertas += d; return r; };
    // Clube e liga reais.
    app.createNewClub('Clube Simulado');
    const club = app.club, league = app.league;
    club.patrocinio = { id: PATROCINIOS[0].id, nome: PATROCINIOS[0].nome, tipo: PATROCINIOS[0].tipo, fixo: PATROCINIOS[0].fixo, ativo: true, legado: false, metas: [] };
    const rows = [];
    let demitidoEm = null, falenciaEm = null;
    for (let t = 1; t <= temps; t++) {
      Object.keys(K).forEach(k => K[k] = 0);
      const caixa0 = club.orcamento;
      let minElenco = 99;
      for (let r = 1; r <= 60; r++) {
        if (club.demitido || club.falencia) break;
        if (app._temporadaEncerrada && app._temporadaEncerrada()) break;
        // Desafios disponíveis (diário, clássico, torneio): o jogador disputa quando o jogo libera.
        if (pol === 'gestor') desafios(app, sb);
        escolherXI(club);
        app._estiloPartida = 'equilibrado'; app._craquePartida = null;
        app._lastInfraAt = 0;
        app.playMatch();
        if (app._preparacaoPendente) { app._preparacaoPendente = false; }
        if (Engine.activeMatch) { /* partida já em curso */ }
        app.confirmarPreparacao();
        sb.drenarTimers();
        if (app._resultadoPendente) { app.closeMatchResult(); sb.drenarTimers(); }
        // Desafios de copa/continental (UI chama CompetitionSystem.play quando vencidos).
        (process.env.SEM_COPA ? [] : ['copa', 'continental']).forEach(kind => {
          try { if (CompetitionSystem.due(league, kind) && folegoMedioXI(club) >= 70) { K.emCopa = true; CompetitionSystem.play(kind); sb.drenarTimers(); K.emCopa = false; } }
          catch (e) { K.emCopa = false; process.stderr.write('ERRO_COPA ' + kind + ' ' + (e && e.message) + '\n'); }
        });
        // Política do gestor (decisões do usuário): ofertas, renovações, infraestrutura, draft.
        if (pol === 'gestor') gestor(app, league, club, sb);
        // Draft (openDraft roda por timer após vitória): escolhe o melhor jogador.
        if (Array.isArray(app._draftOpts) && app._draftOpts.length) escolherDraft(app);
        sb.drenarTimers();
        minElenco = Math.min(minElenco, club.elenco.length);
        if (club.demitido && demitidoEm == null) demitidoEm = t;
        if ((club.demitido || club.falencia) && !motivo) motivo = { tipo: club.demitido ? 'demissao' : 'falencia', temporada: t, rodada: league.rodada, paciencia: Math.round(club.pacienciaDiretoria), caixa: Math.round(club.orcamento / 1000) };
        if (club.falencia && falenciaEm == null) falenciaEm = t;
        if (club.demitido || club.falencia) break;
      }
      const tab = league.getTabela(league.divisaoUser || 1);
      const pos = tab.indexOf(club) + 1;
      const campeaoA = league.getTabela(1)[0] === club;
      const campeaoDiv = tab[0] === club;
      const xi = topXI(club);
      const ai = (CompetitionSystem.clubs(league, league.divisaoUser || 1) || []).filter(c => c !== club).map(topXI);
      const gap = ai.length ? xi - (ai.reduce((s, v) => s + v, 0) / ai.length) : 0;
      rows.push({ t, div: league.divisaoUser || 1, pos, campeaoA, campeaoDiv, caixa0: Math.round(caixa0 / 1000), caixa1: Math.round(club.orcamento / 1000),
        minElenco, elenco: club.elenco.length, gap: +gap.toFixed(1), gate: Math.round(K.gate / 1000), copa: Math.round(K.copa / 1000),
        conti: Math.round(K.conti / 1000), liga: Math.round(K.liga / 1000), ofertas: Math.round(K.ofertas / 1000), sal: Math.round(K.sal / 1000),
        demitido: !!club.demitido, falencia: !!club.falencia,
        folegoXI: Math.round(mediaFolego(top11(club))), folegoIA: Math.round(mediaFolegoIA(league, club)) });
      if (club.demitido || club.falencia) break;
      if (t < temps) {
        // Virada real: startNewSeason exige o resumo de fim de temporada gerado pelo closeMatchResult.
        if (!league.resumoTemporada) break;
        app.startNewSeason();
        sb.drenarTimers();
      }
    }
    return { pol, div, dif, seed, temps, rows, demitidoEm, falenciaEm, motivo };
}

const zero = () => ({ gate: 0, copa: 0, conti: 0, liga: 0, ofertas: 0, sal: 0, emCopa: false });
function top11(c) { return (c.elenco || []).filter(p => !(p.machucado > 0)).slice().sort((a, b) => (b.overall || 0) - (a.overall || 0)).slice(0, 11); }
function mediaFolego(arr) { return arr.length ? arr.reduce((s, p) => s + (p.folego ?? 100), 0) / arr.length : 0; }
function mediaFolegoIA(league, club) { const todos = CLUBES_REF(league).filter(c => c !== club).flatMap(c => c.elenco || []); return mediaFolego(todos); }
let CLUBES_REF = () => [];
function topXI(c) { const o = (c.elenco || []).filter(p => !p.machucado).map(p => p.overall || 0).sort((a, b) => b - a).slice(0, 11); return o.length ? o.reduce((s, v) => s + v, 0) / o.length : 0; }

function gestor(app, league, club, sb) {
  const { TransferMarket } = sb;
  const ordenado = () => club.elenco.slice().sort((a, b) => b.overall - a.overall);
  // Renovação de contratos vencendo (titulares do top 16), se o caixa cobre.
  club.elenco.filter(p => (p.contratoRodadas || 0) <= 3).forEach(p => {
    const q = TransferMarket.contrato(p, true);
    if (ordenado().indexOf(p) < 16 && club.orcamento >= q.preco + 50000) { app.renovarContrato(p.id); }
  });
  // Ofertas: vende só quando sobra elenco e o jogador não é dos 8 melhores.
  (club.ofertas || []).slice().forEach(o => {
    const p = club.elenco.find(x => x.id === o.playerId);
    if (p && club.elenco.length > 14 && ordenado().indexOf(p) >= 11) app.acceptOffer(o.playerId);
  });
  // Infraestrutura: investe quando o caixa cobre 4× o custo (teto de nível 5 vale no jogo).
  // Compra no mercado pela função real (buyPlayer): caixa > 3× o custo e elenco abaixo de 16.
  if (club.elenco.length < 16 && (app.marketPlayers || []).length) {
    const alvo = app.marketPlayers.slice().sort((a, b) => (b.overall || 0) - (a.overall || 0)).find(p => club.orcamento > 3 * TransferMarket.contrato(p, false).preco);
    if (alvo) app.buyPlayer(alvo);
  }
  if (club.orcamento > 4 * app.stadiumCost() && club.estadioNivel < 5) { app._lastInfraAt = 0; app.upgradeInfra('estadio'); }
  if (club.orcamento > 4 * app.baseCost() && club.baseNivel < 5) { app._lastInfraAt = 0; app.upgradeInfra('base'); }
}

function desafios(app, sb) {
  const { Engine } = sb;
  if (Engine.activeMatch) return;
  const tenta = (fn) => { try { fn(); if (app._isDaily || app._isClassico || app._isTorneio) { app._estiloPartida = 'equilibrado'; app.playMatch(); app.confirmarPreparacao(); sb.drenarTimers(); if (app._resultadoPendente) { app.closeMatchResult(); sb.drenarTimers(); } } } catch (e) { app._isDaily = app._isClassico = app._isTorneio = false; } };
  tenta(() => app.playDesafioDia());
  tenta(() => app.playClassicoSemana());
  tenta(() => app.playTorneioFase());
}

// Rodízio de escalação (gestão mínima do técnico): os 11 de maior OVR ajustado ao fôlego, com goleiro.
// Sem isso o auto-escalador do jogo repete sempre os mesmos 11 e o fôlego do elenco vai a zero.
// Copa só entra quando o XI não está esgotado (copa drena fôlego sem recuperação de rodada). Senão a copa fica pendente.
function folegoMedioXI(club) { const xi = (club.elenco || []).filter(p => !(p.machucado > 0)).slice().sort((x, y) => (y.overall || 0) - (x.overall || 0)).slice(0, 11); return xi.length ? xi.reduce((q, p) => q + (p.folego ?? 100), 0) / xi.length : 100; }

function escolherXI(club) {
  // Lote 8: XI AUTOMÁTICO do jogo (escalarTitularesXI sobre o OVR real, respeita formação e lesões).
  // Medido: rodízio por fôlego (rodpos) fez 30 pts/38 rodadas em média contra 38 do automático (4 sementes).
  club.escalacaoXI = null;
}

function escolherDraft(app) {
  const ops = app._draftOpts;
  let best = -1, bestOvr = -1;
  ops.forEach((o, i) => { if (o.tipo === 'jogador' && o.p && o.p.overall > bestOvr) { bestOvr = o.p.overall; best = i; } });
  if (best >= 0) app.escolherDraft(best); else app._draftOpts = null;
}

// ---- Execução por linha de comando ----
const args = process.argv.slice(2);
const idxArg = args.indexOf('--index');
const indexPath = idxArg >= 0 ? args[idxArg + 1] : undefined;

if (args[0] === '--run') {
  const [, pol, div, dif, seed, temps] = args;
  const r = simular({ pol, div: +div, dif: +dif, seed: +seed, temps: +temps, index: indexPath });
  process.stdout.write(JSON.stringify(r));
} else {
  // Matriz: 2 políticas × 2 divisões × 2 dificuldades × 6 seeds, 10 temporadas, 4 em paralelo.
  const pols = ['gestor', 'passivo'], divs = [1, 4], difs = [1, 1.3], seeds = [1, 2, 3, 4, 5, 6], seeds12 = [1,2,3,4,5,6,7,8,9,10,11,12], temps = 10;
  const jobs = [];
  // Lote 8: 12 sementes na Série A Pro do passivo (campo de sobrevivência); 6 nas demais.
  for (const pol of pols) for (const div of divs) for (const dif of difs) { const ss = (pol === 'passivo' && div === 1 && dif === 1) ? seeds12 : seeds; for (const seed of ss) jobs.push({ pol, div, dif, seed }); }
  const resultados = [];
  let i = 0, ativos = 0;
  const concorrencia = 4;
  const proximo = () => {
    while (ativos < concorrencia && i < jobs.length) {
      const j = jobs[i++]; ativos++;
      const a = ['--run', j.pol, String(j.div), String(j.dif), String(j.seed), String(temps)];
      if (indexPath) a.push('--index', indexPath);
      const p = spawn(process.execPath, [__filename, ...a]);
      let out = '';
      p.stdout.on('data', d => out += d);
      p.stderr.on('data', () => {});
      p.on('close', () => { ativos--; try { resultados.push(JSON.parse(out)); } catch (e) { resultados.push({ ...j, erro: true, rows: [] }); } if (resultados.length === jobs.length) imprimir(resultados); else proximo(); });
    }
  };
  proximo();
}

function imprimir(res) {
  const m = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const grupos = {};
  res.forEach(r => { const k = `${r.pol} · ${r.div === 1 ? 'Série A' : 'Série D'} · ${r.dif >= 1.3 ? 'Lenda' : 'Pro'}`; (grupos[k] = grupos[k] || []).push(r); });
  console.log('=== Carreira com funções reais · N seeds por grupo, 10 temporadas ===');
  for (const k of Object.keys(grupos).sort()) {
    const g = grupos[k]; const linhas = g.flatMap(r => r.rows);
    const porT = (t) => linhas.filter(x => x.t === t);
    const cx = (t) => Math.round(m(porT(t).map(x => x.caixa1)) / 1000);
    const demit = g.filter(r => r.demitidoEm != null || r.falenciaEm != null).length;
    const campA = linhas.filter(x => x.campeaoA).length;
    const tot = m(linhas.map(x => x.gate + x.copa + x.conti + x.liga + x.ofertas));
    const pctCC = tot ? (m(linhas.map(x => x.copa + x.conti)) / tot * 100) : 0;
    const minT13 = linhas.filter(x => x.t <= 3);
    const ok11 = minT13.filter(x => x.minElenco >= 11).length;
    const gap = m(linhas.filter(x => x.t >= 4).map(x => x.gap));
    console.log(`${k}`);
    console.log(`  N=${g.length} carreiras · caixa médio fim T1 ${cx(1)} M · T5 ${cx(5)} M · T10 ${cx(10)} M`);
    console.log(`  receita/temp: copa+conti ${pctCC.toFixed(0)}% · gate ${(m(linhas.map(x => x.gate)) ).toFixed(0)}k · liga ${m(linhas.map(x => x.liga)).toFixed(0)}k · ofertas ${m(linhas.map(x => x.ofertas)).toFixed(0)}k · folha ${m(linhas.map(x => x.sal)).toFixed(0)}k`);
    console.log(`  demitido/falência: ${demit}/${g.length} carreiras · campeão da A: ${campA}/${linhas.length} temporadas (${(campA / Math.max(1, linhas.length) * 100).toFixed(0)}%)`);
    const motivos = g.filter(r => r.motivo).map(r => `${r.motivo.tipo} T${r.motivo.temporada} R${r.motivo.rodada} conf${r.motivo.paciencia} caixa${r.motivo.caixa}k`);
    console.log(`  fôlego médio XI ${m(linhas.map(x => x.folegoXI)).toFixed(0)} · fôlego médio IA ${m(linhas.map(x => x.folegoIA)).toFixed(0)} · motivos: ${motivos.slice(0, 4).join(' | ') || '-'}`);
    console.log(`  elenco mínimo T1–T3 ≥11 em ${ok11}/${minT13.length} linhas · gap OVR XI vs IA (T4–T10) ${gap.toFixed(1)}`);
  }
}
