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
    // Lote 8 (P4): T1 da Série A = entre os 12; a partir da T2 = 8. B/C/D seguem 6/4/4.
    const metas = [1, 2, 3, 4].map(d => s.ClubEcosystem.metaTemporada(null, { divisaoUser: d, temporada: 1 }).alvo);
    ok(metas.join(',') === '12,6,4,4', 'metas T1 inesperadas: ' + metas.join(','));
    const m2 = s.ClubEcosystem.metaTemporada(null, { divisaoUser: 1, temporada: 2 }).alvo;
    ok(m2 === 8, 'meta da A na T2 deveria ser 8: ' + m2);
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
    perto(depois / antes, 0.45, 0.02, 'redução da Cera fora do esperado (lote 6: 0,45)');
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

// -------------------------------------------------- P4: clima, química, patrocínio e olheiro (2026-10-21)
// Estes quatro sistemas existiam no código desde as rodadas G2/G4/C1/C2, mas não tinham
// NENHUMA verificação — e continuavam listados como "ideia futura, sem compromisso" no
// PLANO_MELHORIAS. Aqui eles viram contrato: uma regressão que os desligue aparece na hora.
console.log('-- P4: clima, química de elenco, patrocínio com metas e olheiro (2026-10-21)');

teste('o clima pesa no poder dos dois lados e na conversão (P4 / G2)', () => {
    const s = novoSandbox();
    const medir = (condicao) => {
        const casa = makeTeam('Casa', 70, { isUser: true }), fora = makeTeam('Fora', 70);
        const sim = new s.MatchSim(casa, fora, null, null, { seed: 31, modo: 'detalhado', tempoMin: 90, condicao });
        sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(fora)];
        sim.minuto = 30;
        return { xCasa: sim._modeloXG(0), xFora: sim._modeloXG(1), pCasa: sim._poder(casa, true), pFora: sim._poder(fora, false) };
    };
    const bom = medir('normal'), lama = medir('lama');
    ok(s.CONDICOES_JOGO && Object.keys(s.CONDICOES_JOGO).length >= 3, 'tabela de clima sumiu');
    ok(s.CONDICOES_JOGO.lama.lambdaMul < s.CONDICOES_JOGO.normal.lambdaMul, 'lama não converte menos que tempo bom');
    // O ajuste de atk/def é o MESMO para os dois lados (mesma condição de campo).
    perto(lama.pCasa.atk - bom.pCasa.atk, -1.5, 1e-9, 'atk do mandante não caiu 1,5 na lama');
    perto(lama.pFora.atk - bom.pFora.atk, -1.5, 1e-9, 'atk do visitante não caiu o mesmo tanto (clima assimétrico)');
    perto(lama.pCasa.def - bom.pCasa.def, 1, 1e-9, 'def do mandante não subiu 1 na lama');
    perto(lama.pFora.def - bom.pFora.def, 1, 1e-9, 'def do visitante não subiu o mesmo tanto');
    ok(lama.xCasa.qualidade < bom.xCasa.qualidade && lama.xFora.qualidade < bom.xFora.qualidade,
        'lama não reduziu a conversão dos dois lados');
});

teste('a química de elenco soma sinergias, tem teto e não dispara com time incompleto (P4 / G4)', () => {
    const s = novoSandbox();
    ok(typeof s.bonusQuimica === 'function', 'bonusQuimica não foi extraída');
    const base = (n, pos) => makePlayer('b' + n, pos, 70, { origem: 'base' });
    const comTrait = (id, pos, t) => makePlayer(id, pos, 70, { traits: [t] });
    // Menos de 3 em campo: nenhuma sinergia.
    ok(s.bonusQuimica([]).atk === 0 && s.bonusQuimica([base(1, 'MID')]).mid === 0, 'sinergia disparou com time incompleto');
    // 3 crias da base → meio entrosado.
    const crias = s.bonusQuimica([base(1, 'MID'), base(2, 'DEF'), base(3, 'ATT'), makePlayer('m', 'MID', 70)]);
    ok(crias.mid >= 0.5 && crias.chips.some(c => c.label.indexOf('crias da base') >= 0), '3 crias da base não deram entrosamento');
    // Artilheiro + Maestro → ataque com armador.
    const dupla = s.bonusQuimica([comTrait('a', 'ATT', 'Artilheiro'), comTrait('b', 'MID', 'Maestro'), makePlayer('c', 'DEF', 70)]);
    ok(dupla.atk >= 1 && dupla.chips.some(c => c.label.indexOf('Artilheiro') >= 0), 'Artilheiro + Maestro não somou ataque');
    // Muralha + 2 zagueiros → defesa compacta.
    const muro = s.bonusQuimica([comTrait('m', 'DEF', 'Muralha'), makePlayer('d1', 'DEF', 70), makePlayer('d2', 'DEF', 70)]);
    ok(muro.def >= 1, 'Muralha com 2 zagueiros não reforçou a defesa');
    // Teto: nem com toda a sinergia ligada passa de ±3 por linha (o Craque vale +6).
    const tudo = [base(1, 'DEF'), base(2, 'DEF'), base(3, 'DEF'),
        comTrait('h1', 'DEF', 'Muralha'), comTrait('h2', 'DEF', 'Muralha'),
        comTrait('a1', 'ATT', 'Artilheiro'), comTrait('a2', 'ATT', 'Artilheiro'),
        comTrait('m1', 'MID', 'Maestro'), comTrait('m2', 'MID', 'Maestro')];
    const q = s.bonusQuimica(tudo);
    ['atk', 'mid', 'def'].forEach(k => ok(Math.abs(q[k]) <= 3, 'sinergia de ' + k + ' furou o teto: ' + q[k]));
});

teste('o patrocínio paga a meta uma vez só e só para o usuário (P4 / C1)', () => {
    const s = novoSandbox();
    ok(Array.isArray(s.PATROCINIOS) && s.PATROCINIOS.length >= 3, 'tabela de patrocínios sumiu');
    const ofertas = s.PATROCINIOS.filter(p => p.tipo === 'fixo'), arrojadas = s.PATROCINIOS.filter(p => (p.metas || []).length > 0);
    ok(ofertas.length >= 1 && arrojadas.length >= 1, 'não há escolha entre fixo garantido e arrojado');
    ok(ofertas.every(p => !(p.metas || []).length) && arrojadas.every(p => p.fixo < ofertas[0].fixo),
        'o arrojado deveria pagar menos fixo que o garantido');
    const cl = new s.Club('Patrocinio FC', true);
    const titulo = JSON.parse(JSON.stringify(s.PATROCINIOS.find(p => p.metas.some(m => m.tipo === 'titulo'))));
    cl.patrocinio = titulo;
    const antes = cl.orcamento;
    const pago = cl.checkPatrocinioMetas({ tipo: 'titulo' });
    ok(pago > 0 && cl.orcamento === antes + pago, 'meta de título não pagou (' + pago + ')');
    ok(cl.patrocinio.metas.every(m => m.pago), 'meta não foi marcada como paga');
    ok(cl.checkPatrocinioMetas({ tipo: 'titulo' }) === 0, 'a mesma meta pagou duas vezes');
    // Meta de posição respeita o alvo (G4 = top 4).
    const g4 = new s.Club('G4 FC', true);
    g4.patrocinio = JSON.parse(JSON.stringify(s.PATROCINIOS.find(p => p.metas.some(m => m.tipo === 'posicao'))));
    ok(g4.checkPatrocinioMetas({ tipo: 'posicao', posicao: 9 }) === 0, 'meta de G4 pagou na 9ª posição');
    ok(g4.checkPatrocinioMetas({ tipo: 'posicao', posicao: 3 }) > 0, 'meta de G4 não pagou no 3º lugar');
    // Clube da IA não tem contrato de patrocínio.
    const ia = new s.Club('Rival FC', false);
    ia.patrocinio = JSON.parse(JSON.stringify(titulo));
    ok(ia.checkPatrocinioMetas({ tipo: 'titulo' }) === 0, 'clube da IA recebeu bônus de patrocínio');
});

teste('o olheiro esconde o OVR, cobra por relatório e revela no 3/3 (P4 / C2)', () => {
    const s = novoSandbox();
    const TM = s.TransferMarket;
    const p = new s.Player('ATT');
    p.overall = 72;
    p.potencial = 88;
    TM.iniciarScouting(p);
    ok(p.potencialRevelado === false, 'o olheiro não escondeu o potencial');
    ok(p.scouting && p.scouting.etapa === 0, 'relatório não começou em 0/3');
    ok(/^\d+–\d+$/.test(TM.ovrVisivel(p)), 'OVR visível não é uma faixa: ' + TM.ovrVisivel(p));
    ok(String(TM.ovrVisivel(p)).indexOf('72') < 0, 'a faixa entregou o OVR exato na etapa 0');
    const cl = new s.Club(null, true);
    cl.elenco = [p]; // o relatório avança pelo elenco do clube (afterRound)
    cl.orcamento = 100000;
    const liga = { temporada: 1, rodada: 3 };
    const r1 = TM.avaliar(cl, p, liga);
    ok(r1.ok && cl.orcamento === 85000, 'avaliação não cobrou R$ 15k: ' + JSON.stringify(r1));
    ok(p.scouting.pendente, 'relatório não ficou pendente');
    ok(TM.avaliar(cl, p, liga).ok === false, 'dá para mandar dois olheiros na mesma rodada');
    cl.partidasTotais = (cl.partidasTotais || 0) + 1;
    TM.afterRound(cl, { temporada: 1, rodada: 4, adicionarNoticia() { } });
    ok(p.scouting.etapa === 1 && !p.scouting.pendente, 'o relatório não avançou após a rodada');
    // Etapa 2 e 3: fecha em 3/3 e revela o OVR exato + o traço oculto.
    for (let i = 0; i < 2; i++) {
        cl.partidasTotais++;
        TM.avaliar(cl, p, { temporada: 1, rodada: 5 + i });
        cl.partidasTotais++;
        TM.afterRound(cl, { temporada: 1, rodada: 6 + i, adicionarNoticia() { } });
    }
    ok(p.scouting.etapa === 3, 'o relatório não fechou em 3/3 (etapa ' + p.scouting.etapa + ')');
    ok(p.potencialRevelado === true, 'o potencial não foi revelado no 3/3');
    ok(TM.ovrVisivel(p) === '72', 'no 3/3 o OVR deveria ser exato: ' + TM.ovrVisivel(p));
    ok((p.traits || []).some(t => (p.tracosOcultos || []).includes(t)), 'o traço oculto não entrou nos atributos');
});

console.log('-- Overall por diferença, nome do clube e bônus único do tutorial (2026-10-21)');
const fsT = require('fs'), pathT = require('path');

teste('treinar atributo não derruba o OVR (ATT 85 treinado fica ≥ 85)', () => {
    const s = novoSandbox();
    const p = new s.Player('ATT');
    p.stats = { GK: 30, DEF: 30, MID: 60, ATT: 85, VEL: 80, PAS: 60, FIN: 85 };
    p.overall = 85;
    p.trainingPoints = 3;
    ok(p.treinarAtributo('ATT') === true, 'o treino não aconteceu');
    ok(p.stats.ATT === 86, 'ATT deveria ser 86, veio ' + p.stats.ATT);
    ok(p.overall === 85, 'um treino isolado não deveria mexer no OVR inteiro: ' + p.overall);
    perto(p.ovrFracao, 1 / 7, 1e-6, 'fração deveria guardar 1/7 do treino');
    ok(p.overall >= 85, 'OVR caiu ao treinar ATT: ' + p.overall);
});

teste('7 treinos de ATT 85 sobem o OVR para 86 (fração acumula, sem perder ponto)', () => {
    const s = novoSandbox();
    const p = new s.Player('ATT');
    p.stats = { GK: 30, DEF: 30, MID: 60, ATT: 85, VEL: 80, PAS: 60, FIN: 85 };
    p.overall = 85;
    p.trainingPoints = 7;
    for (let i = 0; i < 7; i++) ok(p.treinarAtributo('ATT') === true, 'treino ' + (i + 1) + ' falhou');
    ok(p.stats.ATT === 92, 'ATT deveria ser 92, veio ' + p.stats.ATT);
    ok(p.overall === 86, 'OVR deveria ser 86 após 7 treinos, veio ' + p.overall);
    perto(p.ovrFracao, 0, 1e-6, 'fração deveria zerar após o ponto inteiro');
});

teste('envelhecer aos 33 anos não derruba o OVR além de 1 ponto', () => {
    const s = novoSandbox();
    const p = new s.Player('MID');
    p.stats = { GK: 30, DEF: 40, MID: 80, ATT: 70, VEL: 80, PAS: 75, FIN: 60 };
    p.overall = 80;
    p.idade = 32;
    p.envelhecer();
    ok(p.idade === 33, 'idade deveria ser 33, veio ' + p.idade);
    ok(p.stats.VEL === 78, 'VEL deveria cair para 78, veio ' + p.stats.VEL);
    ok(p.overall === 80, 'queda de 2 em VEL (−0,29 de média) não deveria mexer no OVR inteiro: ' + p.overall);
    perto(p.ovrFracao, -2 / 7, 1e-6, 'a queda deveria ficar na fração');
});

teste('a fração do OVR persiste no save e restaura; save antigo sem o campo vira 0', () => {
    const s = novoSandbox();
    const p = new s.Player('MID');
    p.overall = 70;
    p.ovrFracao = 0.42;
    const salvo = JSON.parse(JSON.stringify(p));
    const restaurado = Object.assign(new s.Player(), salvo);
    perto(restaurado.ovrFracao, 0.42, 1e-9, 'fração não sobreviveu ao save');
    const antigo = JSON.parse(JSON.stringify(p));
    delete antigo.ovrFracao;
    const legado = Object.assign(new s.Player(), antigo);
    ok(legado.ovrFracao === 0, 'save antigo deveria cair em 0: ' + legado.ovrFracao);
    const fonte = fsT.readFileSync(pathT.join(__dirname, '..', 'index.html'), 'utf8');
    ok(fonte.indexOf('if (!Number.isFinite(bruto.ovrFracao)) p.ovrFracao = 0;') >= 0, '_restaurarJogador sem a guarda de ovrFracao');
});

teste('recalcularOverall() sem mudança de stat mantém o OVR', () => {
    const s = novoSandbox();
    const p = new s.Player('DEF');
    p.stats = { GK: 20, DEF: 20, MID: 20, ATT: 20, VEL: 20, PAS: 20, FIN: 20 };
    p.overall = 77;
    p.recalcularOverall();
    ok(p.overall === 77, 'OVR mudou sem mudança de stat: ' + p.overall);
});

teste('nome do clube com < > é sanitizado (createNewClub e input)', () => {
    const fonte = fsT.readFileSync(pathT.join(__dirname, '..', 'index.html'), 'utf8');
    const expr = "String(nome == null ? '' : nome).replace(/[<>]/g, '').trim().slice(0, 24) || 'Nacional FC'";
    ok(fonte.indexOf('this.club.nome = ' + expr + ';') >= 0, 'createNewClub não usa a sanitização do nome');
    ok(fonte.indexOf(`id="club-name-input" maxlength="24" placeholder="Ex: Nacional FC" oninput="this.value = this.value.replace(/[<>]/g, '')"`) >= 0, 'input do nome sem filtro de < >');
    const sanitizar = new Function('nome', 'return ' + expr + ';');
    ok(sanitizar('<b>Foo</b>') === 'bFoo/b', 'tags não saíram: ' + sanitizar('<b>Foo</b>'));
    ok(sanitizar('  <script>x  ') === 'scriptx', 'espaços/tags mal tratados: ' + sanitizar('  <script>x  '));
    ok(sanitizar('') === 'Nacional FC' && sanitizar(null) === 'Nacional FC', 'vazio não cai no padrão');
    ok(sanitizar('x'.repeat(40)).length === 24, 'nome não foi limitado a 24 caracteres');
});

teste('bônus do tutorial (R$ 50 mil + XP) é pago uma só vez por carreira', () => {
    const app = { club: null, saveGame() {} };
    const s = novoSandbox({ app });
    app.club = new s.Club('Teste', true);
    app.club.elenco = [new s.Player('MID'), new s.Player('DEF')];
    app.club.orcamento = 100000;
    ok(app.club.tutorialPago === false, 'tutorialPago deveria nascer false');
    s.TutorialManager.finish();
    ok(app.club.orcamento === 150000, 'primeiro treino deveria pagar R$ 50 mil: ' + app.club.orcamento);
    ok(app.club.tutorialPago === true, 'tutorialPago não foi marcado');
    const xp = () => app.club.elenco.map(p => p.nivel * 100000 + p.xp);
    const xpAntes = xp();
    s.TutorialManager._finishing = false;
    s.TutorialManager.finish();
    ok(app.club.orcamento === 150000, 'segundo treino pagou de novo: ' + app.club.orcamento);
    ok(JSON.stringify(xp()) === JSON.stringify(xpAntes), 'segundo treino concedeu XP de novo');
});

console.log('-- Lote 2: integridade de elenco, pênaltis, missões, janela, desafios, chave, cenários, IA×IA, import e limpeza (2026-10-21)');
const FONTE_HTML = fsT.readFileSync(pathT.join(__dirname, '..', 'index.html'), 'utf8');
// Trecho do código a partir de uma marca (verificação estática para o que vive no objeto `app`, fora do sandbox).
const trecho = (marca, n = 900) => { const i = FONTE_HTML.indexOf(marca); if (i < 0) throw new Error('marca não achada: ' + marca.slice(0, 50)); return FONTE_HTML.slice(i, i + n); };

teste('(a) elenco mínimo: venda recusa abaixo de 11 e o fim de temporada não deixa menos de 11', () => {
    ok(trecho('    confirmSell() {').indexOf('_sairPermitido(1)') >= 0, 'confirmSell não confere o mínimo');
    ok(trecho('    acceptOffer(playerId) {').indexOf('_sairPermitido(1)') >= 0, 'acceptOffer não confere o mínimo');
    ok(trecho('    _sairPermitido(qtd)', 200).indexOf('>= 11') >= 0, 'o limite não é 11');
    ok(trecho('    closeMatchResult() {', 9000).indexOf('faltamParaMinimo') >= 0, 'contratos vencendo não renovam para 11');
    ok(trecho('    startNewSeason() {', 4000).indexOf('velhosFicam') >= 0, 'aposentadoria pode deixar o elenco abaixo de 11');
    ok(FONTE_HTML.indexOf('Elenco mínimo: 11 jogadores') >= 0, 'falta o toast de elenco mínimo');
});

teste('(b) pênaltis: empate após 20 cobranças vai à morte súbita e nunca devolve empate', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70), fora = makeTeam('Fora', 70);
    const sim = new s.MatchSim(casa, fora, null, () => { }, { seed: 5, modo: 'detalhado', tempoMin: 90, minDurMs: 0 });
    sim._emCampo = [sim._xiDoTime(casa), sim._xiDoTime(fora)];
    sim.rng = () => 0.999; // todo mundo erra: a disputa só termina pelo teto
    let pen = null;
    sim._disputaPenaltis(p => { pen = p; });
    s.drenarTimers();
    ok(pen, 'a disputa não terminou');
    ok(pen.h !== pen.a, 'devolveu empate: ' + pen.h + '–' + pen.a);
    ok(pen.a === 1 && pen.h === 0, 'sorteio deveria dar o gol ao visitante neste rng: ' + pen.h + '–' + pen.a);
});

teste('(c) missões de gols contam só o que vem depois da criação e não repetem o tipo já pago', () => {
    const s = novoSandbox();
    const club = new s.Club('Teste', true);
    club.golsPro = 50;
    let m; do { m = club._novaMissao(); } while (m.tipo !== 'gols');
    ok(m.base === 50, 'base deveria ser 50, veio ' + m.base);
    club.missoes = [m];
    m.meta = 2; // meta sorteada (6-12) fixada para o teste
    club.checkMissoes('gols', 1);
    ok(m.progresso === 0 && !m.concluida, 'gol antigo contou como progresso: ' + m.progresso);
    club.golsPro = 51; club.checkMissoes('gols', 1);
    ok(m.progresso === 1, 'progresso deveria ser 1, veio ' + m.progresso);
    const premio = m.premio, orc0 = club.orcamento;
    club.golsPro = 52; club.checkMissoes('gols', 1);
    ok(club.orcamento === orc0 + premio, 'prêmio deveria ser pago uma vez: ' + (club.orcamento - orc0));
    ok(m.tipo !== 'gols', 'rotação repetiu o tipo da missão paga');
    club.checkMissoes('gols', 1);
    ok(club.orcamento === orc0 + premio, 'prêmio foi pago de novo');
    ok(FONTE_HTML.indexOf("typeof club._missionProgress === 'function'") >= 0 && FONTE_HTML.indexOf("typeof m.base !== 'number') m.base") >= 0, 'migração de base em normalizeNewFields sumiu');
});

teste('(d) quem entra de graça ganha a janela de uma rodada (chegouEm) em todos os pontos', () => {
    const marcas = (FONTE_HTML.match(/_marcarChegada\(/g) || []).length;
    ok(marcas >= 7, 'poucos pontos marcam chegada: ' + marcas);
    ok(FONTE_HTML.indexOf('this.club.elenco.push(p);') < 0, 'ainda há push de jogador sem marcar chegada');
    ok(FONTE_HTML.indexOf('this.club.elenco.push(reward);') < 0 && FONTE_HTML.indexOf('app.club.elenco.push(player);') < 0, 'recompensa sem marcar chegada');
});

teste('(e) retornos antecipados de playMatch limpam as flags de desafio; partida ativa não mexe nelas', () => {
    const corpo = trecho('    playMatch() {', 2200);
    const antesDaPartida = corpo.slice(0, corpo.indexOf('Partida em andamento'));
    ok((antesDaPartida.match(/_limparFlagsDesafio\(\)/g) || []).length >= 2, 'temporada/demissão sem limpar flags');
    ok(corpo.slice(corpo.indexOf('Partida em andamento'), corpo.indexOf('Partida em andamento') + 40).indexOf('_limparFlagsDesafio') < 0, 'partida ativa limpou a flag do desafio em curso');
});

teste('(f) chave da Copa/Continental: resultado gravado no índice do par (vencedor do usuário não embaralha)', () => {
    const corpo = trecho('    play(kind) {', 3000);
    ok(corpo.indexOf('scores[i]=result(pair,r.h,r.a)') >= 0, 'jogos da IA ainda entram por push na ordem de chegada');
    ok(corpo.indexOf('scores[pairs.indexOf(userPair)]=result(userPair,h,a,pen)') >= 0, 'jogo do usuário ainda vai para o fim');
    ok(corpo.indexOf('scores.filter(Boolean)') >= 0, 'settle não recebe o array sem buracos');
});

teste('(g) cenários: milagre usa estilo ofensivo, seed por tentativa e tem solução; dez heróis varia', () => {
    ok(FONTE_HTML.indexOf("minuto:80,placar:[0,1],vermelho:0,estilo:'ofensivo'") >= 0, 'milagre sem estilo ofensivo');
    ok(FONTE_HTML.indexOf('93821+scenario.minuto+tentativa*7919') >= 0, 'seed ainda fixa');
    const s = novoSandbox();
    const jogar = (minuto, placar, vermelho, estilo, t) => {
        const casa = new s.Club('Heróis do Rádio', true), fora = new s.Club('Gigantes da Serra', false);
        let res = null;
        const sim = new s.MatchSim(casa, fora, null, (h, a, pen) => { res = { h, a }; }, {
            startMinute: minuto, startScore: placar, startRedUser: vermelho, tempoMin: 90,
            seed: 93821 + minuto + t * 7919, modo: 'detalhado', minDurMs: 0, estilo
        });
        sim.start(); s.drenarTimers();
        return res;
    };
    let virou = 0;
    for (let t = 1; t <= 30; t++) { const r = jogar(80, [0, 1], 0, 'ofensivo', t); if (r && r.h >= r.a) virou++; }
    ok(virou >= 1, 'milagre sem nenhuma solução em 30 tentativas');
    const desfechos = new Set();
    for (let t = 1; t <= 30; t++) { const r = jogar(75, [1, 2], 1, 'equilibrado', t); if (r) desfechos.add(r.h > r.a ? 'V' : r.h === r.a ? 'E' : 'D'); }
    ok(desfechos.size >= 2, 'dez heróis não varia: ' + [...desfechos].join(''));
});

teste('(h) IA×IA: nenhum lado é do usuário; o mandante não herda o estilo do usuário', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { formacao: '4-3-3', mentalidade: 'equilibrada' });
    const fora = makeTeam('Fora', 70, { formacao: '4-4-2', mentalidade: 'equilibrada' });
    const sim = new s.MatchSim(casa, fora, null, () => { }, { seed: 3, modo: 'detalhado', minDurMs: 0, estilo: 'ofensivo' });
    ok(sim._eUsuario(0) === false && sim._eUsuario(1) === false, 'IA×IA marcou um lado como usuário');
    ok(sim._contratatica(0) === 1, 'mandante IA herdou o estilo ofensivo do usuário: ' + sim._contratatica(0));
    const casaU = makeTeam('Casa', 70, { isUser: true, formacao: '4-3-3', mentalidade: 'equilibrada' });
    const simU = new s.MatchSim(casaU, fora, null, () => { }, { seed: 3, modo: 'detalhado', minDurMs: 0, estilo: 'ofensivo' });
    ok(simU._eUsuario(0) === true, 'o mandante do usuário não é reconhecido');
    ok(simU._contratatica(0) === 1.2, 'estilo do usuário não vale no mandante do usuário: ' + simU._contratatica(0));
});

teste('(i) importar save pede confirmação quando o slot de destino já tem carreira', () => {
    const corpo = trecho('    _handleImportFile(file) {', 3000);
    ok(corpo.indexOf('this.hasSaveInSlot(slotDestino)') >= 0, 'não checa se o slot já tem carreira');
    ok(corpo.indexOf("confirm('O slot ' + slotDestino") >= 0, 'não pede confirmação');
    ok(corpo.indexOf('Importação cancelada') >= 0, 'não cancela a importação ao recusar');
});

teste('(j) limpeza: sem referências a minigame removido, sem log de boot e sem comentário de base64 obsoleto', () => {
    ok(FONTE_HTML.indexOf('ui-minigame-container') < 0, 'ainda há referência a ui-minigame-container');
    ok(FONTE_HTML.indexOf('_mgSweepTimer') < 0, 'ainda há _mgSweepTimer');
    ok(FONTE_HTML.indexOf('AltFoot Elite Initializing') < 0, 'log de boot ainda existe');
    ok(FONTE_HTML.indexOf('Mídias embutidas em base64') < 0 && FONTE_HTML.indexOf('o base64 continua inline') < 0, 'comentário obsoleto de base64 ainda existe');
});

console.log('-- Lote 3: balanceamento (decisão, prestígio, demissão, contrato, infraestrutura, ofertas, draft) (2026-10-21)');

teste('3.1 decisão: vetores de defesa somam ~0 por coluna e a melhor opção muda por contexto', () => {
    const ajusteDe = (ctx) => {
        const i = FONTE_HTML.indexOf(ctx + ': { texto:');
        if (i < 0) throw new Error('contexto não achado: ' + ctx);
        const m = /ajuste: \[([^\]]+)\]/.exec(FONTE_HTML.slice(i, i + 900));
        return m[1].split(',').map(Number);
    };
    const vetores = ['area', 'transicao', 'corredor'].map(ajusteDe);
    for (let c = 0; c < 3; c++) {
        const soma = vetores.reduce((a, v) => a + v[c], 0);
        ok(Math.abs(soma) < 0.001, 'coluna ' + c + ' da defesa não soma ~0: ' + soma.toFixed(3));
    }
    const melhores = vetores.map(v => v.indexOf(Math.min(...v)));
    ok(new Set(melhores).size === 3, 'a melhor opção defensiva não muda por contexto: ' + melhores.join(','));
});

teste('3.6 prestígio: degraus 150/300/500 desbloqueiam e o resumo mostra o próximo', () => {
    const s = novoSandbox();
    const MP = s.MetaProgress;
    MP.salvar(Object.assign(MP.padrao(), { prestigio: 160 }));
    ok(MP.desbloqueado('tatica') === true && MP.desbloqueado('olheiro') === false, 'degrau 150 não desbloqueou só a tática');
    ok(MP.resumo().indexOf('próximo degrau 300') >= 0, 'resumo não mostra o próximo degrau');
    MP.salvar(Object.assign(MP.padrao(), { prestigio: 500 }));
    ok(MP.desbloqueado('faixa') === true, 'degrau 500 não desbloqueou a faixa');
    MP.salvar(MP.padrao());
    ok(MP.desbloqueado('tatica') === false, 'sem prestígio, degrau não deveria desbloquear');
});

teste('3.4 elenco inicial de carreira nova assina contrato de 20 a 44 rodadas (lote 5)', () => {
    const s = novoSandbox();
    const clube = new s.Club('Clube Teste', true);
    ok(clube.elenco.length >= 11, 'elenco inicial curto');
    clube.elenco.forEach(p => ok(p.contratoRodadas >= 20 && p.contratoRodadas <= 44, 'contrato fora de 20–44: ' + p.contratoRodadas));
});

teste('3.5 demissão: sem demissão até a rodada 10; depois da carência, a confiança baixa demite', () => {
    const s = novoSandbox();
    const monta = (rodada) => {
        const lg = new s.League(); lg.inicializar();
        const cl = lg.clubes[0]; cl.isUser = true; cl.pacienciaDiretoria = 5; cl.rodadasDiretoriaCritica = 2;
        lg.rodada = rodada; lg.temporada = 1;
        return { cl, lg };
    };
    const a = monta(5);
    s.ClubEcosystem.afterRound(a.cl, a.lg, { meusGols: 0, golsAdv: 1, userHome: true });
    ok(a.cl.demitido !== true, 'demitiu dentro da carência (rodada 5)');
    const b = monta(11);
    b.lg.temporada = 2; // carência de T2+ é 10 (na T1 é 14, lote 8/P4)
    s.ClubEcosystem.afterRound(b.cl, b.lg, { meusGols: 0, golsAdv: 1, userHome: true });
    ok(b.cl.demitido === true, 'não demitiu depois da carência (rodada 11) com confiança crítica');
});

teste('3.2 infraestrutura: manutenção cresce com o nível acima de 1 e para no nível 5', () => {
    const s = novoSandbox();
    const c = new s.Club('X', true);
    c.fans = 50; c.etica = 50;
    c.estadioNivel = 1; c.baseNivel = 1;
    ok(c.manutencaoInfra() === 0, 'nível 1 não deveria pagar manutenção');
    c.estadioNivel = 3; c.baseNivel = 2;
    ok(c.manutencaoInfra() === 2 * 6000 + 25000, 'manutenção de nível 3/2 errada: ' + c.manutencaoInfra());
    c.estadioNivel = 9; c.baseNivel = 9;
    ok(c.manutencaoInfra() === 4 * 6000 + 4 * 25000, 'manutenção não parou no teto de nível 5: ' + c.manutencaoInfra());
    ok(FONTE_HTML.indexOf('Nível máximo (5) atingido.') >= 0, 'compra de infraestrutura sem teto de nível 5');
});

teste('3.2 ofertas: teto de 1,2× valor de mercado, sem oferta por jogador que chegou nesta rodada ou não jogou', () => {
    ok(FONTE_HTML.indexOf('Math.min(1.2, (0.9 + Math.random() * 0.3) * multFimContrato)') >= 0, 'oferta sem teto de 1,2×');
    ok(FONTE_HTML.indexOf('(p.partidas || 0) > 0 && p.chegouEm !== chaveAtual') >= 0, 'oferta sem filtro de partidas/chegada');
});

teste('3.3 dificuldade: draft limitado a 3 níveis de ascensão e rival +3 por nível', () => {
    ok(FONTE_HTML.indexOf('Math.min(asc, 3) * 2') >= 0, 'draft sem o teto de 3 níveis');
    ok(FONTE_HTML.indexOf('const ajuste = (multiplicador - 1) * 24 + asc * 3 + campanha;') >= 0, 'rival da ascensão não está em +3');
});

teste('3.7 draft pula quando nenhum jogador melhora o XI; olheiro com chance ≤ 0,45', () => {
    ok(FONTE_HTML.indexOf("ui.showActionFeedback('Sem reforço relevante', 'info');") >= 0, 'draft irrelevante não pula com toast');
    ok(FONTE_HTML.indexOf('Math.min(0.45, 0.15 + (this.club.baseNivel - 1) * 0.12)') >= 0, 'chance do olheiro sem teto 0,45');
});

teste('3.8 desafios não começam com partida ativa (diário, clássico, torneio)', () => {
    const n = (FONTE_HTML.match(/Partida em andamento — termine antes de outro desafio\./g) || []).length;
    ok(n === 3, 'esperava 3 guardas nos desafios, achei ' + n);
});

console.log('-- Lote 4: passivo/folha, copa, dificuldade, contratos, demissão, IA×IA, UX e faixa (2026-10-21)');

teste('4.8 IA×IA: nenhuma comparação de lado usa o usuário fixo (_userSide) no motor de partida', () => {
    const n = (FONTE_HTML.match(/side === this\._userSide\(\)|side !== this\._userSide\(\)/g) || []).length;
    ok(n === 0, 'ainda há ' + n + ' comparações de lado com _userSide');
    ok((FONTE_HTML.match(/this\._eUsuario\(/g) || []).length >= 15, 'poucos usos de _eUsuario');
});

teste('4.1 passivo: poda de elenco com teto de folha, fora do XI e mínimo de 11; empréstimo de emergência', () => {
    ok(FONTE_HTML.indexOf('_podarElenco() {') >= 0 && FONTE_HTML.indexOf('this._podarElenco()') >= 0, 'poda não está ligada à virada');
    ok(FONTE_HTML.indexOf('const PISO = 14;') >= 0 && FONTE_HTML.indexOf('gks() <= 2') >= 0, 'poda não respeita o piso de 14 e os 2 goleiros');
    ok(FONTE_HTML.indexOf('Empréstimo de emergência automático') >= 0, 'falta a rede de segurança de empréstimo');
    ok(FONTE_HTML.indexOf('pos === 1 ? 6000000 : pos === 2 ? 4000000') >= 0, 'prêmio de liga da Série A não foi subido');
});

teste('4.2 copa/continental: prêmio cortado e imposto em faixas (B144)', () => {
    ok(FONTE_HTML.indexOf('[250000,375000,500000,875000,1500000,3000000][c.etapa]') >= 0, 'prêmio de copa não cortado');
    ok(FONTE_HTML.indexOf('[750000,1500000,3750000][c.etapa - 6]') >= 0, 'prêmio continental não cortado');
    ok(FONTE_HTML.indexOf('Imposto sobre o caixa acima de R$ 15 M') >= 0 && FONTE_HTML.indexOf('Math.min(caixaImposto, 30000000) - 15000000) * 0.15') >= 0, 'sem imposto progressivo em faixas');
});

teste('4.3 dificuldade: no máximo um draft por temporada; propostas menos frequentes', () => {
    ok(FONTE_HTML.indexOf("this.club.draftTemporada = temporadaAtual") >= 0 && FONTE_HTML.indexOf('Draft desta temporada já foi usado.') >= 0, 'draft sem teto por temporada');
    ok(FONTE_HTML.indexOf('if (Math.random() > 0.25) continue;') >= 0, 'ofertas ainda com 55%');
});

teste('4.4 contratos: alerta de titular com ≤3 rodadas (toast e selo vermelho no elenco)', () => {
    ok(FONTE_HTML.indexOf('Titular com contrato acabando') >= 0, 'falta o toast de contrato acabando');
    ok(FONTE_HTML.indexOf('⚠️ Contrato ${Math.max(0, p.contratoRodadas)}R') >= 0, 'falta o selo no elenco');
});

teste('4.5 demissão: caixa negativo não demite antes da T4; carência de 10 rodadas mantida', () => {
    ok(FONTE_HTML.indexOf('const caixaNaoDemite = club.orcamento < 0 && (league.temporada || 1) < 4;') >= 0, 'sem a regra de caixa negativo até T4');
    ok(FONTE_HTML.indexOf('!caixaNaoDemite') >= 0 && FONTE_HTML.indexOf('> carencia && !caixaNaoDemite') >= 0, 'regra não entra na condição de demissão');
});

teste('4.9 UX: focus-trap usa o modal do topo (maior z-index); rótulo do campo ≥0,5 rem e oculto até 480px', () => {
    ok(FONTE_HTML.indexOf('const aberto = abertos.reduce(') >= 0, 'focus-trap ainda pega o primeiro modal do DOM');
    ok(FONTE_HTML.indexOf('font-size: 0.42rem;') < 0, 'rótulo do campo ainda em 0,42 rem');
    ok(/@media \(max-width: 480px\) \{\r?\n\s+\.campo-chip \.chip-label \{ display: none; \}/.test(FONTE_HTML), 'rótulo do campo não some até 480px');
});

teste('4.10 faixa de capitão (prestígio 500) aparece no menu, sem backdrop-filter nessa parte', () => {
    ok(FONTE_HTML.indexOf('id="menu-faixa"') >= 0 && FONTE_HTML.indexOf("MetaProgress.desbloqueado('faixa')") >= 0, 'faixa não exibida no menu');
    ok(FONTE_HTML.indexOf('menu-faixa') > -1 && FONTE_HTML.slice(FONTE_HTML.indexOf('id="menu-faixa"'), FONTE_HTML.indexOf('id="menu-faixa"') + 400).indexOf('backdrop-filter') < 0, 'faixa usa backdrop-filter');
});

console.log('-- Lote 5: harness de carreira com as funções reais do app (tests/carreira.js)');

teste('carreira: o sandbox carrega o objeto app real e uma rodada de jogo roda sem erro', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app, Engine } = sb;
    ok(typeof app.generateOffers === 'function' && typeof app.closeMatchResult === 'function' && typeof app.startNewSeason === 'function', 'app real não carregou');
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste de Carreira');
    ok(app.club && app.league && app.club.elenco.length >= 11, 'clube/liga não criados pelo fluxo real');
    app.club.patrocinio = { id: 'p_fixo', nome: 'Teste', tipo: 'fixo', fixo: 40000, ativo: true, legado: false, metas: [] };
    app._estiloPartida = 'equilibrado';
    app.playMatch();
    app.confirmarPreparacao();
    sb.drenarTimers();
    ok(!Engine.activeMatch && app._resultadoPendente === true, 'a partida real não terminou');
    app.closeMatchResult();
    ok(app.league.rodada === 2, 'a rodada não avançou pelo fluxo real: ' + app.league.rodada);
});

console.log('-- Lote 8: fadiga proporcional, IA recupera, pré-temporada, diretoria e desafio que não cobra rodada');

teste('P5: desafio não passa a rodada — folhas pagas = rodadas de liga mesmo com desafios no meio', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app, Club } = sb;
    let folhas = 0;
    const orig = Club.prototype.pagarSalarios;
    Club.prototype.pagarSalarios = function () { folhas++; return orig.call(this); };
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste P5');
    app.club.patrocinio = { id: 'p_fixo', nome: 'Teste', tipo: 'fixo', fixo: 40000, ativo: true, legado: false, metas: [] };
    const rodadaLiga = () => {
        app._estiloPartida = 'equilibrado';
        app.playMatch(); app.confirmarPreparacao(); sb.drenarTimers();
        if (app._resultadoPendente) { app.closeMatchResult(); sb.drenarTimers(); }
    };
    const desafio = () => {
        app.lastResult = { h: 1, a: 0, adv: 'X' }; app._resultadoPendente = true; app._isDesafio = true;
        app.closeMatchResult(); sb.drenarTimers();
    };
    rodadaLiga(); rodadaLiga(); rodadaLiga();
    const ligaAntes = folhas;
    desafio(); desafio();
    rodadaLiga();
    ok(ligaAntes === 3, 'folhas da liga antes dos desafios: ' + ligaAntes);
    ok(folhas === 4, 'desafio cobrou folha: folhas=' + folhas + ' (esperado 4 = rodadas de liga)');
    ok(app.league.rodada === 5, 'rodada da liga deveria ser 5, veio ' + app.league.rodada);
});

teste('P1: recuperação de fôlego é proporcional ao déficit (75% do que falta)', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app } = sb;
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste P1');
    app.club.elenco.forEach(p => { p.folego = 40; p.folegoMax = 100; });
    app.club.ultimaRecuperacaoFadiga = '';
    app.recuperarFadiga();
    const f = app.club.elenco[0].folego;
    ok(Math.abs(f - 85) < 0.01, 'fôlego deveria ser 40 + 60×0,75 = 85, veio ' + f);
});

teste('P3: pré-temporada devolve o fôlego máximo a todo elenco (sem campo novo)', () => {
    ok(FONTE_HTML.indexOf('Lote 8 (P3): pré-temporada') >= 0 && FONTE_HTML.indexOf('p.folego = p.folegoMax == null ? 100 : p.folegoMax;') >= 0, 'P3 não aplicado no startNewSeason');
});

teste('P2: a IA também recupera fôlego, sem contar em desafio', () => {
    ok(FONTE_HTML.indexOf('Lote 8 (P2): a IA também recupera') >= 0 && FONTE_HTML.indexOf('if (!desafio && this.league && typeof CompetitionSystem') >= 0, 'P2 não aplicado');
});

teste('P4 diretoria: derrota −7; carência de 14 rodadas na T1 para todas as dificuldades', () => {
    ok(FONTE_HTML.indexOf('perdeu ? -7 : 1') >= 0, 'derrota da diretoria não é −7');
    ok(FONTE_HTML.indexOf('const carencia = ((divCarencia > 1 || lendaCarencia) && (league.temporada || 1) <= 2) ? 38 : ((league.temporada || 1) === 1 ? 14 : 10);') >= 0, 'carência de D/Lenda em T1–T2 não é 38, ou a da A não é 14/10');
});

console.log('-- Lote 9: copa recupera fôlego, IA simétrica, Implacável com custo, cartas e carência de D/Lenda');

teste('A: partida de copa do usuário recupera fôlego (mesma fórmula 0,75 + médico) e a copa é chamada após o jogo', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app } = sb;
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste A');
    app.club.elenco.forEach(p => { p.folego = 40; p.folegoMax = 100; });
    app._recuperarFolegoCopa();
    ok(Math.abs(app.club.elenco[0].folego - 85) < 0.01, 'copa deveria recuperar 40 → 85, veio ' + app.club.elenco[0].folego);
    ok(FONTE_HTML.indexOf('app._recuperarFolegoCopa(); Engine.activeMatch=null; finish();') >= 0, 'copa não chama a recuperação após o jogo do usuário');
});

teste('B: clone da IA começa a partida com desgaste (fôlego 100 − U(6,16)), sem tocar o usuário', () => {
    ok(FONTE_HTML.indexOf('if (!t.isUser) c.folego = Math.max(5, 100 - (6 + rng() * 10));') >= 0, 'simetria de fadiga da IA ausente');
});

teste('C: Implacável tem custo real (−4 de fôlego no XI e −4 de moral) e o texto avisa', () => {
    ok(FONTE_HTML.indexOf('team.moral = valor(team.moral,-4);') >= 0, 'Implacável sem perda de moral');
    ok(FONTE_HTML.indexOf("hint: 'Finalizar · custa 4 de fôlego do XI, 4 de moral e risco de briga e cartões'") >= 0, 'texto da opção não avisa o custo');
});

teste('D: cartas Pressão, Contra e Muralha com duração de 25 min; Muralha reduz também a qualidade das chances rivais', () => {
    ok(FONTE_HTML.indexOf("const dur = card.id === 't_pressao' ? 25") >= 0, 'duração da Pressão não é 25');
    ok(FONTE_HTML.indexOf('efeito: { durMin: 25, difA: 5, difD: 0, flavor: "⚡ Contra') >= 0, 'duração do Contra não é 25');
    ok(FONTE_HTML.indexOf('* muralhaRival // Lote 9 (D)') >= 0, 'Muralha não atua na qualidade');
});

teste('carência da diretoria: D e Lenda sem demissão em T1–T2; passivo/gestor da A mantêm 14 e 10', () => {
    ok(FONTE_HTML.indexOf('const carencia = ((divCarencia > 1 || lendaCarencia) && (league.temporada || 1) <= 2) ? 38 :') >= 0, 'carência de D/Lenda não é 38 em T1–T2');
});

console.log('-- Lote 10: semente própria na T1, manutenção sem caixa negativo e medição de carreira');

teste('League() tem semente numérica finita desde a T1; duas carreiras novas têm sementes diferentes', () => {
    const s = novoSandbox();
    const a = new s.League(), b = new s.League();
    ok(Number.isFinite(a.seed) && typeof a.seed === 'number', 'League sem semente: ' + a.seed);
    ok(a.seed !== b.seed, 'duas carreiras novas com a mesma semente');
});

teste('manutenção só sai de caixa positivo: caixa 100 mil com folha 50 mil e infra nível 5/5 fica em 0, não negativo', () => {
    const s = novoSandbox();
    const c = new s.Club('X', true);
    c.estadioNivel = 5; c.baseNivel = 5; c.orcamento = 100000;
    c.elenco = [{ salario: 50000, overall: 60 }];
    c.pagarSalarios();
    ok(c.orcamento === 0, 'caixa deveria ficar em 0, veio ' + c.orcamento);
});

teste('com caixa de 10 M, a rodada desconta folha e a manutenção inteira (124 mil no nível 5/5, B142)', () => {
    const s = novoSandbox();
    const c = new s.Club('X', true);
    c.estadioNivel = 5; c.baseNivel = 5; c.orcamento = 10000000;
    c.elenco = [{ salario: 50000, overall: 60 }];
    c.pagarSalarios();
    ok(c.orcamento === 10000000 - 50000 - 124000, 'desconto errado: ' + c.orcamento);
});

teste('B142: manutenção (estádio 60% do ganho por nível, base 25 mil, teto 5)', () => {
    const s = novoSandbox();
    const c = new s.Club('X', true);
    c.estadioNivel = 1; c.baseNivel = 1;
    ok(c.manutencaoInfra() === 0, 'nível 1 deveria custar 0');
    c.estadioNivel = 9; c.baseNivel = 9;
    ok(c.manutencaoInfra() === 4 * 6000 + 4 * 25000, 'teto 5 quebrado: ' + c.manutencaoInfra());
    // NaN de save antigo não pode contaminar o orçamento: vira o padrão (50) e o resultado continua finito.
    const d = new s.Club('Y', true);
    d.estadioNivel = 3; d.baseNivel = 2; d.fans = NaN; d.etica = NaN;
    ok(Number.isFinite(d.manutencaoInfra()), 'manutenção com fans/etica NaN não é finita: ' + d.manutencaoInfra());
    ok(d.manutencaoInfra() === 2 * 6000 + 25000, 'NaN em fans/etica deveria cair no padrão 50: ' + d.manutencaoInfra());
});

teste('B142: invariante — estádio rende mais bilheteria por temporada do que custa de manutenção (19 casas × ganho vs 38 rodadas × custo, por nível)', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app } = sb;
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste Invariante B142');
    const clube = app.club;
    clube.isUser = true;
    for (const fans of [0, 50, 100]) for (const etica of [0, 100]) for (const asc of [0, 3, 9]) {
        clube.fans = fans; clube.etica = etica; clube.ascensaoNivel = asc;
        clube.estadioNivel = 1; const r1 = clube.stadiumRevenue(), m1 = clube.manutencaoInfraPartes().estadio;
        clube.estadioNivel = 5; const r5 = clube.stadiumRevenue(), m5 = clube.manutencaoInfraPartes().estadio;
        const ganhoTemp = 19 * (r5 - r1) / 4; // ganho de bilheteria por nível, só em jogo em casa
        const custoTemp = 38 * (m5 - m1) / 4; // manutenção do estádio por nível, em todas as rodadas
        ok(ganhoTemp > custoTemp, `torcida ${fans} ética ${etica} ascensão ${asc}: ganho ${ganhoTemp} não supera custo ${custoTemp}`);
    }
});

console.log('-- B142/B143/B144: economia de caixa (manutenção, ascensão e imposto) com as funções reais');

teste('B143: a bilheteria cai 10% por nível de ascensão, com piso 0,8; o valor guardado não muda', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app } = sb;
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste Bilheteria');
    const clube = app.club;
    // Só a bilheteria base (estádio 1 = R$ 15 mil por rodada): sem patrocínio, sem mídia e sem camarote.
    clube.estadioNivel = 1; clube.patrimonio = 0; clube.patrocinio = null; clube.fans = 50; clube.etica = 50;
    const bilheteria = (n) => { clube.ascensaoNivel = n; return clube.stadiumRevenue(); };
    ok(bilheteria(0) === 15000, 'sem ascensão deveria render 15 mil: ' + bilheteria(0));
    ok(bilheteria(3) === 12000, 'nível 3 deveria render 12 mil (piso 0,8), veio ' + bilheteria(3));
    ok(bilheteria(5) === 12000, 'nível 5 deveria render 12 mil (piso 0,8), veio ' + bilheteria(5));
    ok(bilheteria(9) === 12000, 'nível 9 deveria render 12 mil (piso 0,8), veio ' + bilheteria(9));
    ok(clube.ascensaoNivel === 9, 'o valor guardado de ascensão foi alterado: ' + clube.ascensaoNivel);
});

teste('B143: o rival sente a ascensão até 5 níveis (+15 em atk) e não passa disso; o valor guardado não muda', () => {
    const s = novoSandbox();
    const casa = makeTeam('Casa', 70, { isUser: true });
    const sim = new s.MatchSim(casa, makeTeam('Fora', 70), null, null, { seed: 2, modo: 'detalhado', tempoMin: 90 });
    const atkRival = (n) => { casa.ascensaoNivel = n; return sim._poder(sim.away, false).atk; };
    const base = atkRival(0);
    perto(atkRival(3) - base, 9, 1e-6, 'nível 3 deveria dar +9 ao rival');
    perto(atkRival(5) - base, 15, 1e-6, 'nível 5 deveria dar +15 ao rival');
    perto(atkRival(9) - base, 15, 1e-6, 'nível 9 deveria ficar no teto de +15');
    ok(casa.ascensaoNivel === 9, 'o valor guardado foi alterado: ' + casa.ascensaoNivel);
});

teste('B144: imposto em faixas (15% de R$ 15 M a 30 M; 30% acima de R$ 30 M) no início da temporada', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    // Caixa antes e depois do imposto: o imposto sai antes da poda (_podarElenco), que é o gancho medido.
    const imposto = (caixa) => {
        const sb = novoSandboxCarreira();
        const { app } = sb;
        app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
        app.createNewClub('Teste Imposto');
        app.club.orcamento = caixa;
        app.league.resumoTemporada = { temporada: app.league.temporada };
        let depois = null;
        app._podarElenco = () => { depois = app.club.orcamento; };
        app.startNewSeason();
        if (depois === null) throw new Error('startNewSeason não chegou ao imposto/poda');
        return caixa - depois;
    };
    ok(imposto(10000000) === 0, '10 M não deveria pagar imposto: ' + imposto(10000000));
    ok(imposto(20000000) === 750000, '20 M: 15% de 5 M = 750 mil, veio ' + imposto(20000000));
    ok(imposto(40000000) === 5250000, '40 M: 15% de 15 M + 30% de 10 M = 5,25 M, veio ' + imposto(40000000));
    ok(imposto(100000000) === 23250000, '100 M: 15% de 15 M + 30% de 70 M = 23,25 M, veio ' + imposto(100000000));
});

console.log('-- SAF: aceite da proposta (ClubEcosystem.aceitarSAF) com as funções reais');

teste('SAF: aceitar zera caixa negativo e empréstimos, ativa 3 temporadas de 40% e o prazo acaba', () => {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app, ClubEcosystem } = sb;
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub('Teste SAF');
    const clube = app.club;
    clube.temporadaEconomica = 1;
    clube.orcamento = -800000;
    clube.emprestimos = [{ saldo: 300000, rodadas: 12, amortizacao: 25000 }, { saldo: 200000, rodadas: 8, amortizacao: 25000 }];
    clube.rodadasNegativo = 3; // pré-requisito da oferta (afterRound liga ofertaSAF com 3+ rodadas negativas)
    clube.ofertaSAF = true;
    clube.safTemporadas = 0;
    const r = ClubEcosystem.aceitarSAF(clube);
    ok(r.ok === true, 'aceitarSAF recusou: ' + r.mensagem);
    ok(clube.orcamento === 0, 'orçamento negativo não foi zerado: ' + clube.orcamento);
    ok(clube.emprestimos.length === 0, 'empréstimos não foram limpos: ' + clube.emprestimos.length);
    ok(clube.safTemporadas === 3, 'safTemporadas deveria ser 3, veio ' + clube.safTemporadas);
    ok(clube.ofertaSAF === false, 'a proposta não foi consumida');
    ok(ClubEcosystem.aceitarSAF(clube).ok === false, 'aceitou a SAF duas vezes');
    const pago = ClubEcosystem.premio(clube, 1000000);
    ok(pago === 600000, 'desconto de 40% não aplicado: recebeu ' + pago);
    ok(clube.safDescontado === 400000, 'total cedido ao fundo errado: ' + clube.safDescontado);
    // Prazo: cada virada de temporada após a inicial consome 1; em 3 viradas a SAF acaba.
    ClubEcosystem.newSeason(clube, { temporada: 2 });
    ok(clube.safTemporadas === 2, 'após T2 deveria restar 2, veio ' + clube.safTemporadas);
    ClubEcosystem.newSeason(clube, { temporada: 3 });
    ClubEcosystem.newSeason(clube, { temporada: 4 });
    ok(clube.safTemporadas === 0, 'SAF não acabou após 3 temporadas: ' + clube.safTemporadas);
    ok(ClubEcosystem.premio(clube, 1000000) === 1000000, 'desconto continuou após o fim da SAF');
});

console.log('-- B146/B147: exploits de economia (Rodada do Dia, Clássico e patrocínio) com as funções reais');

// Carreira nova com contrato de patrocínio (sem ele o jogo abre o modal antes de entrar em campo).
function carreiraEconomia(nome) {
    const { novoSandboxCarreira } = require('./carreira-lib.js');
    const sb = novoSandboxCarreira();
    const { app, PATROCINIOS } = sb;
    app.saveGame = () => {}; app.autosaveNow = () => {}; app._registrarSessao = () => {};
    app.createNewClub(nome);
    app.club.orcamento = 5000000;
    app.club.patrocinio = JSON.parse(JSON.stringify(PATROCINIOS.find(p => (p.metas || []).length)));
    app.club.patrocinio.metas.forEach(m => { m.pago = false; m.progresso = 0; });
    return sb;
}
// Dispara o desafio pelo caminho real (playDesafioDia/playClassicoSemana → confirmarPreparacao → fim da partida).
// Vitória 2×0 simulada no motor; devolve 'bloqueado' ou o ganho de elenco (1 = jogador do prêmio).
function dispararDesafio(sb, tipo) {
    const { app, Engine } = sb;
    const antes = app.club.elenco.length;
    Engine.simulateFriendly = (lg, cl, adv, onTick, onFinish) => onFinish(2, 0, 0, [], null);
    if (tipo === 'daily') app.playDesafioDia(); else app.playClassicoSemana();
    if (!app._isDaily && !app._isClassico) return 'bloqueado';
    app.confirmarPreparacao();
    sb.drenarTimers();
    return app.club.elenco.length - antes;
}

teste('B146(1): Rodada do Dia com chave de data nova e sem histórico está disponível e paga o prêmio', () => {
    const sb = carreiraEconomia('Teste B146 a');
    sb.app._dailyChallengeKey = () => 20261028;
    ok(dispararDesafio(sb, 'daily') === 1, 'Rodada do Dia livre não pagou o prêmio');
});

teste('B146(2): depois do prêmio, a mesma data fica indisponível e não paga de novo', () => {
    const sb = carreiraEconomia('Teste B146 b');
    sb.app._dailyChallengeKey = () => 20261028;
    ok(dispararDesafio(sb, 'daily') === 1, 'primeira vitória não pagou');
    ok(sb.app.club.desafioRodadaAbs.daily === 1, 'rodada da vitória não foi guardada: ' + JSON.stringify(sb.app.club.desafioRodadaAbs));
    ok(dispararDesafio(sb, 'daily') === 'bloqueado', 'mesma data reabriu a Rodada do Dia');
});

teste('B146(3): trocar a data sem jogar rodada da liga continua bloqueado e não paga prêmio', () => {
    const sb = carreiraEconomia('Teste B146 c');
    const { app } = sb;
    app._dailyChallengeKey = () => 20261028;
    dispararDesafio(sb, 'daily');
    const orcAntes = app.club.orcamento, elencoAntes = app.club.elenco.length;
    app._dailyChallengeKey = () => 20261029; // "relógio" avançou
    ok(dispararDesafio(sb, 'daily') === 'bloqueado', 'troca de data sem rodada reabriu o desafio');
    ok(app.club.elenco.length === elencoAntes && app.club.orcamento === orcAntes, 'prêmio concedido mesmo bloqueado');
    ok(app._desafioRodadaLivre('daily', 1).falta === 1, 'falta de rodada incorreta');
    ok(FONTE_HTML.indexOf("'Jogue mais uma rodada da liga para liberar este desafio.'") >= 0, 'mensagem da Rodada do Dia não está no jogo');
});

teste('B146(4): após avançar 1 rodada da liga, a Rodada do Dia libera e paga de novo', () => {
    const sb = carreiraEconomia('Teste B146 d');
    const { app } = sb;
    app._dailyChallengeKey = () => 20261028;
    dispararDesafio(sb, 'daily');
    app._dailyChallengeKey = () => 20261029;
    app.league.rodada += 1; // a rodada da liga é jogada (closeMatchResult incrementa a rodada)
    ok(dispararDesafio(sb, 'daily') === 1, 'após 1 rodada o desafio não liberou');
});

teste('B146(4b): Clássico exige 5 rodadas da liga entre um prêmio e o próximo (4 bloqueia, 5 libera)', () => {
    const sb = carreiraEconomia('Teste B146 e');
    const { app } = sb;
    app._classicoKey = () => '2026-W44';
    ok(dispararDesafio(sb, 'classico') === 1, 'Clássico livre não pagou');
    const n = app.club.desafioRodadaAbs.classico;
    app._classicoKey = () => '2026-W45';
    app.league.rodada += 4;
    ok(dispararDesafio(sb, 'classico') === 'bloqueado', 'Clássico liberou com 4 rodadas');
    ok(app._desafioRodadaLivre('classico', 5).falta === 1, 'deveria faltar 1 rodada, faltam ' + app._desafioRodadaLivre('classico', 5).falta + ' (n=' + n + ')');
    app.league.rodada += 1;
    ok(dispararDesafio(sb, 'classico') === 1, 'Clássico não liberou com 5 rodadas');
});

teste('B146(5): save antigo sem desafioRodadaAbs é livre; normalizeNewFields cria o objeto vazio', () => {
    const sb = carreiraEconomia('Teste B146 f');
    const { app } = sb;
    app._dailyChallengeKey = () => 20261028;
    delete app.club.desafioRodadaAbs;
    ok(app._desafioRodadaLivre('daily', 1).livre === true, 'save antigo bloqueou o desafio');
    app.normalizeNewFields(app.club);
    ok(app.club.desafioRodadaAbs && typeof app.club.desafioRodadaAbs === 'object' && Object.keys(app.club.desafioRodadaAbs).length === 0, 'normalização não criou o campo vazio');
    ok(dispararDesafio(sb, 'daily') === 1, 'save antigo não recebeu o desafio');
});

teste('B146(6): sem liga/rodada (tutorial) a guarda não bloqueia', () => {
    const sb = carreiraEconomia('Teste B146 g');
    const { app } = sb;
    app.club.desafioRodadaAbs = { daily: 99, classico: 99 };
    app.league = null;
    ok(app._desafioRodadaLivre('daily', 1).livre === true && app._desafioRodadaLivre('classico', 5).livre === true, 'sem liga a guarda bloqueou');
});

teste('B147(1): escolher o patrocínio que já está ativo é no-op (metas e progresso preservados)', () => {
    const sb = carreiraEconomia('Teste B147 a');
    const { app, PATROCINIOS } = sb;
    const modelo = PATROCINIOS.find(p => (p.metas || []).length);
    app.club.patrocinio = JSON.parse(JSON.stringify(modelo));
    app.club.patrocinio.metas.forEach(m => { m.pago = false; m.progresso = 2; });
    const ref = app.club.patrocinio;
    app.league.rodada = 6;
    app.escolherPatrocinio(modelo.id);
    ok(app.club.patrocinio === ref, 'contrato foi recriado');
    ok(ref.metas.every(m => m.progresso === 2), 'progresso zerou no mesmo patrocínio');
});

teste('B147(2): trocar no meio da temporada com meta em andamento é recusado e o estado fica intacto', () => {
    const sb = carreiraEconomia('Teste B147 b');
    const { app, PATROCINIOS } = sb;
    const atual = PATROCINIOS.find(p => (p.metas || []).length), outro = PATROCINIOS.find(p => p.id !== atual.id);
    app.club.patrocinio = JSON.parse(JSON.stringify(atual));
    app.club.patrocinio.metas.forEach(m => { m.pago = false; m.progresso = 1; });
    app.league.rodada = 3;
    const orc = app.club.orcamento, ref = app.club.patrocinio;
    app.escolherPatrocinio(outro.id);
    ok(app.club.patrocinio === ref && app.club.patrocinio.id === atual.id, 'troca com meta em andamento foi aceita');
    ok(ref.metas.every(m => m.progresso === 1), 'progresso alterado pela recusa');
    ok(app.club.orcamento === orc, 'houve cobrança na recusa');
    ok(FONTE_HTML.indexOf("'Troque de patrocinador só no começo da temporada ou antes de avançar nas metas atuais.'") >= 0, 'mensagem de recusa ausente');
});

teste('B147(3): trocar na rodada 1 é permitido mesmo com progresso (começo da temporada)', () => {
    const sb = carreiraEconomia('Teste B147 c');
    const { app, PATROCINIOS } = sb;
    const atual = PATROCINIOS.find(p => (p.metas || []).length), outro = PATROCINIOS.find(p => p.id !== atual.id);
    app.club.patrocinio = JSON.parse(JSON.stringify(atual));
    app.club.patrocinio.metas.forEach(m => { m.progresso = 1; });
    app.league.rodada = 1;
    app.escolherPatrocinio(outro.id);
    ok(app.club.patrocinio.id === outro.id, 'troca na rodada 1 foi recusada');
    ok(app.club.patrocinio.metas.every(m => m.progresso === 0 && m.pago === false), 'metas novas não nasceram zeradas');
});

teste('B147(4): trocar sem nenhum progresso nem meta paga é permitido no meio da temporada', () => {
    const sb = carreiraEconomia('Teste B147 d');
    const { app, PATROCINIOS } = sb;
    const atual = PATROCINIOS.find(p => (p.metas || []).length), outro = PATROCINIOS.find(p => p.id !== atual.id);
    app.club.patrocinio = JSON.parse(JSON.stringify(atual));
    app.club.patrocinio.metas.forEach(m => { m.pago = false; m.progresso = 0; });
    app.league.rodada = 5;
    app.escolherPatrocinio(outro.id);
    ok(app.club.patrocinio.id === outro.id, 'troca sem progresso foi recusada');
});

teste('B147(5): A→B→A com meta já paga não recolhe a meta de novo (troca bloqueada no meio da temporada)', () => {
    const sb = carreiraEconomia('Teste B147 e');
    const { app, PATROCINIOS } = sb;
    const a = PATROCINIOS.find(p => (p.metas || []).length), b = PATROCINIOS.find(p => p.id !== a.id);
    app.club.patrocinio = JSON.parse(JSON.stringify(a));
    app.club.patrocinio.metas.forEach(m => { m.pago = true; m.progresso = 1; });
    app.league.rodada = 4;
    const orc = app.club.orcamento;
    app.escolherPatrocinio(b.id);
    app.escolherPatrocinio(a.id); // "volta" ao contrato A: é o mesmo patrocínio ativo, então no-op
    ok(app.club.patrocinio.id === a.id && app.club.patrocinio.metas.every(m => m.pago === true), 'meta paga foi reaberta por A→B→A');
    ok(app.club.orcamento === orc, 'meta recolhida de novo');
});

console.log('-- B149/B150: decisão sem gabarito no texto, Foco pela melhor leitura e Craque por OVR/posição (2026-10-28)');

// Ajuste (vetor de 3 opções) de um contexto, lido do próprio código-fonte (mesma leitura do 3.1).
const ajusteDoCtx = (ctx) => {
    const i = FONTE_HTML.indexOf(ctx + ': { texto:');
    if (i < 0) throw new Error('contexto não achado: ' + ctx);
    const m = /ajuste: \[([^\]]+)\]/.exec(FONTE_HTML.slice(i, i + 900));
    return m[1].split(',').map(Number);
};
const CONTEXTOS_ATAQUE = ['frente', 'distancia', 'ponta'];
const CONTEXTOS_DEFESA = ['area', 'transicao', 'corredor'];
// Melhor leitura como o motor decide: maior ajuste no ataque, menor na defesa.
const melhorDoCtx = (ctx) => {
    const v = ajusteDoCtx(ctx), ataque = CONTEXTOS_ATAQUE.includes(ctx);
    let b = 0;
    v.forEach((x, i) => { if (ataque ? x > v[b] : x < v[b]) b = i; });
    return b;
};
// Partida mínima com o usuário em casa, decisão disparada direto (relógio virtual, sem jogar a partida).
const simDecisao = (sbX) => {
    const home = makeTeam('Casa', 70, { isUser: true });
    const away = makeTeam('Fora', 70, {});
    return new sbX.MatchSim(home, away, null, () => {}, { seed: 7, modo: 'detalhado', minDurMs: 0, tempoMin: 90, estilo: 'equilibrado', craque: null, regra: null, condicao: 'normal', startMinute: 0, startScore: null, startRedUser: 0, derbi: false });
};

teste('B149(1): Foco ganha +8 só quando a escolha é a melhor leitura do contexto e +3 nas demais', () => {
    const sbX = novoSandbox();
    [...CONTEXTOS_ATAQUE, ...CONTEXTOS_DEFESA].forEach(ctx => {
        const melhor = melhorDoCtx(ctx);
        [0, 1, 2].forEach(pol => {
            sbX.MatchUI._politicaDecisao = pol;
            const sim = simDecisao(sbX);
            sim._foco = 50;
            // side 0 = usuário ataca; side 1 = rival ataca e o usuário defende.
            sim._mostrarDecisao({ side: CONTEXTOS_ATAQUE.includes(ctx) ? 0 : 1, contexto: ctx });
            const ganho = sim._foco - 50, esperado = pol === melhor ? 8 : 3;
            ok(Math.abs(ganho - esperado) < 0.001, ctx + ' opção ' + pol + ': Foco +' + ganho.toFixed(2) + ' (esperado +' + esperado + ', melhor ' + melhor + ')');
        });
    });
});

teste('B149(2): textos de contexto descrevem a situação e não citam a opção certa (palavras-gabarito removidas)', () => {
    const removidas = ['chute forte', 'pede o cruzamento', 'companheiro livre na área', 'há cobertura', 'cobertura para pressionar',
        'fechar a linha do chute', 'abandonar a área', 'manter a linha evita', 'cantos abertos', 'recompõe'];
    [...CONTEXTOS_ATAQUE, ...CONTEXTOS_DEFESA].forEach(ctx => {
        const i = FONTE_HTML.indexOf(ctx + ': { texto:');
        const trecho = FONTE_HTML.slice(i, FONTE_HTML.indexOf('ajuste:', i)).toLowerCase();
        removidas.forEach(p => ok(trecho.indexOf(p) < 0, ctx + ' ainda contém "' + p + '"'));
    });
});

teste('B149(3): as dicas das opções continuam sem número de chance (B51)', () => {
    const sbX = novoSandbox();
    sbX.MatchUI._politicaDecisao = 1;
    simDecisao(sbX)._mostrarDecisao({ side: 0, contexto: 'frente' });
    const ultimo = sbX.MatchUI.promptCalls[sbX.MatchUI.promptCalls.length - 1];
    ok(ultimo && ultimo.hints.length === 3, 'prompt sem 3 opções');
    ok(ultimo.hints.every(h => h && h.indexOf('%') < 0), 'alguma dica traz % : ' + ultimo.hints.join(' | '));
});

teste('B149(4): o feedback pós-lance continua revelando a melhor leitura (aprendizado)', () => {
    const sbX = novoSandbox();
    sbX.MatchUI._politicaDecisao = 0;
    const sim = simDecisao(sbX);
    sim._mostrarDecisao({ side: 0, contexto: 'distancia' });
    const d = sim._decisoes && sim._decisoes[sim._decisoes.length - 1];
    ok(d && d.melhorLabel === '💥 Forte', 'melhorLabel do registro pós-lance não é a melhor leitura: ' + (d && d.melhorLabel));
});

teste('B150(1): bônus do Craque escala pelo OVR (78 ×0,82; 87 ×1,18) e soma ~9,5 em cada posição', () => {
    const sbX = novoSandbox();
    ['ATT', 'MID', 'DEF', 'GK'].forEach(pos => {
        const soma = (ovr) => { const c = sbX.bonusCraqueDaRodada({ overall: ovr, posicao: pos }); return c.a + c.m + c.d; };
        perto(soma(82.5), 9.5, 0.001, pos + ' no OVR médio');
        perto(soma(78), 9.5 * 0.82, 0.001, pos + ' OVR 78');
        perto(soma(87), 9.5 * 1.18, 0.001, pos + ' OVR 87');
    });
});

teste('B150(2): o bônus segue a posição (atacante → ataque; zagueiro/goleiro → defesa); posição desconhecida = 6/2,5/1', () => {
    const sbX = novoSandbox();
    const c = (pos) => sbX.bonusCraqueDaRodada({ overall: 82.5, posicao: pos });
    perto(c('ATT').a, 7, 0.001, 'ATT ataque'); perto(c('ATT').d, 0.5, 0.001, 'ATT defesa');
    perto(c('DEF').a, 3, 0.001, 'DEF ataque'); perto(c('DEF').d, 4, 0.001, 'DEF defesa');
    perto(c('GK').d, 6, 0.001, 'GK defesa'); perto(c('GK').a, 1.5, 0.001, 'GK ataque');
    const x = c('ZZ'), semPos = sbX.bonusCraqueDaRodada({ overall: 82.5 });
    [x, semPos].forEach(q => { perto(q.a, 6, 0.001, 'desconhecida ataque'); perto(q.m, 2.5, 0.001, 'desconhecida meio'); perto(q.d, 1, 0.001, 'desconhecida defesa'); });
});

teste('B150(3): média dos candidatos (OVR 78 a 87) mantém o bônus médio em ~9,5 para cada posição', () => {
    const sbX = novoSandbox();
    ['ATT', 'MID', 'DEF', 'GK'].forEach(pos => {
        let s = 0;
        for (let o = 78; o <= 87; o++) { const c = sbX.bonusCraqueDaRodada({ overall: o, posicao: pos }); s += c.a + c.m + c.d; }
        perto(s / 10, 9.5, 0.01, 'média de ' + pos);
    });
});

teste('B150(4): bonusCraqueDaRodada não altera o craque e o motor aplica só ao usuário (sem estado novo)', () => {
    const sbX = novoSandbox();
    const craque = { nome: 'X', overall: 80, posicao: 'MID' }, antes = JSON.stringify(craque);
    sbX.bonusCraqueDaRodada(craque);
    ok(JSON.stringify(craque) === antes, 'a função mutou o craque');
    ok(FONTE_HTML.indexOf('if (this.craque && isUser) { const cq = bonusCraqueDaRodada(this.craque);') >= 0, 'o bônus do motor não está restrito ao usuário');
});

teste('B150(5): a ajuda descreve o bônus pelo OVR e pela posição, sem o número fixo antigo', () => {
    ok(FONTE_HTML.indexOf('o bônus cresce com o OVR do craque e depende da posição dele') >= 0, 'ajuda sem a descrição nova do craque');
    ok(FONTE_HTML.indexOf('+6 de ataque, +2,5 de meio e +1 de defesa') < 0, 'ajuda ainda cita o bônus fixo +6/+2,5/+1');
});

console.log('');
console.log('=== ' + (total - falhas) + '/' + total + ' verificações passaram' + (falhas ? ' — ' + falhas + ' FALHAS' : '') + ' ===');
process.exit(falhas ? 1 : 0);
