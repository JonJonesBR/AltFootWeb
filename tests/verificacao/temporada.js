'use strict';
// tests/verificacao/temporada.js — FIAÇÃO do ciclo de temporada e das lesões.
//
// Por que este harness existe: os dois P0 de 2026-10-15 não eram erros de cálculo.
// O motor já sabia envelhecer (não repunha) e já sabia curar (só curava quem tinha
// prazo). O bug estava em QUEM CHAMAVA O QUÊ, E ONDE. Comportamento puro se testa em
// tests/run.js; aqui se verifica que o app realmente chama as funções nos três pontos
// que fechavam o ciclo — virada de temporada, carregamento do save e pós-rodada.
//
// Uso: node tests/verificacao/temporada.js
const path = require('path');
const { lerIndex, blocosDeScript, semComentarios, criarRelatorio, encerrar } = require('./_lib');

const rel = criarRelatorio('ciclo de temporada e lesões (fiação do app)');

// Corpo dos blocos <script> sem comentários: comentário explicando um nome já casou
// com uma busca por texto aqui antes e gerou falso positivo (ver README da pasta).
const fonte = semComentarios(blocosDeScript(lerIndex()).map(b => b.codigo).join('\n'));

// Fim da string/template aberta na posição `ini` (ignora escapes).
function fimDaString(ini) {
    const q = fonte[ini];
    for (let j = ini + 1; j < fonte.length; j++) {
        if (fonte[j] === '\\') { j++; continue; }
        if (fonte[j] === q) return j;
    }
    return fonte.length;
}

// Recorta um método pelo nome, contando chaves com consciência de string/template:
// um `{` dentro de um texto desbalancearia a conta e o recorte sairia errado em silêncio.
function metodo(nome) {
    const re = new RegExp('(?:^|\\n)[ \\t]*' + nome + '\\s*\\([^)]*\\)\\s*\\{');
    const m = re.exec(fonte);
    if (!m) throw new Error('definição não encontrada: ' + nome);
    let d = 0;
    const inicio = fonte.indexOf('{', m.index);
    for (let j = inicio; j < fonte.length; j++) {
        const c = fonte[j];
        if (c === '"' || c === '\'' || c === '`') { j = fimDaString(j); continue; }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return fonte.slice(inicio, j + 1); }
    }
    throw new Error('chaves desbalanceadas em ' + nome);
}
const ocorrencias = agulha => fonte.split(agulha).length - 1;
const ordem = (texto, a, b) => {
    const i = texto.indexOf(a), j = texto.indexOf(b);
    return i >= 0 && j >= 0 && i < j;
};

// ------------------------------------------------ as funções existem uma única vez
rel.t('`recuperarLesoesRodada` é definida exatamente uma vez',
    ocorrencias('function recuperarLesoesRodada(') === 1, ocorrencias('function recuperarLesoesRodada(') + ' definições');
rel.t('`reporElencoBase` é definida exatamente uma vez',
    ocorrencias('reporElencoBase()') > 0 && ocorrencias('  reporElencoBase() {') === 1);

// ------------------------------------------------ virada de temporada (startNewSeason)
{
    const m = metodo('startNewSeason');
    rel.t('a virada de temporada repõe o elenco dos rivais depois de envelhecer/aposentar',
        ordem(m, 'envelhecer', 'reporElencoBase()') && ordem(m, 'idade <= 36', 'reporElencoBase()'));
    rel.t('a reposição da virada não toca no clube do jogador', /!\s*c\.isUser|filter\(c => c !== this\.club\)/.test(m));
}

// ------------------------------------------------ carregamento do save (_restoreFromRaw)
{
    const m = metodo('_restoreFromRaw');
    rel.t('o carregamento repara liga já afetada (reporElencoBase)', m.includes('reporElencoBase()'));
    rel.t('a reparação do save é só para clubes da IA', /!\s*cl\.isUser/.test(m));
}

// ------------------------------------------------ pós-rodada (closeMatchResult)
{
    const m = metodo('closeMatchResult');
    rel.t('o pós-rodada cura lesões pela função compartilhada',
        m.includes('recuperarLesoesRodada(this.club.elenco)'));
    rel.t('a recuperação vale para a liga toda (o rival também cura)',
        /CompetitionSystem\.all\(this\.league\)[\s\S]{0,200}recuperarLesoesRodada\(cl\.elenco\)/.test(m));
    rel.t('o laço antigo (que só curava quem já tinha prazo) não voltou',
        !m.includes('rodadasRecuperacao--'));
}

// ------------------------------------------------ lesão de partida (_aplicar)
{
    const m = metodo('_aplicar');
    rel.t('a lesão de partida grava o prazo junto com o machucado',
        /lesionado\.rodadasRecuperacao\s*=/.test(m) && /lesionado\.machucado\s*=/.test(m));
    rel.t('o departamento médico encurta o prazo', /nivel\(teamAtk,\s*'medico'\)/.test(m));
    rel.t('o Rádio anuncia o tempo fora', m.includes('Fora por'));
}

// ------------------------------------------------ a bancada de regressões enxerga tudo
{
    const { novoSandbox } = require(path.join('..', 'engine-lib.js'));
    const sb = novoSandbox();
    rel.t('engine-lib expõe `recuperarLesoesRodada` para os testes', typeof sb.recuperarLesoesRodada === 'function');
    const clube = new sb.Club(null);
    rel.t('engine-lib expõe `reporElencoBase` para os testes',
        typeof clube.reporElencoBase === 'function' && clube.reporElencoBase() > 0);
}

// ------------------------------------------------ B74/B75: fim de temporada e salvar (2026-10-19)
{
    const pm = metodo('playMatch');
    rel.t('playMatch bloqueia a última rodada depois do fim da temporada',
        pm.includes('_temporadaEncerrada()') && pm.includes('_reabrirFimDeTemporada()'));
    const helper = metodo('_temporadaEncerrada');
    rel.t('o sinal do fim de temporada é o resumoTemporada persistido',
        helper.includes('resumoTemporada') && helper.includes('temporada === this.league.temporada'));
    rel.t('init e loadGame reabrem o fim de temporada',
        ocorrencias('_reabrirFimDeTemporada()') >= 3, ocorrencias('_reabrirFimDeTemporada()') + ' chamadas');
    rel.t('a nova temporada libera a trava',
        metodo('startNewSeason').includes('resumoTemporada = null'));
    const sf = metodo('salvarEFechar');
    rel.t('SALVAR & FECHAR chama saveGame antes de fechar',
        sf.includes('saveGame()') && sf.includes('closeSettings()'));
    rel.t('o botão do modal aponta para salvarEFechar',
        String(lerIndex()).includes('app.salvarEFechar()'));
}

encerrar(rel);
