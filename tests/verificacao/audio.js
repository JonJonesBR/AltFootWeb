'use strict';
// tests/verificacao/audio.js — garante por CÓDIGO (não por escuta) as propriedades do
// áudio: locução humana ausente, saída comum com limitador, apito de início ≠ fim,
// pênaltis com som, torcida reativa e a trilha de tensão que responde ao momentum.
// Uso: node tests/verificacao/audio.js [caminho/index.html]
const { lerIndex, semComentarios, criarRelatorio, encerrar } = require('./_lib');

const src = lerIndex(process.argv[2]);
const codigo = semComentarios(src);
const conta = (s) => codigo.split(s).length - 1;
const rel = criarRelatorio('áudio');

// --- Locução humana removida (decisão do usuário, 2026-10-14) ---
rel.t('sem NARRACAO_DIR / NARRACAO_SOUNDS',
    !codigo.includes('NARRACAO_DIR') && !codigo.includes('NARRACAO_SOUNDS'));
rel.t('sem playNarracao/pararNarracao',
    !codigo.includes('playNarracao') && !codigo.includes('pararNarracao'));
rel.t('sem fila de narração',
    !codigo.includes('_narFila') && !codigo.includes('_narTocando'));
rel.t('sem configuração de locução',
    !codigo.includes("toggleSetting('narracao')") && !codigo.includes("'vozVol'"));
rel.t('sem referência a arquivo .mp3', !codigo.includes('.mp3'));

// --- Saída comum com limitador ---
rel.t('existe saída comum (saida(ctx))', codigo.includes('saida(ctx)'));
rel.t('usa DynamicsCompressor', codigo.includes('createDynamicsCompressor'));
rel.t('11 vozes roteadas para a saída', conta('AudioSynthesizer.saida(ctx)') === 11,
    'encontradas: ' + conta('AudioSynthesizer.saida(ctx)'));
rel.t('só o limitador liga direto no destino', conta('.connect(ctx.destination)') === 1,
    'encontradas: ' + conta('.connect(ctx.destination)'));
rel.t('fallback se o compressor não existir',
    codigo.includes('entrada: ctx.destination, lim: null'));

// --- Apito: início e fim precisam ser distintos ---
rel.t('apito tem padrão de rajadas', codigo.includes('const rajadas = fim ?'));
rel.t('final = 3 rajadas', /fim \? \[\[0,0\.20\],\[0\.28,0\.20\],\[0\.56,0\.34\]\]/.test(codigo));
rel.t('início = 1 rajada', /: \[\[0,0\.30\]\]/.test(codigo));
rel.t('rate-limit do apito preservado', codigo.includes('2200'));

// --- Pênaltis com áudio ---
rel.t('pênalti toca apito', /_disputaPenaltis[\s\S]{0,2600}ui\.playApito\(false, 'curto'\)/.test(codigo));
rel.t('pênalti convertido usa som de gol', /_disputaPenaltis[\s\S]{0,2600}ui\.playGoalSound\(/.test(codigo));
rel.t('pênalti perdido levanta a torcida', /_disputaPenaltis[\s\S]{0,3000}MatchUI\.startCrowdLoop\(0\.20\)/.test(codigo));

// --- Torcida reativa ---
rel.t('torcida depende de settings.sfx',
    /_crowdVol\(base\) \{\s*\n\s*if \(typeof app !== 'undefined' && app\.settings && !app\.settings\.sfx\) return 0;/.test(codigo));
rel.t('atmosfera do estádio existe', codigo.includes('_atmosfera(m)'));
rel.t('nível do leito vem da atmosfera', codigo.includes('_nivelTorcida()'));

// --- B19: trilha de tensão responde ao momentum ---
rel.t('faixa passa o tom ao compasso', /compasso\(ctx,gain,track,bar\+\+,proximo,tom\)/.test(codigo));
rel.t('compasso roteia a harmonia pelo tom', codigo.includes('const destino = tom || out'));
rel.t('tom é criado uma vez por faixa', codigo.includes('nodes={ctx,gain,filtro:tom}'));
rel.t('tom só escurece a tensão', codigo.includes("(track === 'tension') ? 1100 : 16000"));
rel.t('pressao() deixou de ser no-op', /pressao\(v\) \{\s*\n\s*nivel = Math\.max\(-100/.test(codigo));
rel.t('pressao modula o filtro', codigo.includes('nodes.filtro.frequency.setTargetAtTime'));
rel.t('pressao modula o ganho', codigo.includes('music._alvo(1 + intensidade * 0.55)'));
rel.t('ducking preservado no cálculo de volume', codigo.includes('(vozBaixa ? 0.28 : 1)'));
rel.t('a trilha da partida é decidida num lugar só', codigo.includes('_trilhaDaPartida()'));
rel.t('tensão entra na reta final de jogo apertado',
    /reta && quente\) \? 'tension' : 'match'/.test(codigo));
rel.t('só troca de faixa quando muda', codigo.includes('if (alvo === this._trilhaAtual) return;'));
rel.t('não troca antes do apito inicial',
    codigo.includes('if ((this.minuto || 0) <= 0 || this.abortado) return;'));
rel.t('a trilha é rearmada a cada partida',
    codigo.includes("Engine.activeMatch._trilhaAtual = 'match'"));

// --- BGM ---
rel.t('duckBGM usa só o fator', /this\.currentBGM\.volume = Math\.max\(0, base \* factor\)/.test(codigo));

// --- Configurações coerentes ---
rel.t('nenhuma opção de voz no HTML',
    !codigo.includes('set-voz-vol') && !codigo.includes('set-narracao'));
rel.t('opções de áudio restantes preservadas',
    codigo.includes("'set-sfx'") && codigo.includes("'set-music'"));

encerrar(rel);
