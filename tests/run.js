// tests/run.js — regressões zero-build do AltFoot ELITE (node tests/run.js).
// Cobrem os contratos que a rodada de evolução de 2026-10-06 fixou:
// XP por participação, partidas/vestiário por participação, determinismo do
// quickSim, consistência rápido × detalhado, calendário/tabela, save roundtrip,
// mercado da IA por necessidade e invariantes do motor (fôlego/moral/decisões).
// Sem dependências: só Node. Nada aqui é carregado pelo index.html do jogo.
'use strict';
const { novoSandbox, makeTeam, makePlayer, runMatch, quickSimSeedado } = require('./engine-lib');

let total = 0, falhas = 0;
function teste(nome, fn) {
    total++;
    try {
        fn();
        console.log('  ✔ ' + nome);
    } catch (e) {
        falhas++;
        console.log('  ✘ ' + nome);
        console.log('      ' + (e && e.message ? e.message : e));
    }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'asserção falhou'); }
function perto(a, b, tolerancia, msg) {
    if (Math.abs(a - b) > tolerancia) throw new Error((msg || 'valores distantes') + ': ' + a + ' vs ' + b + ' (tol ' + tolerancia + ')');
}
const sb = novoSandbox();
const { calcularXPParticipacao, fecharPartidaElenco, LockerRoom, ClubEcosystem, Club, League,
    TransferMarket, Player, Engine, CompetitionSystem } = sb;

console.log('=== AltFoot ELITE · regressões (tests/run.js) ===');

// ---------------------------------------------------------------- XP por participação
console.log('-- XP por participação (§10)');
teste('titular leva xpBase, entrada 55%, banco 20%, lesionado 0', () => {
    const elenco = [
        makePlayer('t1', 'MID', 70), makePlayer('t2', 'ATT', 70),
        makePlayer('b1', 'DEF', 70), makePlayer('b2', 'GK', 70),
        makePlayer('l1', 'DEF', 70)
    ];
    elenco[4].machucado = true;
    const tab = calcularXPParticipacao(elenco, ['t1', 't2'], ['b1'], 100, []);
    ok(tab.t1 === 100 && tab.t2 === 100, 'titulares: ' + tab.t1 + '/' + tab.t2);
    ok(tab.b1 === 55, 'entrada deveria ser 55, veio ' + tab.b1);
    ok(tab.b2 === 20, 'banco deveria ser 20, veio ' + tab.b2);
    ok(tab.l1 === 0, 'lesionado deveria ser 0, veio ' + tab.l1);
});
teste('foraIds zera quem está afastado', () => {
    const elenco = [makePlayer('a', 'DEF', 70)];
    const tab = calcularXPParticipacao(elenco, [], [], 60, ['a']);
    ok(tab.a === 0, 'afastado ganhou XP: ' + tab.a);
});

// ------------------------------------------------------- partidas/moral por participação
console.log('-- Fecho de elenco: partidas e moral por participação (P0)');
teste('só quem jogou soma partida; banco não infla tier/hierarquia', () => {
    const clube = new Club(null);
    for (let i = 0; i < 14; i++) clube.elenco.push(new Player(i < 11 ? 'MID' : 'DEF'));
    clube.elenco.forEach(p => { p.partidas = 14; p.salario = 999999; });
    const titulares = clube.elenco.slice(0, 11).map(p => p.id);
    fecharPartidaElenco(clube, titulares, 2);
    ok(clube.elenco.slice(0, 11).every(p => p.partidas === 15), 'titulares deveriam ter 15 partidas');
    ok(clube.elenco.slice(11).every(p => p.partidas === 14), 'banco não deveria somar partida');
    // A hierarquia do vestiário usa partidas: com contagem real, banco ≠ líder.
    ok(LockerRoom.hierarquia(clube, clube.elenco[11]) !== 'Líder de Vestiário', 'banco virou líder de novo');
});
teste('moral: titular sente o resultado cheio, banco pela metade; sempre 0-100', () => {
    const clube = new Club(null);
    for (let i = 0; i < 12; i++) clube.elenco.push(new Player('MID'));
    clube.elenco.forEach(p => { p.moral = 50; p.salario = 999999; });
    fecharPartidaElenco(clube, clube.elenco.slice(0, 11).map(p => p.id), -2);
    ok(clube.elenco[0].moral === 48, 'titular com -2 deveria cair a 48, veio ' + clube.elenco[0].moral);
    ok(clube.elenco[11].moral === 49, 'banco com -2 deveria cair a 49, veio ' + clube.elenco[11].moral);
    for (let r = 0; r < 60; r++) fecharPartidaElenco(clube, [], -2);
    ok(clube.elenco.every(p => p.moral >= 0 && p.moral <= 100), 'moral fora de 0-100');
    ok(clube.elenco[11].moral === 0, 'banco deveria estabilizar no piso 0, veio ' + clube.elenco[11].moral);
});
teste('contratos só expiram quando chegam a 0', () => {
    const clube = new Club(null);
    const p = new Player('DEF'); p.contratoRodadas = 1; clube.elenco.push(p);
    const exp = fecharPartidaElenco(clube, [p.id], 0);
    ok(exp.length === 1 && exp[0] === p, 'deveria expirar 1 contrato');
    ok(p.contratoRodadas === 0, 'contrato deveria estar em 0');
});

// ------------------------------------------------------------------ vestiário sem espiral
console.log('-- Vestiário: sem punição em massa (P0)');
teste('líder que jogou NÃO é barrado; barrado perde moral', () => {
    const clube = new Club(null);
    const lider = new Player('MID'); lider.partidas = 20; lider.idade = 30; lider.moral = 70;
    const reserva = new Player('DEF'); reserva.partidas = 20; reserva.idade = 30; reserva.moral = 70;
    clube.elenco.push(lider, reserva);
    clube.moral = 75;
    LockerRoom.afterRound(clube, { temporada: 1, rodada: 1, adicionarNoticia() {} }, [lider.id], true);
    ok(lider.moral === 69, 'líder que jogou só deveria sentir o contágio (-1), veio ' + lider.moral);
    ok(reserva.moral === 65, 'líder barrado deveria cair a 65 (−4 barrado, −1 contágio), veio ' + reserva.moral);
});
teste('16 rodadas com participação coerente não derrubam a moral a zero', () => {
    const clube = new Club(null);
    for (let i = 0; i < 16; i++) {
        const p = new Player('MID'); p.moral = 75; p.salario = 999999;
        clube.elenco.push(p);
    }
    clube.moral = 75;
    const liga = { temporada: 1, rodada: 1, adicionarNoticia() {} };
    for (let r = 0; r < 16; r++) {
        liga.rodada = r + 1;
        const titulares = clube.elenco.slice(0, 11).map(p => p.id);
        fecharPartidaElenco(clube, titulares, 2);
        LockerRoom.afterRound(clube, liga, titulares, true);
    }
    const moralTitular = clube.elenco[0].moral;
    ok(moralTitular > 30, 'espiral de moral: titular caiu para ' + moralTitular);
});

// ------------------------------------------------------------------ determinismo (§20)
console.log('-- Determinismo do motor (§20)');
teste('quickSim: mesma seed → mesmo placar e mesma artilharia', () => {
    const a = makeTeam('Azul', 70), b = makeTeam('Verde', 70);
    const r1 = quickSimSeedado(a, b, 'fixa');
    const r2 = quickSimSeedado(a, b, 'fixa');
    ok(r1.h === r2.h && r1.a === r2.a, 'placar divergiu: ' + r1.h + 'x' + r1.a + ' vs ' + r2.h + 'x' + r2.a);
    const s1 = novoSandbox(), s2 = novoSandbox();
    const t1 = makeTeam('Azul', 70), t2 = makeTeam('Verde', 70);
    const q1 = s1.Engine.quickSim(t1, t2, 'fixa');
    const q2 = s2.Engine.quickSim(t1, t2, 'fixa');
    s1.Engine._quickMarcar(t1.elenco, q1.h, q1.rng);
    s2.Engine._quickMarcar(t2.elenco, q2.h, q2.rng);
    const gols1 = t1.elenco.map(p => p.gols).join(',');
    const gols2 = t2.elenco.map(p => p.gols).join(',');
    ok(gols1 === gols2, 'artilharia divergiu entre execuções');
});
teste('partida detalhada: mesma seed → mesmo placar/xG', () => {
    const r1 = runMatch({ seed: 777 });
    const r2 = runMatch({ seed: 777 });
    ok(r1.h === r2.h && r1.a === r2.a, 'placar divergiu');
    perto(r1.sim.xG[0], r2.sim.xG[0], 1e-9, 'xG divergiu');
});

// ---------------------------------------------------- consistência rápido × detalhado (§19)
console.log('-- Consistência quickSim × partida detalhada (§19)');
teste('gols/jogo do rápido e do detalhado na mesma faixa (±28%)', () => {
    const n = 150;
    let gRap = 0, gDet = 0;
    for (let i = 0; i < n; i++) {
        const a = makeTeam('Casa', 70, { jitter: 3 }), b = makeTeam('Fora', 70, { jitter: 3 });
        const q = quickSimSeedado(a, b, 'cons-' + i);
        gRap += q.h + q.a;
        const d = runMatch({
            seed: 3000 + i,
            home: makeTeam('Casa', 70, { isUser: true, jitter: 3 }),
            away: makeTeam('Fora', 70, { jitter: 3 })
        });
        gDet += d.h + d.a;
    }
    const mRap = gRap / n, mDet = gDet / n;
    const rel = Math.abs(mRap - mDet) / Math.max(mRap, mDet);
    ok(rel <= 0.28, 'quickSim ' + mRap.toFixed(2) + ' × detalhado ' + mDet.toFixed(2) + ' (rel ' + (rel * 100).toFixed(1) + '%)');
});

// ------------------------------------------------------------------ calendário e tabela (§18)
console.log('-- Calendário, tabela e contratos de temporada (§18)');
teste('round-robin: 2×(N−1) rodadas, 10 jogos por rodada, sem clube duplicado', () => {
    const liga = new League();
    liga.inicializar();
    const totalRodadas = liga.getTotalRounds();
    ok(totalRodadas === 38, 'Série A deveria ter 38 rodadas, tem ' + totalRodadas);
    for (let r = 1; r <= totalRodadas; r++) {
        const fx = liga.getFixturesForRound(r, 1);
        ok(fx.length === 10, 'rodada ' + r + ' com ' + fx.length + ' jogos');
        const vistos = new Set();
        fx.forEach(([h, a]) => {
            ok(!vistos.has(h) && !vistos.has(a), 'clube jogando duas vezes na rodada ' + r);
            vistos.add(h); vistos.add(a);
            ok(h !== a, 'clube contra si mesmo na rodada ' + r);
        });
    }
});
teste('returno inverte o mando de todos os confrontos', () => {
    const liga = new League();
    liga.inicializar();
    const totalRodadas = liga.getTotalRounds();
    const ida = liga.getFixturesForRound(1, 1);
    // A volta é a ida com mandos invertidos em ordem reversa: o espelho da
    // rodada 1 é a ÚLTIMA rodada (rounds.concat(volta.reverse())).
    const volta = liga.getFixturesForRound(totalRodadas, 1);
    ida.forEach(([h, a]) => {
        ok(volta.some(([h2, a2]) => h2 === a && a2 === h), 'mando não invertido para ' + h + '×' + a);
    });
});
teste('tabela ordena por pontos e saldo de gols', () => {
    const liga = new League();
    liga.inicializar();
    const clubes = liga.getClubesAtuais();
    clubes[0].registrarResultado(3, 0);
    clubes[1].registrarResultado(1, 0);
    clubes[2].registrarResultado(0, 0);
    const t = liga.getTabela(1);
    ok(t[0] === clubes[0], 'líder deveria ser o clube com 3 pontos');
    ok(t[1] === clubes[1], 'segundo deveria ser o clube com 1 ponto e saldo +1');
    ok(t[2] === clubes[2], 'terceiro deveria ser o clube com 1 ponto e saldo 0');
    ok(clubes[0].pontos === 3 && clubes[0].golsPro === 3, 'registrarResultado não gravou os números');
});

// ------------------------------------------------------------------ save roundtrip (§27)
console.log('-- Save roundtrip (§27)');
teste('Player serializado e restaurado (Object.assign) mantém o comportamento', () => {
    const p = new Player('ATT');
    p.overall = 62; p.moral = 80; p.folego = 55; p.partidas = 7;
    const raw = JSON.parse(JSON.stringify(p));
    const restaurado = Object.assign(new Player(), raw);
    ok(restaurado.nome === p.nome && restaurado.overall === 62 && restaurado.folego === 55, 'campos não sobreviveram');
    restaurado.ganharXP(120);
    ok(restaurado.xp >= 0, 'ganharXP quebrou após restauração');
    ok(typeof restaurado.ovrEfetivo === 'function', 'métodos da classe perdidos na restauração');
});
teste('contratos: assinar debita caixa e define salário/prazo; liquidarVenda devolve', () => {
    const clube = new Club(null);
    clube.orcamento = 2000000;
    const p = new Player('DEF');
    const antes = clube.orcamento;
    const r = TransferMarket.assinar(clube, p);
    ok(r.ok, 'assinar falhou: ' + (r.mensagem || ''));
    ok(clube.orcamento < antes, 'caixa não debitado');
    ok(p.contratoRodadas > 0 && p.salario > 0, 'contrato não definido');
    const elencoAntes = clube.elenco.length;
    clube.vender(p.id);
    ok(clube.elenco.length === elencoAntes - 1, 'venda não removeu do elenco');
    ok(clube.orcamento > 0, 'venda não creditou');
});

// ------------------------------------------------------------------ mercado da IA (§12)
console.log('-- Mercado da IA por necessidade (§12)');
function ligaDeTeste() {
    const liga = new League();
    liga.inicializar();
    liga.temporada = 1;
    return liga;
}
function isolar(liga, alvo) {
    // Só o clube-alvo negocia: os demais ficam bloqueados para o teste não poluir.
    CompetitionSystem.all(liga).forEach(c => { c.bloqueioContratacoes = true; });
    alvo.bloqueioContratacoes = false;
    alvo.isUser = false;
}
teste('clube sem goleiro compra goleiro, não o maior OVR', () => {
    const s = novoSandbox();
    const liga = ligaDeTeste();
    const alvo = CompetitionSystem.clubs(liga, 1)[1];
    isolar(liga, alvo);
    alvo.orcamento = 3000000;
    alvo.elenco = alvo.elenco.filter(p => p.posicao !== 'GK');
    alvo.elenco.forEach(p => { p.salario = 1000; });
    s.app.marketPlayers = [makePlayer('star', 'ATT', 90), makePlayer('gk', 'GK', 55)];
    s.app.marketPlayers.forEach(p => { p.valor = 100000; p.salario = 1000; p.contratoRodadas = 20; });
    for (let tent = 0; tent < 12; tent++) {
        liga.rodada = 3 + tent;
        s.Engine.processAITransfers(liga);
    }
    ok(alvo.elenco.some(p => p.id === 'gk'), 'clube sem goleiro não priorizou goleiro (plantão: '
        + alvo.elenco.map(p => p.posicao).join(',') + ')');
});
teste('clube sem caixa para folha não contrata', () => {
    const s = novoSandbox();
    const liga = ligaDeTeste();
    const alvo = CompetitionSystem.clubs(liga, 1)[2];
    isolar(liga, alvo);
    alvo.orcamento = 50000;
    alvo.elenco.forEach(p => { p.salario = 40000; }); // folha alta → reserva obrigatória
    s.app.marketPlayers = [makePlayer('caro', 'ATT', 90)];
    s.app.marketPlayers.forEach(p => { p.valor = 10000; p.salario = 5000; p.contratoRodadas = 20; });
    const antes = alvo.elenco.length;
    for (let tent = 0; tent < 12; tent++) {
        liga.rodada = 3 + tent;
        s.Engine.processAITransfers(liga);
    }
    ok(alvo.elenco.length === antes, 'clube sem caixa contratou mesmo assim');
});
teste('elenco gigante vende o mais fraco da linha folgada — nunca o único goleiro', () => {
    const s = novoSandbox();
    const liga = ligaDeTeste();
    const alvo = CompetitionSystem.clubs(liga, 1)[3];
    isolar(liga, alvo);
    alvo.orcamento = 100000;
    while (alvo.elenco.length < 20) {
        alvo.elenco.push(makePlayer('extra' + alvo.elenco.length, 'MID', 50 + (alvo.elenco.length % 7)));
    }
    alvo.elenco.forEach(p => { p.salario = 1000; p.potencial = null; });
    alvo.elenco[alvo.elenco.length - 1].overall = 30; // o mais fraco é um meio-campista
    const gksAntes = alvo.elenco.filter(p => p.posicao === 'GK').length;
    const antes = alvo.elenco.length;
    s.app.marketPlayers = [];
    s.Engine.processAITransfers(liga);
    ok(alvo.elenco.length === antes - 1, 'elenco de ' + antes + ' não vendeu ninguém');
    ok(alvo.elenco.every(p => p.overall !== 30), 'não vendeu o mais fraco');
    ok(alvo.elenco.filter(p => p.posicao === 'GK').length === gksAntes, 'vendeu goleiro sem reserva');
});

// ------------------------------------------------------------------ motor: invariantes (§32)
console.log('-- Invariantes do motor (§32)');
teste('fôlego dentro de [5,100] e moral dentro de [0,100] ao fim da partida', () => {
    const r = runMatch({ seed: 5150 });
    const todos = r.home.elenco.concat(r.away.elenco);
    ok(todos.every(p => p.folego >= 5 && p.folego <= 100), 'fôlego fora do intervalo');
    ok(todos.every(p => p.moral == null || (p.moral >= 0 && p.moral <= 100)), 'moral fora do intervalo');
    ok(r.sim._decisoes.length <= 3, 'mais de 3 decisões numa partida: ' + r.sim._decisoes.length);
    ok(r.h >= 0 && r.a >= 0, 'placar negativo');
});
teste('expulsão do usuário desde o início reduz o aproveitamento', () => {
    const n = 120, sem = { H: 0 }, com = { H: 0 };
    for (let i = 0; i < n; i++) {
        const a = runMatch({ seed: 400 + i });
        if (a.h > a.a) sem.H++;
        const b = runMatch({ seed: 400 + i, startRedUser: 1 });
        if (b.h > b.a) com.H++;
    }
    ok(com.H < sem.H, 'expulsão não pesou: ' + com.H + ' vitórias com a menos vs ' + sem.H + ' em 11');
});
teste('Engine._distribuirXP diferencia titular de banco usando a partida real', () => {
    const s = novoSandbox();
    const clube = new Club(null);
    for (let i = 0; i < 14; i++) {
        const p = new Player(i === 0 ? 'GK' : i < 5 ? 'DEF' : i < 9 ? 'MID' : 'ATT');
        p.moral = 70; clube.elenco.push(p);
    }
    clube.formacao = '4-4-2';
    const rival = makeTeam('Fora', 70);
    const r = runMatch({ home: clube, away: rival, seed: 606 });
    s.Engine._distribuirXP(clube, r.sim, 30); // base baixa para ninguém subir de nível no meio do teste
    const part = r.sim.participacaoUsuario();
    ok(part.titulares.length === 11, 'titulares deveriam ser 11, veio ' + part.titulares.length);
    const tit = clube.elenco.find(p => String(p.id) === String(part.titulares[0]));
    const banco = clube.elenco.find(p => part.usados.indexOf(String(p.id)) < 0);
    ok(tit && tit.xp > 0, 'titular sem XP');
    if (banco) ok(banco.xp <= tit.xp, 'banco ganhou mais XP que titular: ' + banco.xp + ' > ' + tit.xp);
    ok(s.Engine._ultimaParticipacao && s.Engine._ultimaParticipacao.usados.length >= 11,
        'participação não registrada para o pós-jogo');
});

// ------------------------------------------------------------------ temporada completa IA (§18)
console.log('-- Temporada completa da liga (IA×IA, quickSim real)');
teste('38 rodadas: todos os clubes com 38 jogos, números coerentes e artilharia', () => {
    const s = novoSandbox();
    const liga = new League();
    liga.inicializar();
    liga.temporada = 1;
    liga.seed = 12345;
    const clubesA = CompetitionSystem.clubs(liga, 1);
    // userClub = null → a rodada inteira da liga roda pelo quickSim real (como
    // simulateAIMatches faz nos jogos que não são do usuário).
    for (let r = 1; r <= 38; r++) {
        liga.rodada = r;
        s.Engine.simulateAIMatches(liga, null);
    }
    clubesA.forEach((c) => {
        const jogos = c.vitorias + c.empates + c.derrotas;
        ok(jogos === 38, c.nome + ' com ' + jogos + ' jogos após 38 rodadas');
        ok(Number.isFinite(c.pontos) && Number.isFinite(c.golsPro) && Number.isFinite(c.golsContra), c.nome + ' com números inválidos');
        ok(c.golsPro >= 0 && c.golsContra >= 0, c.nome + ' com gols negativos');
    });
    // Tabela final coerente: soma de pontos = 3*V + E em todos os clubes.
    clubesA.forEach(c => ok(c.pontos === c.vitorias * 3 + c.empates, c.nome + ' com pontos ≠ 3V+E'));
    // Artilharia da liga recebeu gols dos jogos IA×IA (§ correção 2026-09-22 preservada).
    const golsLiga = clubesA.reduce((soma, c) => soma + c.elenco.reduce((g, p) => g + (p.gols || 0), 0), 0);
    ok(golsLiga > 300, 'artilharia da liga quase vazia: ' + golsLiga + ' gols creditados');
});
console.log('-- Economia por rodada: idempotência (§32)');
teste('ClubEcosystem.afterRound cobra a parcela uma única vez por rodada', () => {
    const clube = new Club(null);
    clube.orcamento = 500000;
    clube.emprestimos = [{ saldo: 120000, amortizacao: 10000, rodadas: 12 }];
    const liga = { temporada: 1, rodada: 7, adicionarNoticia() {} };
    ClubEcosystem.afterRound(clube, liga, { meusGols: 1, golsAdv: 0, usados: [], userHome: true });
    const posPrimeira = clube.orcamento;
    ClubEcosystem.afterRound(clube, liga, { meusGols: 1, golsAdv: 0, usados: [], userHome: true });
    ok(clube.orcamento === posPrimeira, 'segunda chamada na mesma rodada moveu o caixa: '
        + posPrimeira + ' → ' + clube.orcamento);
});

console.log('');
console.log('=== ' + (total - falhas) + '/' + total + ' verificações passaram' + (falhas ? ' — ' + falhas + ' FALHAS' : '') + ' ===');
process.exit(falhas ? 1 : 0);
