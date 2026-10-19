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
    TransferMarket, Player, Engine, CompetitionSystem, rivalHistorico, mancheteDaGazeta } = sb;

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
    // B51 (2026-10-19): a partida passou a ter 4 janelas de decisão (era 3), uma por quarto.
    ok(r.sim._decisoes.length <= 4, 'mais de 4 decisões numa partida: ' + r.sim._decisoes.length);
    ok(r.sim._decisoes.length >= 3, 'menos de 3 decisões numa partida: ' + r.sim._decisoes.length);
    ok(r.h >= 0 && r.a >= 0, 'placar negativo');
});
teste('expulsão do usuário desde o início reduz o aproveitamento', () => {
    // Contar só vitórias era frágil: com 120 amostras a diferença real (1 jogador a
    // menos vale ~-3,5 de ataque) pode cair no ruído. Aproveitamento = pontos, e o
    // saldo de gols separa com folga (medido: 171→163 pontos e +19→−8 de saldo).
    const n = 120;
    let ptsSem = 0, ptsCom = 0, saldoSem = 0, saldoCom = 0;
    for (let i = 0; i < n; i++) {
        const a = runMatch({ seed: 400 + i });
        const b = runMatch({ seed: 400 + i, startRedUser: 1 });
        const pts = r => r.h > r.a ? 3 : (r.h === r.a ? 1 : 0);
        ptsSem += pts(a); ptsCom += pts(b);
        saldoSem += (a.h - a.a); saldoCom += (b.h - b.a);
    }
    ok(ptsCom < ptsSem, 'expulsão não pesou nos pontos: ' + ptsCom + ' vs ' + ptsSem);
    ok(saldoCom < saldoSem - 10, 'expulsão não pesou no saldo: ' + saldoCom + ' vs ' + saldoSem);
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

// ---------------------------------------------------------------- B28: lesão com prazo
console.log('-- B28: lesão de partida tem prazo e cura (2026-10-15)');
teste('nenhum atleta sai lesionado de partida sem prazo de recuperação', () => {
    let lesoes = 0;
    for (let i = 0; i < 80; i++) {
        const r = runMatch({ seed: 9100 + i });
        r.home.elenco.concat(r.away.elenco).forEach(p => {
            if (!p.machucado) return;
            lesoes++;
            ok(p.rodadasRecuperacao > 0, p.nome + ' lesionado sem prazo (o bug do B28): '
                + 'machucado=' + p.machucado + ' rodadasRecuperacao=' + p.rodadasRecuperacao);
        });
    }
    ok(lesoes > 0, 'nenhuma lesão em 80 partidas — a bancada não exercitou o caminho');
});
teste('o prazo cai uma rodada por vez e o atleta é liberado no fim', () => {
    const s = novoSandbox();
    const elenco = [makePlayer('prazo', 'MID', 70)];
    elenco[0].machucado = 1;
    elenco[0].rodadasRecuperacao = 3;
    for (const restante of [2, 1]) {
        s.recuperarLesoesRodada(elenco);
        ok(elenco[0].rodadasRecuperacao === restante && elenco[0].machucado,
            'com prazo 3 esperava ' + restante + ' e ainda lesionado, veio ' + elenco[0].rodadasRecuperacao);
    }
    s.recuperarLesoesRodada(elenco);
    ok(elenco[0].machucado === false && elenco[0].rodadasRecuperacao === 0, 'não curou no fim do prazo');
});
teste('lesionado sem prazo (save afetado pelo B28) volta a curar', () => {
    const s = novoSandbox();
    const elenco = [makePlayer('legado', 'DEF', 70)];
    elenco[0].machucado = true;
    elenco[0].rodadasRecuperacao = 0;
    s.recuperarLesoesRodada(elenco);
    ok(elenco[0].rodadasRecuperacao > 0, 'save antigo continuaria lesionado para sempre');
    s.recuperarLesoesRodada(elenco);
    ok(elenco[0].machucado === false, 'save antigo não curou');
});

// -------------------------------------------------------- B29: liga viva em 10 temporadas
console.log('-- B29: a liga não se dissolve em 10 temporadas (2026-10-15)');
teste('nenhum clube da IA chega sem 11 jogadores', () => {
    const liga = new League();
    liga.inicializar();
    for (let t = 2; t <= 10; t++) {
        // Mesma virada de temporada do app (startNewSeason): envelhece, aposenta e repõe.
        CompetitionSystem.all(liga).filter(c => c && !c.isUser).forEach(cl => {
            cl.elenco.forEach(p => { if (typeof p.envelhecer === 'function') p.envelhecer(); });
            cl.elenco = cl.elenco.filter(p => p.idade <= 36);
            cl.reporElencoBase();
        });
        liga.temporada = t;
    }
    const semXI = CompetitionSystem.all(liga).filter(c => c && !c.isUser && (c.elenco || []).length < 11);
    ok(semXI.length === 0, semXI.length + ' clubes sem XI na 10ª temporada: '
        + semXI.slice(0, 3).map(c => c.nome + ' (' + c.elenco.length + ')').join(', '));
});
teste('a reposição cobre as linhas, é idempotente e não toca no clube do jogador', () => {
    const clube = new Club(null);
    const repostos = clube.reporElencoBase();
    const linha = pos => clube.elenco.filter(p => p.posicao === pos).length;
    ok(repostos > 0 && repostos === clube.elenco.length, 'elenco vazio não foi reposto');
    ok(linha('GK') >= 2 && linha('DEF') >= 5 && linha('MID') >= 5 && linha('ATT') >= 3,
        'linhas incompletas: ' + ['GK', 'DEF', 'MID', 'ATT'].map(p => p + '=' + linha(p)).join(' '));
    const antes = clube.elenco.length;
    ok(clube.reporElencoBase() === 0 && clube.elenco.length === antes, 'reposição não é idempotente');
    const user = new Club(null, true);
    ok(user.reporElencoBase() === 0 && user.elenco.length === 0, 'a reposição de IA mexeu no clube do usuário');
});
teste('a força da fornada acompanha o próprio elenco (não infla nem some)', () => {
    const fornada = ref => {
        const cl = new Club(null);
        for (let i = 0; i < 11; i++) { const p = new Player('MID'); p.overall = ref; cl.elenco.push(p); }
        cl.reporElencoBase();
        const novos = cl.elenco.slice(11);
        ok(novos.length > 0, 'nenhum atleta reposto com referência ' + ref);
        return novos.reduce((s, p) => s + p.overall, 0) / novos.length;
    };
    const fraco = fornada(40), forte = fornada(80);
    ok(forte > fraco + 15, 'fornada não acompanha o elenco: ' + fraco.toFixed(1) + ' × ' + forte.toFixed(1));
    ok(forte < 92 && fraco > 28, 'fornada fora da faixa: ' + fraco.toFixed(1) + ' / ' + forte.toFixed(1));
});

// ------------------------------------ B47/B48/B49: ritmo, repetição e contexto (2026-10-19)
console.log('-- B47/B48/B49: a partida dá para ler (2026-10-19)');
const normalizaFrase = t => t.replace(/\d+/g, 'N').replace(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+/g, 'J').trim();
teste('a mesma frase não domina a partida e o texto tem contexto', () => {
    let piorRep = 0, contexto = 0, linhas = 0, distintas = 0;
    for (let seed = 1; seed <= 8; seed++) {
        const logs = [];
        runMatch({ seed, ovrH: 70, ovrA: 70, preSim: sim => {
            const orig = sim._emit.bind(sim);
            sim._emit = function (log, tipo, statOnly) { if (log) logs.push(log); return orig(log, tipo, statOnly); };
        } });
        const mapa = new Map();
        logs.forEach(t => {
            linhas++;
            const temTime = ['Casa', 'Fora'].some(n => new RegExp('(^|[^\\wÀ-ÿ-])' + n + '($|[^\\wÀ-ÿ-])').test(t));
            if (temTime || /\d+'/.test(t) || /\b\d+ a \d+\b/.test(t)) contexto++;
            const k = normalizaFrase(t);
            mapa.set(k, (mapa.get(k) || 0) + 1);
        });
        distintas += mapa.size;
        piorRep = Math.max(piorRep, Math.max(...mapa.values()));
    }
    ok(piorRep <= 5, 'frase repetida ' + piorRep + 'x na MESMA partida (teto 5)');
    ok(distintas / 8 >= 60, 'poucas frases distintas por partida: ' + (distintas / 8).toFixed(1));
    ok(contexto / linhas >= 0.4, 'contexto em ' + (100 * contexto / linhas).toFixed(1) + '% das linhas (mínimo 40%)');
});
teste('a partida a 1x dura ~3 min e o piso de 60 s não segura mais o apito', () => {
    let ms = 0, piso = null;
    for (let seed = 1; seed <= 3; seed++) {
        runMatch({ seed, preSim: sim => {
            piso = sim.minDurMs;
            const og = sim._gap.bind(sim);
            sim._gap = function () { const g = og(); ms += g; return g; };
        } });
    }
    const media = ms / 3 / 1000;
    ok(media >= 150 && media <= 210, 'duração a 1x: ' + media.toFixed(1) + ' s (esperado 150-210)');
    ok(piso === 0, 'piso de parede em partida comum: ' + piso + ' ms (esperado 0)');
});

// ------------------------------- B50/B70/B73: clímax, estatística e tutorial (2026-10-19)
console.log('-- B50/B70/B73: clímax, estatística e tutorial (2026-10-19)');
teste('o gol escolhe o texto pela situação e o desfecho cita o placar', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true });
    const fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, null, { seed: 1, modo: 'detalhado', tempoMin: 90 });
    sim.scoreH = 0; sim.scoreA = 1; sim.minuto = 20; sim._esteveAtras = [false, false];
    ok(sim._situacaoGol(true) === 'empate', 'gol de empate mal classificado: ' + sim._situacaoGol(true));
    sim.scoreH = 2; sim.scoreA = 2; sim._esteveAtras = [true, false];
    ok(sim._situacaoGol(true) === 'virada', 'virada exige memória de quem esteve atrás: ' + sim._situacaoGol(true));
    sim.scoreH = 3; sim.scoreA = 1; sim._esteveAtras = [false, false];
    ok(sim._situacaoGol(true) === 'goleada', 'goleada mal classificada: ' + sim._situacaoGol(true));
    sim.scoreH = 1; sim.scoreA = 1; sim.minuto = 91;
    ok(sim._situacaoGol(true) === 'acrescimos', 'gol nos acréscimos mal classificado: ' + sim._situacaoGol(true));
    const situacoes = ['acrescimos', 'virada', 'empate', 'goleada', 'amplia', 'abertura', 'normal'];
    const frases = situacoes.map(sit => sim._fraseGol(casa, 'Fulano', 'Goleiro', sit));
    frases.forEach(f => ok(f && f.indexOf('{') < 0, 'template de gol não resolvido: ' + f));
    ok(new Set(frases).size === situacoes.length, 'pools de gol repetem entre situações diferentes');
    const empate = sim._fraseFim(2, 2);
    ok(empate.indexOf('2 a 2') >= 0 && empate.indexOf('{') < 0, 'desfecho de empate sem placar: ' + empate);
    const goleada = sim._fraseFim(4, 0);
    ok(goleada.indexOf('4 a 0') >= 0, 'desfecho de goleada sem placar: ' + goleada);
});
teste('a finalização narrada entra na estatística de chutes', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true });
    const fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, null, { seed: 1, modo: 'detalhado', tempoMin: 90 });
    sim._emCampo = [sim._xiDoTime(sim.home), sim._xiDoTime(sim.away)];
    sim._roll = () => false; // força 'é chance' (ehChance = !_roll)
    sim._aplicar({ tipo: 'lance', side: 0, min: 10 });
    ok(sim.chutes[0] === 1, 'chance narrada não contou como finalização: ' + JSON.stringify(sim.chutes));
    sim._roll = () => true; // força lance de construção
    sim._aplicar({ tipo: 'lance', side: 0, min: 11 });
    ok(sim.chutes[0] === 1, 'lance de construção inflou a estatística: ' + JSON.stringify(sim.chutes));
});
teste('o tutorial roda num clone e não toca no clube real', () => {
    const s = novoSandbox();
    const real = new s.Club('Real FC', true);
    real.gerarElencoInicial();
    const antes = real.elenco.length;
    const clone = s.TutorialManager._clonarClube(real);
    ok(clone !== real && clone.elenco !== real.elenco && clone.elenco[0] !== real.elenco[0],
        'clone compartilha referências com o clube real');
    clone.elenco[0].folego = 5;
    clone.elenco[0].machucado = true;
    clone.elenco.push(new s.Player('MID'));
    ok(real.elenco[0].folego !== 5 && real.elenco[0].machucado !== true, 'mutação do clone vazou para o clube real');
    ok(real.elenco.length === antes, 'elenco real mudou de tamanho');
    ok(clone.isUser === true && clone.nome === 'Real FC', 'clone perdeu a identidade do clube');
});

// ------------------------------- B52/B53/B54/B77: economia da IA, meta e draft (2026-10-19)
console.log('-- B52/B53/B54/B77: economia da IA, meta e draft (2026-10-19)');
teste('a IA recebe receita, paga folha e respeita o teto (idempotente por rodada)', () => {
    const s = novoSandbox();
    const cl = new s.Club('Teste FC', false);
    cl.gerarElencoInicial();
    cl.orcamento = 500000;
    const liga = { temporada: 1, rodada: 5, adicionarNoticia() {} };
    const liquido = s.ClubEcosystem.afterRoundIA(cl, liga, 1);
    ok(Number.isFinite(liquido) && liquido !== 0, 'receita líquida não calculada');
    ok(cl.orcamento !== 500000, 'caixa da IA não mudou');
    const caixa = cl.orcamento;
    ok(s.ClubEcosystem.afterRoundIA(cl, liga, 1) === 0 && cl.orcamento === caixa, 'receita dobrou na mesma rodada');
    cl.orcamento = 90000000;
    s.ClubEcosystem.afterRoundIA(cl, { temporada: 1, rodada: 6, adicionarNoticia() {} }, 1);
    ok(cl.orcamento <= s.ClubEcosystem.tetoCaixa(1), 'teto de caixa furado: ' + cl.orcamento);
});
teste('clube com caixa investe na pré-temporada; sem caixa e usuário não', () => {
    const s = novoSandbox();
    const rico = new s.Club('Rico FC', false); rico.gerarElencoInicial(); rico.orcamento = 2000000;
    const antes = rico.elenco.reduce((a, p) => a + p.overall, 0);
    const subiram = s.ClubEcosystem.investirElenco(rico, 1);
    ok(subiram > 0 && rico.orcamento < 2000000, 'clube rico não investiu');
    ok(rico.elenco.reduce((a, p) => a + p.overall, 0) > antes, 'investimento não subiu o elenco');
    const pobre = new s.Club('Pobre FC', false); pobre.gerarElencoInicial(); pobre.orcamento = 10000;
    const soma = pobre.elenco.reduce((a, p) => a + p.overall, 0);
    ok(s.ClubEcosystem.investirElenco(pobre, 1) === 0, 'clube sem caixa investiu');
    ok(pobre.elenco.reduce((a, p) => a + p.overall, 0) === soma, 'clube sem caixa melhorou de graça');
    const user = new s.Club('User FC', true); user.gerarElencoInicial(); user.orcamento = 2000000;
    ok(s.ClubEcosystem.investirElenco(user, 1) === 0, 'o investimento mexeu no clube do usuário');
});
teste('a meta da diretoria acompanha a divisão', () => {
    const s = novoSandbox();
    const metas = [1, 2, 3, 4].map(d => s.ClubEcosystem.metaTemporada(null, { divisaoUser: d }).alvo);
    ok(metas.join(',') === '8,6,4,4', 'metas inesperadas: ' + metas.join(','));
});
teste('a força do rival responde à ascensão e à campanha', () => {
    const s = novoSandbox();
    const montar = (asc, campanha) => {
        const casa = makeTeam('Casa', 70, { isUser: true });
        casa.ascensaoNivel = asc;
        const sim = new s.MatchSim(casa, makeTeam('Fora', 70), null, null, { seed: 2, modo: 'detalhado', tempoMin: 90 });
        sim._forcaRivalCampanha = campanha;
        return sim._poder(sim.away, false).atk;
    };
    ok(montar(3, 0) > montar(0, 0), 'ascensão não fortaleceu o rival');
    ok(montar(0, 1.5) > montar(0, 0), 'campanha de líder não fortaleceu o rival');
    ok(montar(0, -1) < montar(0, 0), 'lanterna não aliviou o rival');
});
teste('vender aplica a taxa pedida (55% do recém-chegado)', () => {
    const s = novoSandbox();
    const cl = new s.Club('Venda FC', true); cl.gerarElencoInicial(); cl.orcamento = 0;
    const p = cl.elenco[0]; p.valor = 10000; p.direitosClube = 1;
    cl.vender(p.id, 0.55);
    ok(cl.orcamento === 5500, 'taxa de 55% não aplicada: ' + cl.orcamento);
    ok(!cl.elenco.some(x => x.id === p.id), 'atleta não saiu do elenco');
});
teste('a mão sai da coleção de táticas do clube', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true });
    casa.taticas = [0, 1, 2, 3].map(i => new s.TaticaCard(s.GAME_DATA.taticas[i]));
    const sim = new s.MatchSim(casa, makeTeam('Fora', 70), null, null, { seed: 3, modo: 'detalhado', tempoMin: 90 });
    sim._montarMao();
    ok(sim._mao.length === 4, 'mão com ' + sim._mao.length + ' cartas');
    ok(sim._mao.every(c => casa.taticas.some(t => t.id === c.id)), 'carta fora da coleção na mão');
});

// -------------------------------------------------- B51/B66: decisão e ritmo (2026-10-19)
console.log('-- B51/B66: decisão sem gabarito e relógio que respeita o modal (2026-10-19)');
teste('a decisão do técnico descreve o trade-off e nunca imprime a chance', () => {
    const r = runMatch({ seed: 909 });
    // O fair play (2 opções) e o intervalo (3 opções, com bônus em %) não são a decisão de
    // finalização/postura — o alvo aqui é o prompt de contexto do lance.
    const calls = r.sb.MatchUI.promptCalls.filter(c => /Como orientar|Qual postura/.test(c.desc));
    ok(calls.length >= 3, 'decisões de menos: ' + calls.length);
    calls.forEach((c, i) => {
        ok(c.hints.length === 3, 'decisão ' + i + ' sem 3 dicas');
        c.hints.forEach(h => {
            ok(h && h.length >= 8, 'dica vazia/curta: "' + h + '"');
            ok(!/%|chance de gol|risco de sofrer/i.test(h), 'a dica entrega o gabarito: ' + h);
        });
        ok(!/Percentuais/i.test(c.desc), 'a descrição ainda fala em percentuais');
    });
});
teste('a partida tem até 4 janelas de decisão, uma por quarto', () => {
    let viuQuatro = 0, duplicou = 0;
    for (let seed = 1; seed <= 30; seed++) {
        const r = runMatch({ seed });
        const quartos = r.sim._decisoes.map(d => Math.min(3, Math.floor((d.min - 1) * 4 / 90)));
        if (quartos.length === 4) viuQuatro++;
        if (new Set(quartos).size !== quartos.length) duplicou++;
        ok(quartos.length <= 4, 'mais de 4 decisões (seed ' + seed + ')');
    }
    ok(viuQuatro > 0, 'nenhuma partida teve as 4 janelas');
    ok(duplicou === 0, duplicou + ' partidas com duas decisões no mesmo quarto');
});
teste('o timer da decisão cai com a velocidade (B66)', () => {
    const normal = runMatch({ seed: 313 });
    const rapido = runMatch({ seed: 313, preSim: sim => sim.setSpeed(4) });
    const decisoes = r => r.sb.MatchUI.promptCalls.filter(c => /Como orientar|Qual postura/.test(c.desc));
    ok(decisoes(normal).length > 0, 'sem decisões a 1×');
    ok(decisoes(normal).every(c => c.ms === 8000), '1× não usa 8 s: ' + decisoes(normal).map(c => c.ms).join(','));
    ok(decisoes(rapido).length > 0, 'sem decisões a 4×');
    ok(decisoes(rapido).every(c => c.ms === 2000), '4× não usa 2 s: ' + decisoes(rapido).map(c => c.ms).join(','));
    // B67: o intervalo tem prazo próprio (12 s a 1×, 3 s a 4×) e também escala.
    const intervalos = r => r.sb.MatchUI.promptCalls.filter(c => /INTERVALO/.test(c.desc));
    ok(intervalos(normal).length === 1 && intervalos(normal)[0].ms === 12000, 'intervalo a 1× não usa 12 s');
    ok(intervalos(rapido).length === 1 && intervalos(rapido)[0].ms === 3000, 'intervalo a 4× não usa 3 s');
});
teste('o relógio da partida para enquanto o modal de cartas está aberto (B66)', () => {
    const modal = { classList: { contains: c => c !== 'hidden' } };
    const s = novoSandbox({
        document: {
            getElementById: id => (id === 'modal-cartas' ? modal : null),
            querySelectorAll: () => [],
            createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {} })
        }
    });
    const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, null, { seed: 5, modo: 'detalhado', tempoMin: 90, minDurMs: 0 });
    sim.roteiro = [{ min: 10, tipo: 'lance', side: 0 }];
    ok(sim._modalAberto() === true, 'modal aberto não foi detectado');
    sim._tick();
    ok(sim._idx === 0, 'o relógio avançou com modal aberto: idx=' + sim._idx);
    const fechado = novoSandbox();
    const sim2 = new fechado.MatchSim(casa, fora, null, null, { seed: 5, modo: 'detalhado', tempoMin: 90, minDurMs: 0 });
    ok(sim2._modalAberto() === false, 'modal fechado foi tratado como aberto');
});

// -------------------------------------------------- B62/B63: Gazeta e rival fixo (2026-10-19)
console.log('-- B62/B63: Gazeta com ângulo e rival de todas as temporadas (2026-10-19)');
teste('a manchete da Gazeta nasce do jogo e é determinística (B62)', () => {
    const gols = (mins, tipo) => mins.map(min => ({ min, tipo }));
    const virada = mancheteDaGazeta('Foguete FC', 'Rival EC', 2, 1,
        [...gols([12], 'gol-rival'), ...gols([55, 80], 'gol')], true, 7);
    ok(virada.candidatos.includes('VIRADA'), 'não detectou a virada: ' + virada.candidatos.join(','));
    const acrescimos = mancheteDaGazeta('Foguete FC', 'Rival EC', 2, 1,
        [...gols([20, 90], 'gol'), ...gols([40], 'gol-rival')], true, 7);
    ok(acrescimos.candidatos.includes('ACRÉSCIMOS'), 'não detectou o gol nos acréscimos');
    const expulsao = mancheteDaGazeta('Foguete FC', 'Rival EC', 1, 0, [{ min: 30, tipo: 'expulsao' }], true, 7);
    ok(expulsao.candidatos.includes('EXPULSÃO'), 'não detectou a expulsão');
    const outra = mancheteDaGazeta('Foguete FC', 'Rival EC', 2, 1,
        [...gols([12], 'gol-rival'), ...gols([55, 80], 'gol')], true, 7);
    ok(JSON.stringify(virada) === JSON.stringify(outra), 'a mesma edição gerou manchete diferente');
    ok(virada.h.includes('Foguete FC') && virada.h.includes('Rival EC'), 'manchete sem os clubes: ' + virada.h);
    ok(virada.autor && virada.reacao, 'manchete sem assinatura ou reação');
    const derbi = mancheteDaGazeta('Foguete FC', 'Rival EC', 1, 0, [], true, 3, 'Rival EC');
    ok(derbi.k.indexOf('DÉRBI') === 0, 'dérbi não marcado na manchete: ' + derbi.k);
    // Usuário fora de casa: o evento 'gol' é do adversário e o 'gol-rival' é dele.
    const fora = mancheteDaGazeta('Foguete FC', 'Rival EC', 2, 1,
        [...gols([12], 'gol'), ...gols([55, 80], 'gol-rival')], false, 4);
    ok(fora.candidatos.includes('VIRADA'), 'não detectou virada do visitante');
});
teste('o rival do ano é fixo, não é o próprio clube e acompanha a divisão (B63)', () => {
    const s = novoSandbox();
    const liga = new League();
    liga.inicializar();
    liga.divisaoUser = 1;
    const clubes = CompetitionSystem.clubs(liga, 1);
    const clube = clubes[0];
    const r1 = rivalHistorico(clube, liga), r2 = rivalHistorico(clube, liga);
    ok(r1 && r1 === r2, 'rival não é estável entre chamadas');
    ok(r1 !== clube, 'o clube virou rival de si mesmo');
    ok(clubes.includes(r1), 'rival fora da divisão do usuário');
    liga.divisaoUser = 2;
    ok(CompetitionSystem.clubs(liga, 2).includes(rivalHistorico(clube, liga)), 'rival não acompanhou a divisão');
    // A abertura usa o tom de clássico quando o jogo é dérbi (B63 é tom, não bônus de força).
    const com = runMatch({ seed: 8, derbi: true });
    const sem = runMatch({ seed: 8, derbi: false });
    ok(com.sim._ctxUsados && com.sim._ctxUsados.aberturaClassico === 1, 'dérbi não abriu como clássico');
    ok(sem.sim._ctxUsados && sem.sim._ctxUsados.abertura === 1, 'jogo comum não abriu com a abertura padrão');
    ok(com.sim._derbiEmitidos === 3, 'dérbi não teve as 3 notas no jogo: ' + com.sim._derbiEmitidos);
    ok(sem.sim._derbiEmitidos === 0, 'jogo comum ganhou nota de dérbi');
    // B63 é TOM, não bônus: a força do rival não muda no dérbi (medida antes do apito).
    const a = novoSandbox(), b = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
    const comDerbi = new a.MatchSim(casa, fora, null, null, { seed: 8, derbi: true, tempoMin: 90 });
    const semDerbi = new b.MatchSim(casa, fora, null, null, { seed: 8, derbi: false, tempoMin: 90 });
    ok(comDerbi._poder(fora, false).atk === semDerbi._poder(fora, false).atk, 'dérbi mexeu na força do rival');
});

// -------------------------------------------------- B67/B68/B69: tensão, campo e cartas (2026-10-19)
console.log('-- B67/B68/B69: reta final, intervalo, gestão em campo e Cera (2026-10-19)');
teste('a criação cresce na reta final e quem está atrás empurra mais (B67)', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, null, { seed: 11, modo: 'detalhado', tempoMin: 90 });
    const medir = (min, sh, sa, side) => { sim.minuto = min; sim.scoreH = sh; sim.scoreA = sa; return sim._modeloXG(side).criacao; };
    const inicio = medir(10, 0, 0, 0);
    const finalEmpate = medir(85, 0, 0, 0);
    const finalAtras = medir(85, 0, 1, 0);
    const finalFrente = medir(85, 1, 0, 0);
    ok(finalEmpate > inicio * 1.15, 'reta final não aumentou a criação: ' + inicio.toFixed(4) + ' → ' + finalEmpate.toFixed(4));
    ok(finalAtras > finalEmpate, 'quem está atrás não empurrou mais');
    ok(finalFrente < finalEmpate, 'quem está na frente não recuou');
});
teste('o intervalo existe, tem 3 posturas e muda a criação do 2º tempo (B67)', () => {
    const neutro = runMatch({ seed: 222 });
    ok(neutro.sim._intervaloFeito === true, 'intervalo não aconteceu');
    ok(neutro.sim._ajusteIntervalo && neutro.sim._ajusteIntervalo.atk === 1, 'default do intervalo não é neutro');
    const pressao = runMatch({ seed: 222, decisao: p => (/INTERVALO/.test(p.desc) ? 0 : 1) });
    ok(pressao.sim._ajusteIntervalo && pressao.sim._ajusteIntervalo.atk > 1, 'pressão não aplicada');
    ok(pressao.sim._ajusteIntervalo.def > 1, 'pressão não expôs a defesa');
    const segurar = runMatch({ seed: 222, decisao: p => (/INTERVALO/.test(p.desc) ? 2 : 1) });
    ok(segurar.sim._ajusteIntervalo.atk < 1 && segurar.sim._ajusteIntervalo.def < 1, 'segurar não fechou o jogo');
    const opcoes = neutro.sb.MatchUI.promptCalls.filter(c => /INTERVALO/.test(c.desc));
    ok(opcoes.length === 1 && opcoes[0].opts.length === 3, 'intervalo sem 3 opções');
});
teste('o desgaste chega ao fim do jogo e a IA troca de verdade (B68)', () => {
    const r = runMatch({ seed: 404 });
    const part = r.sim.participacaoUsuario();
    const xi = new Set(part.titulares.map(String));
    const emCampo = r.home.elenco.filter(p => xi.has(String(p.id)));
    const media = emCampo.reduce((s, p) => s + (p.folego == null ? 100 : p.folego), 0) / emCampo.length;
    ok(media < 75, 'o XI termina descansado demais: ' + media.toFixed(1));
    ok(emCampo.some(p => (p.folego || 0) < 70), 'nenhum titular chegou perto do limite');
    ok(r.sim._subsIA >= 1, 'a IA não fez nenhuma substituição');
    ok(r.sim._subsIA <= 2, 'a IA fez substituições demais: ' + r.sim._subsIA);
});
teste('lesão em campo força a troca e, sem reserva, deixa −3 de OVR (B68)', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, null, { seed: 12, modo: 'detalhado', tempoMin: 90 });
    sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(fora)];
    sim._usados = { 0: {}, 1: {} };
    sim.minuto = 30;
    const titular = casa.elenco.find(p => sim._emCampo[0].includes(p.id));
    sim._aplicar({ tipo: 'lesao', side: 0, atleta: titular, min: 30 });
    sim._trocarLesionado();
    ok(sim._emCampo[0].indexOf(titular.id) < 0, 'o lesionado continuou em campo');
    // Sem banco, o atleta fica e leva −3 de rendimento.
    const s2 = novoSandbox();
    const semBanco = makeTeam('SemBanco', 70, { isUser: true });
    semBanco.elenco = semBanco.elenco.slice(0, 11);
    const sim2 = new s2.MatchSim(semBanco, makeTeam('Fora', 70), null, null, { seed: 13, modo: 'detalhado', tempoMin: 90 });
    sim2._emCampo = [sim2._xiDoTime(semBanco), sim2._xiDoTime(makeTeam('Fora', 70))];
    sim2._usados = { 0: {}, 1: {} };
    sim2.minuto = 30;
    const antes = sim2._poder(semBanco, true).atk;
    const titular2 = semBanco.elenco.find(p => sim2._emCampo[0].includes(p.id));
    sim2._aplicar({ tipo: 'lesao', side: 0, atleta: titular2, min: 30 });
    sim2._trocarLesionado();
    ok(sim2._machucadosEmCampo[titular2.id] === true, 'não marcou o lesionado sem reserva');
    ok(sim2._poder(semBanco, true).atk < antes, 'o lesionado em campo não perdeu rendimento');
});
teste('Cera reduz a criação rival, mas não zera mais o jogo (B69)', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, null, { seed: 14, modo: 'detalhado', tempoMin: 90 });
    sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(fora)];
    sim.minuto = 30;
    const antes = sim._modeloXG(1).criacao;
    sim._buffs = [{ id: 't_cera', nome: 'Cera', fimMin: 40 }];
    const depois = sim._modeloXG(1).criacao;
    ok(depois > 0, 'Cera ainda zera a criação rival');
    perto(depois / antes, 0.5, 0.02, 'redução da Cera fora do esperado');
});

// -------------------------------------------------- B64: fios narrativos (2026-10-19)
console.log('-- B64: fios narrativos da temporada (2026-10-19)');
teste('os fios nascem com rival, promessa e jovem, e o rival é contado à parte (B64)', () => {
    const s = novoSandbox();
    const liga = new League();
    liga.inicializar();
    liga.divisaoUser = 1;
    const clube = liga.clubes[0];
    clube.isUser = true;
    const f = s.ClubEcosystem.atualizarFios(clube, liga);
    ok(f && f.rivalNome, 'sem rival no fio');
    ok(f.promessa && f.promessa.alvo >= 4, 'sem promessa da diretoria');
    ok(f.jovem && f.jovem.id, 'sem jovem da base');
    ok(s.ClubEcosystem.atualizarFios(clube, liga) === f, 'atualizarFios não é idempotente na temporada');
    ok(s.ClubEcosystem.registrarRival(clube, f.rivalNome, 2, 0) === true, 'não contou o rival');
    ok(f.rivalPlacar.v === 1, 'placar do rival não subiu');
    ok(s.ClubEcosystem.registrarRival(clube, 'Outro FC', 2, 0) === false, 'contou um jogo que não é dérbi');
    ok(f.rivalPlacar.v === 1 && f.rivalPlacar.d === 0, 'placar do rival contaminado');
});
teste('a avaliação dos fios paga uma vez e a virada de temporada renova (B64)', () => {
    const s = novoSandbox();
    const liga = new League();
    liga.inicializar();
    liga.divisaoUser = 1;
    const clube = liga.clubes[0];
    clube.isUser = true;
    const f = s.ClubEcosystem.atualizarFios(clube, liga);
    const jovem = clube.elenco.find(p => p.id === f.jovem.id);
    jovem.partidas = f.jovem.basePartidas + 14;
    jovem.gols = f.jovem.baseGols + 5;
    s.ClubEcosystem.registrarRival(clube, f.rivalNome, 1, 0);
    const av = s.ClubEcosystem.avaliarFios(clube, liga);
    ok(av.jovemOk && av.rivalOk, 'fios cumpridos não foram reconhecidos');
    const moral = clube.moral;
    s.ClubEcosystem.avaliarFios(clube, liga);
    ok(clube.moral === moral, 'a avaliação pagou o bônus duas vezes');
    liga.temporada = 2;
    const f2 = s.ClubEcosystem.atualizarFios(clube, liga);
    ok(f2.rivalPlacar.v === 0 && f2.avaliadaTemporada == null, 'nova temporada não renovou os fios');
});

// -------------------------------------------------- B65/B71/B72: vestiário, picos e rótulos (2026-10-19)
console.log('-- B65/B71/B72: disciplina, ética, picos e rótulos com mecânica (2026-10-19)');
teste('o perfil de jogo do rival muda criação e conversão (B72)', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true });
    const medir = (perfil) => {
        const fora = makeTeam('Fora', 70);
        fora.perfilJogo = perfil;
        const sim = new s.MatchSim(casa, fora, null, null, { seed: 15, modo: 'detalhado', tempoMin: 90 });
        sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(fora)];
        sim.minuto = 20;
        return sim._modeloXG(1);
    };
    const neutro = medir(null), posse = medir('posse'), contra = medir('contra_ataque'), retranca = medir('retranca_copeira');
    ok(posse.criacao > neutro.criacao, 'posse não aumentou a criação');
    ok(contra.criacao < neutro.criacao, 'contra-ataque não abriu mão de volume');
    ok(contra.qualidade > neutro.qualidade, 'contra-ataque não ganhou conversão');
    ok(retranca.criacao < neutro.criacao, 'retranca não fechou o jogo');
});
teste('o estádio e o ritmo deixam de ser rótulo (B72)', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true });
    const medirEstadio = (nivel) => {
        casa.estadioNivel = nivel;
        const sim = new s.MatchSim(casa, makeTeam('Fora', 70), null, null, { seed: 16, modo: 'detalhado', tempoMin: 90 });
        sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(sim.away)];
        sim.minuto = 20;
        return sim._modeloXG(0).criacao;
    };
    ok(medirEstadio(3) > medirEstadio(1) * 1.03, 'estádio nível 3 não aumentou o mando');
    const gap = (ritmo) => {
        const sim = new s.MatchSim(makeTeam('Casa', 70), makeTeam('Fora', 70), null, null, { seed: 17, modo: 'detalhado', tempoMin: 90, ritmo });
        return sim._gap();
    };
    ok(gap('lento') > gap('normal'), 'ritmo lento não desacelerou o relógio');
    ok(gap('intenso') < gap('normal'), 'ritmo intenso não acelerou o relógio');
});
teste('disciplina baixa aumenta cartão; ética melhora bilheteria (B65)', () => {
    const contarCartoes = (disc) => {
        const s = novoSandbox();
        const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
        casa.elenco.concat(fora.elenco).forEach(p => { p.disciplina = disc; });
        const sim = new s.MatchSim(casa, fora, null, null, { seed: 18, modo: 'detalhado', tempoMin: 90 });
        sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(fora)];
        let n = 0;
        for (let i = 0; i < 1500; i++) {
            sim.minuto = 1 + (i % 88);
            const ev = sim._eventoMinuto();
            if (ev && ev.tipo === 'cartao') n++;
        }
        return n;
    };
    ok(contarCartoes(10) > contarCartoes(90), 'disciplina não pesou no risco de cartão');
    const s = novoSandbox();
    const cl = new s.Club('Etica FC', true); cl.gerarElencoInicial();
    cl.etica = 90;
    const alto = cl.stadiumRevenue();
    cl.etica = 10;
    const baixo = cl.stadiumRevenue();
    ok(alto > baixo, 'ética não mexeu na bilheteria: ' + alto + ' vs ' + baixo);
});
teste('a trave é pico raro (máx. 1) e a virada vale para os dois lados (B71)', () => {
    let comTrave = 0;
    for (let seed = 500; seed < 540; seed++) {
        const r = runMatch({ seed });
        ok(r.sim._traves <= 1, 'mais de uma trave na partida (seed ' + seed + ')');
        if (r.sim._traves === 1) comTrave++;
    }
    ok(comTrave > 0, 'nenhuma trave em 40 partidas');
    const s = novoSandbox();
    const sim = new s.MatchSim(makeTeam('Casa', 70, { isUser: true }), makeTeam('Fora', 70), null, null, { seed: 19, modo: 'detalhado', tempoMin: 90 });
    sim._emCampo = [sim._xiDoTime(sim.home), sim._xiDoTime(sim.away)];
    sim.scoreH = 1; sim.scoreA = 0; sim._esteveAtras = [false, true];
    sim._marcar(false, null);
    sim._marcar(false, null);
    ok(sim._viradaPendente === true && sim._viradaLado === 1, 'virada do visitante não foi detectada');
});
teste('existe pênalti em tempo normal e ele entra na estatística (B71)', () => {
    const s = novoSandbox();
    const sim = new s.MatchSim(makeTeam('Casa', 70, { isUser: true }), makeTeam('Fora', 70), null, null, { seed: 20, modo: 'detalhado', tempoMin: 90 });
    sim._emCampo = [sim._xiDoTime(sim.home), sim._xiDoTime(sim.away)];
    sim.minuto = 30;
    sim._cobrarPenalti({ side: 0 });
    ok(sim._penaltis === 1, 'pênalti não foi contado');
    ok(sim.chutes[0] >= 1, 'pênalti não entrou em chutes');
});

// -------------------------------------------------- B79: meta-progressão entre carreiras (2026-10-19)
console.log('-- B79: prestígio e dificuldades entre carreiras (2026-10-19)');
teste('o prestígio sobe por temporada, é idempotente e destrava a Lenda (B79)', () => {
    const s = novoSandbox();
    const M = s.MetaProgress;
    ok(M, 'MetaProgress não foi extraído');
    M.salvar(M.padrao());
    ok(M.desbloqueada(1.3) === false, 'Lenda começou destravada');
    const r1 = M.registrarTemporada({ chave: 'seed-a:1', clube: 'Foguete FC', divisao: 4, posicao: 5, titulos: 0 });
    ok(!r1.repetida && r1.pontos >= 4, 'temporada não pagou prestígio');
    ok(M.ler().prestigio === r1.pontos && M.ler().temporadas === 1, 'prestígio/temporadas inconsistentes');
    const r2 = M.registrarTemporada({ chave: 'seed-a:1', clube: 'Foguete FC', divisao: 4, posicao: 5, titulos: 0 });
    ok(r2.repetida && M.ler().prestigio === r1.pontos, 'a mesma temporada pagou duas vezes');
    for (let i = 2; i <= 20 && !M.desbloqueada(1.3); i++) {
        M.registrarTemporada({ chave: 'seed-a:' + i, clube: 'Foguete FC', divisao: 1, posicao: 2, titulos: i === 2 ? 1 : 0 });
    }
    ok(M.desbloqueada(1.3) === true, 'Lenda não destravou com prestígio ' + M.ler().prestigio);
    ok(M.ler().museu['Foguete FC'] === 2, 'museu global não guardou a melhor posição');
});

console.log('');
console.log('=== ' + (total - falhas) + '/' + total + ' verificações passaram' + (falhas ? ' — ' + falhas + ' FALHAS' : '') + ' ===');
process.exit(falhas ? 1 : 0);
