'use strict';
// tests/verificacao/workflow.js — valida o workflow de publicação sem dependências
// (o projeto é "só Node, zero build": nada de PyYAML nem parsers externos).
// Checa o que pode quebrar a publicação de forma silenciosa.
// Uso: node tests/verificacao/workflow.js
const fs = require('fs');
const path = require('path');
const { criarRelatorio, encerrar } = require('./_lib');

const arquivo = path.join(__dirname, '..', '..', '.github', 'workflows', 'deploy-pages.yml');
const rel = criarRelatorio('workflow de publicação');

if (!fs.existsSync(arquivo)) {
    rel.t('workflow existe', false, arquivo);
    encerrar(rel);
}
const y = fs.readFileSync(arquivo, 'utf8');

rel.t('nome do workflow é Deploy Pages', /^name:\s*Deploy Pages\s*$/m.test(y));
rel.t('dispara em push na main', /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/.test(y));
rel.t('tem workflow_dispatch (permite testar sem push)', /workflow_dispatch:/.test(y));
rel.t('concurrency com cancel-in-progress',
    /concurrency:\s*\n\s*group:\s*pages/.test(y) && /cancel-in-progress:\s*true/.test(y));

// Permissões: pages + id-token para publicar, deployments para a limpeza.
rel.t('permissão pages: write', /^\s*pages:\s*write\s*$/m.test(y));
rel.t('permissão id-token: write', /^\s*id-token:\s*write\s*$/m.test(y));
rel.t('permissão deployments: write (necessária para limpar)', /^\s*deployments:\s*write\s*$/m.test(y));
rel.t('contents continua read', /^\s*contents:\s*read\s*$/m.test(y));

// Empacotamento: NÃO pode voltar a publicar o repositório inteiro.
rel.t('não publica o repositório inteiro (sem path: .)', !/^\s*path:\s*\.\s*$/m.test(y));
rel.t('publica a pasta montada (_site)', /^\s*path:\s*_site\s*$/m.test(y));
rel.t('copia explicitamente os arquivos do jogo',
    /cp index\.html README\.md _site\//.test(y));
rel.t('falha cedo se o jogo não entrar no pacote', /test -s _site\/index\.html/.test(y));

// Limpeza de deployments: precisa ser o ÚLTIMO passo e inativar antes de excluir.
const linhas = y.split('\n');
const idxLimpeza = linhas.findIndex(l => /-\s*name:\s*Remover deployments antigos/.test(l));
const idxPublicar = linhas.findIndex(l => /-\s*name:\s*Publicar\s*$/.test(l));
rel.t('existe o passo de limpeza de deployments', idxLimpeza > 0);
rel.t('a limpeza vem DEPOIS de publicar',
    idxLimpeza > 0 && idxPublicar > 0 && idxLimpeza > idxPublicar,
    `publicar=${idxPublicar + 1}, limpeza=${idxLimpeza + 1}`);
rel.t('a limpeza é o último passo do job',
    idxLimpeza > 0 && !linhas.slice(idxLimpeza + 1).some(l => /^\s{6}-\s*name:/.test(l)));
rel.t('inativa antes de excluir (a API exige)', /\/statuses/.test(y) && /-X DELETE/.test(y));
rel.t('descobre o deployment atual pela API',
    /atual=\$\(echo "\$\{ids\}" \| tail -n 1\)/.test(y));
rel.t('não usa a saída inexistente deployment_id', !/deployment_id/.test(y));
rel.t('falha alto se sobrar mais de um deployment', /::error::sobrou mais de um deployment/.test(y));
rel.t('usa o token do próprio workflow',
    /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(y));
rel.t('usa a variável GITHUB_REPOSITORY (não owner/repo fixo)',
    /GITHUB_REPOSITORY/.test(y) && !/JonJonesBR/.test(y));

// O script embutido precisa ser bash válido, quando houver bash no host.
{
    const linhasRun = [];
    let dentro = false, base = -1;
    for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!dentro && /^\s*run:\s*\|\s*$/.test(l)) {
            dentro = true;
            base = l.search(/\S/);
            continue;
        }
        if (dentro) {
            if (l.trim() === '') { linhasRun.push(''); continue; }
            const indent = l.search(/\S/);
            if (indent <= base) { dentro = false; continue; }
            linhasRun.push(l.slice(base + 2));
        }
    }
    const script = linhasRun.join('\n');
    rel.t('existe script embutido para validar', script.length > 100, script.length + ' bytes');

    const { execFileSync } = require('child_process');
    const candidatos = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
        '/bin/bash', '/usr/bin/bash'
    ];
    const bash = candidatos.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
    if (bash) {
        const tmp = path.join(require('os').tmpdir(), 'altfoot-wf-' + process.pid + '.sh');
        fs.writeFileSync(tmp, script, 'utf8');
        let ok = true, saida = '';
        try { execFileSync(bash, ['-n', tmp], { stdio: 'pipe' }); }
        catch (e) { ok = false; saida = String(e.stderr || e.message).split('\n')[0]; }
        try { fs.unlinkSync(tmp); } catch (_) { }
        rel.t('o script embutido é bash válido', ok, saida);
    } else {
        rel.nota('sem bash no host: `bash -n` não pôde ser executado (no runner do GitHub é bash)');
    }
}

encerrar(rel);
