/* Oficina · app de relatos e ordens de serviço · v2.0
   Funciona sem internet: tudo fica no celular e é enviado quando o sinal voltar. */
(function () {
  var VERSAO_APP = '2.2.1';
  var O = window.Oficina, L = O.Local;
  var S = { token: null, snap: null, fila: [], view: 'carregando', pilha: [], form: null, dados: null, filtroOS: 'abertas',
            online: navigator.onLine !== false, sincronizando: false, instalar: null, login: { nomes: null, msg: '', nome: '' } };
  var app = document.getElementById('app'), barra = document.getElementById('barra'), estado = document.getElementById('estado');
  var VIEWS_FORM = { relatar: 1, os: 1, pedirPecas: 1 };
  var UNIDADES = ['un', 'pç', 'jg', 'par', 'kit', 'L', 'm', 'kg', 'cx', 'gl'];

  // ---------------- utilidades ----------------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s) { return document.querySelector(s); }
  function toast(m) { var t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3600); }
  function reais(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); }
  function guardarLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function agoraTexto() { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function hora(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function thumb(id) { return '<a class="foto" href="https://drive.google.com/file/d/' + esc(id) + '/view" target="_blank" rel="noopener"><img alt="Foto" loading="lazy" src="https://drive.google.com/thumbnail?id=' + esc(id) + '&sz=w400" onerror="this.style.display=\'none\'"></a>'; }
  function thumbLocal(src) { return '<div class="foto pend"><img src="' + src + '" alt="Foto aguardando envio"></div>'; }
  function U() { return S.snap ? S.snap.usuario : null; }

  // ---------------- dados locais ----------------
  function recarregarFila() { return L.fila().then(function (f) { S.fila = f || []; }); }
  function pendentes() { return S.fila.filter(function (i) { return !i.falhou; }); }
  function falhas() { return S.fila.filter(function (i) { return i.falhou; }); }
  function salvarSnap() { return L.gravar('snap', S.snap); }

  function enfileirar(acao, args, extra) {
    var item = { op: O.novoCodigo(), acao: acao, args: args, criadoEm: Date.now(), seq: (S.fila.length || 0) };
    if (extra) for (var k in extra) item[k] = extra[k];
    return L.enfileirar(item).then(recarregarFila).then(function () {
      pedirEnvioEmSegundoPlano();
      setTimeout(sincronizar, 50);
      return item;
    });
  }
  function pedirEnvioEmSegundoPlano() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) { if (reg.sync) return reg.sync.register('enviar-fila'); }).catch(function () {});
  }

  // ---------------- sincronização ----------------
  function sincronizar() {
    if (S.sincronizando || !S.token) return Promise.resolve();
    S.sincronizando = true; desenharEstado();
    return O.sincronizar().then(function (r) {
      S.online = true;
      if (r && r.snap) S.snap = r.snap;
      if (r && r.enviados) toast(r.enviados === 1 ? '1 envio feito para a oficina' : r.enviados + ' envios feitos para a oficina');
      if (r && r.falhas) toast('Um envio deu erro. Veja em "Envios com erro".');
    }, function (e) {
      if (e && e.rede) { S.online = false; return; }
      if (e && e.sessao) { encerrarSessao(e.message); return; }
      toast((e && e.message) || 'Não foi possível atualizar.');
    }).then(recarregarFila).then(function () {
      S.sincronizando = false;
      if (S.view === 'login') return;
      if (!VIEWS_FORM[S.view]) render(); else { desenharEstado(); if (S.view === 'os') atualizarCardPecas(); }
    });
  }

  function desenharEstado() {
    if (!S.token || S.view === 'login') { estado.hidden = true; return; }
    estado.hidden = false;
    var p = pendentes().length, cls, txt;
    if (S.sincronizando) { cls = 'sync'; txt = 'Atualizando…'; }
    else if (!S.online) { cls = 'off'; txt = '<b>Sem internet.</b> ' + (p ? p + (p === 1 ? ' envio guardado' : ' envios guardados') + ' no celular' : 'Pode continuar usando'); }
    else { cls = ''; txt = p ? '<b>' + p + (p === 1 ? ' envio' : ' envios') + '</b> esperando' : 'Atualizado ' + (S.snap && S.snap.recebidoEm ? 'às ' + hora(S.snap.recebidoEm) : ''); }
    estado.className = 'estado ' + cls;
    estado.innerHTML = '<span class="bola" aria-hidden="true"></span><span>' + txt + '</span>' + (S.sincronizando ? '' : '<button id="btnSync">Atualizar</button>');
    var b = $('#btnSync'); if (b) b.onclick = function () { sincronizar(); };
  }

  // ---------------- navegação ----------------
  function ir(view, dados, semPilha) {
    if (!semPilha && S.view !== view && S.view !== 'carregando' && S.view !== 'login') S.pilha.push(S.view);
    if (view !== S.view) S.form = null;
    S.view = view; S.dados = dados || null;
    render(); window.scrollTo(0, 0);
  }
  function voltar() {
    var dados = S.view === 'pedirPecas' ? S.dados : null;   // volta para a mesma OS
    S.form = null; S.view = S.pilha.pop() || 'inicio'; S.dados = dados; render(); window.scrollTo(0, 0);
  }

  function cabecalho() {
    var u = U();
    var esq = S.view === 'inicio' || S.view === 'login' || S.view === 'carregando'
      ? '<div class="faixa" aria-hidden="true"></div><h1 class="marca">Oficina</h1>'
      : '<button class="voltar" id="btnVoltar" aria-label="Voltar">‹ Voltar</button>';
    var dir = u && S.view !== 'login' ? '<div class="quem"><b>' + esc(u.nome) + '</b>' + esc(u.funcao) + ' · <button id="btnSair">Sair</button></div>' : '';
    barra.innerHTML = esq + dir;
    var b = $('#btnVoltar'); if (b) b.onclick = voltar;
    var s = $('#btnSair'); if (s) s.onclick = sair;
    desenharEstado();
  }

  function render() {
    if (VIEWS_FORM[S.view]) salvarCamposDaTela();
    cabecalho();
    var f = { login: vLogin, inicio: vInicio, relatar: vRelatar, meusRelatos: vRelatos, fila: vFila, listaOS: vListaOS, os: vOS, painel: vPainel, envios: vEnvios, pedirPecas: vPedirPecas,
              carregando: function () { return '<div class="carregando">Carregando…</div>'; } }[S.view] || vInicio;
    app.innerHTML = f();
    ligar();
  }

  // ---------------- sessão ----------------
  function iniciar() {
    Promise.all([L.ler('token'), L.ler('snap'), recarregarFila()]).then(function (r) {
      S.token = r[0] || null; S.snap = r[1] || null;
      if (!S.token) return mostrarLogin();
      if (S.snap) { S.view = 'inicio'; render(); }
      else { S.view = 'carregando'; render(); }
      sincronizar().then(function () { if (!S.snap && S.token) { S.view = 'carregando'; app.innerHTML = '<div class="card vazio"><b>Sem internet</b><span>Conecte o celular uma vez para baixar a lista de máquinas.</span><button class="btn sec" id="btnTentar">Tentar de novo</button></div>'; var t = $('#btnTentar'); if (t) t.onclick = function () { sincronizar(); }; } });
    }).catch(function () { app.innerHTML = '<div class="card vazio"><b>Este celular não permite guardar dados</b><span>Saia do modo anônimo ou libere o armazenamento do navegador.</span></div>'; });
  }

  function mostrarLogin(msg) {
    S.view = 'login'; S.pilha = []; S.login.msg = msg || ''; render();
    L.ler('nomes').then(function (n) { if (n && !S.login.nomes) { S.login.nomes = n; if (S.view === 'login') render(); } });
    O.chamar('listarNomes', []).then(function (n) {
      S.login.nomes = n; L.gravar('nomes', n); if (S.view === 'login') render();
    }, function (e) {
      if (e.rede && !S.login.nomes) S.login.msg = 'Sem internet. Para entrar pela primeira vez, o celular precisa estar conectado.';
      else if (!e.rede) S.login.msg = e.message;
      if (S.view === 'login') render();
    });
  }

  function encerrarSessao(msg) {
    S.token = null; S.snap = null;
    L.apagar('token').then(function () { return L.apagar('snap'); }).then(function () { mostrarLogin(msg); });
  }

  function sair() {
    if (pendentes().length || falhas().length) {
      toast('Ainda há envios guardados neste celular. Conecte à internet e toque em Atualizar antes de sair.');
      return;
    }
    var t = S.token;
    O.chamar('sair', [], t).catch(function () {});
    encerrarSessao();
  }

  // ---------------- telas ----------------
  function vLogin() {
    var d = S.login, nomes = d.nomes;
    return '<div class="card"><h2>Entrar</h2><p class="hint">Escolha o seu nome e digite o seu PIN. O celular fica conectado e funciona mesmo sem internet.</p>' +
      '<label>Seu nome<select id="lNome">' + (nomes ? '<option value="">Escolha…</option>' + nomes.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') : '<option>Carregando…</option>') + '</select></label>' +
      '<label>PIN<input id="lPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="••••"></label>' +
      (d.msg ? '<p class="erro">' + esc(d.msg) + '</p>' : '') +
      '<button class="btn" id="btnEntrar"' + (nomes ? '' : ' disabled') + '>Entrar</button>' +
      '<p class="hint">Não está na lista ou esqueceu o PIN? Fale com o chefe de oficina.</p></div>' +
      (O && !window.OFICINA_API ? '<p class="aviso">O endereço da planilha ainda não foi configurado neste app.</p>' : '') +
      '<p class="rodape">Oficina · versão ' + VERSAO_APP + '</p>';
  }

  function resumoLocal() {
    var sn = S.snap || {}, u = U() || {};
    var os = sn.os || [];
    var abertas = os.filter(function (o) { return o.status !== 'Concluída'; });
    var paradas = {};
    abertas.forEach(function (o) { if (o.parada) paradas[o.maquina] = 1; });
    (sn.fila || []).forEach(function (r) { if (r.situacao === 'Parada') paradas[r.maquina] = 1; });
    var r = sn.resumo || {};
    return {
      paradas: u.chefe ? (sn.painel ? sn.painel.paradas.length : Object.keys(paradas).length) : (r.paradas || 0),
      osAbertas: u.chefe || !u.mecanico ? abertas.length : (r.osAbertas || 0),
      minhasOS: abertas.filter(function (o) { return o.mecanico === u.nome; }).length,
      relatosNovos: u.chefe ? (sn.fila || []).length : (r.relatosNovos || 0)
    };
  }

  function vInicio() {
    var u = U(); if (!u) return '<div class="carregando">Carregando…</div>';
    var r = resumoLocal();
    var itens = ['<button class="item-menu prim" data-ir="relatar"><span><span class="t">Relatar problema</span><span class="s">Máquina parada ou com defeito</span></span></button>'];
    if (u.chefe) itens.push(item('fila', 'Relatos novos', 'Transformar em ordem de serviço', r.relatosNovos, r.relatosNovos > 0));
    if (u.mecanico) itens.push(item('listaOS', 'Minhas OS', 'Serviços para fazer', r.minhasOS, false));
    if (u.chefe) itens.push(item('listaOS', 'Ordens de serviço', 'Abertas e concluídas', r.osAbertas, false));
    if (u.chefe) itens.push(item('painel', 'Painel', 'Máquinas paradas e defeitos repetidos', null, false));
    if (!u.chefe && !u.mecanico) itens.push(item('listaOS', 'Serviços em andamento', 'O que a oficina está fazendo', r.osAbertas, false));
    itens.push(item('meusRelatos', 'Meus relatos', 'O que eu já relatei', null, false));
    var f = falhas().length, p = pendentes().length;
    var alerta = f ? '<button class="alerta-fila" data-ir="envios">' + f + (f === 1 ? ' envio deu erro' : ' envios deram erro') + '. Toque para ver.</button>'
      : (p && !S.online ? '<button class="alerta-fila leve" data-ir="envios">' + p + (p === 1 ? ' envio guardado' : ' envios guardados') + ' no celular. Serão enviados quando o sinal voltar.</button>' : '');
    return alerta + '<div class="tiles">' +
      '<div class="tile' + (r.paradas ? ' bad' : '') + '"><span class="n">' + (r.paradas || 0) + '</span><span class="l">Paradas agora</span></div>' +
      '<div class="tile"><span class="n">' + (r.osAbertas || 0) + '</span><span class="l">OS abertas</span></div>' +
      '<div class="tile' + (r.relatosNovos ? ' bad' : '') + '"><span class="n">' + (r.relatosNovos || 0) + '</span><span class="l">Relatos novos</span></div></div>' +
      '<div class="menu">' + itens.join('') + '</div>' + blocoInstalar() +
      '<p class="rodape">Oficina · versão ' + VERSAO_APP + (S.snap && S.snap.sincronizadoEm ? ' · dados de ' + esc(S.snap.sincronizadoEm) : '') + '</p>';
    function item(v, t, s, n, alerta) {
      return '<button class="item-menu" data-ir="' + v + '"><span><span class="t">' + t + '</span><span class="s">' + s + '</span></span>' + (n === null || n === undefined ? '' : '<span class="n' + (alerta ? ' alerta' : '') + '">' + n + '</span>') + '</button>';
    }
  }

  function blocoInstalar() {
    var instalado = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (instalado) return '';
    if (S.instalar) return '<div class="instalar"><b>Instale o app neste celular</b><span>Fica um ícone na tela e ele abre mesmo sem internet.</span><button class="btn" id="btnInstalar">Instalar</button></div>';
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return '<div class="instalar"><b>Instale o app neste iPhone</b><span>No Safari, toque em Compartilhar (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.</span></div>';
    return '';
  }

  function vRelatar() {
    var f = S.form || (S.form = { maquina: '', busca: '', obra: lerLS('oficina_obra') || '', tipo: '', situacao: '', horimetro: '', descricao: '', fotos: [] });
    var maqs = (S.snap && S.snap.maquinas) || [];
    var m = maqs.filter(function (x) { return x.apelido === f.maquina; })[0];
    var campoMaq = m
      ? '<div class="escolhida"><div><b>' + esc(m.apelido) + '</b><span>' + esc(m.descricao) + '</span></div><button id="trocarMaq">Trocar</button></div>'
      : '<input id="fBusca" placeholder="Digite o apelido. Ex.: Eldorado" autocomplete="off" value="' + esc(f.busca) + '"><div id="resBusca"></div>';
    var tipos = (S.snap && S.snap.tipos) || [];
    return '<div class="card"><h2>Relatar problema</h2>' +
      (!S.online ? '<p class="aviso">Sem internet: o relato fica guardado e é enviado sozinho quando o sinal voltar.</p>' : '') +
      '<div class="campo">Máquina' + campoMaq + '</div>' +
      '<div class="campo">Situação<div class="situacao">' +
        '<button class="sit parada" data-sit="Parada" aria-pressed="' + (f.situacao === 'Parada') + '">Parada</button>' +
        '<button class="sit func" data-sit="Funcionando com problema" aria-pressed="' + (f.situacao === 'Funcionando com problema') + '">Funcionando com problema</button></div></div>' +
      '<div class="campo">Onde é o problema<div class="chips">' + tipos.map(function (t) { return '<button class="chip" data-tipo="' + esc(t) + '" aria-pressed="' + (f.tipo === t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>' +
      '<label>O que aconteceu <small>Use o microfone do teclado para falar em vez de digitar</small><textarea id="fDesc" placeholder="Ex.: vazando óleo no cilindro da lança, perdeu força">' + esc(f.descricao) + '</textarea></label>' +
      '<div class="linha"><label>Obra ou local<input id="fObra" value="' + esc(f.obra) + '" placeholder="Ex.: Lot. Maracajú"></label>' +
      '<label>Horímetro <small>se souber</small><input id="fHor" inputmode="decimal" value="' + esc(f.horimetro) + '"></label></div>' +
      '<div class="campo">Fotos <small>até 6</small><div class="fotos">' + f.fotos.map(function (src, i) { return '<div class="foto"><img src="' + src + '" alt="Foto ' + (i + 1) + '"><button data-tirar="' + i + '" aria-label="Tirar foto">×</button></div>'; }).join('') +
        (f.fotos.length < 6 ? '<button class="add-foto" id="addFoto"><b>+</b>Foto</button>' : '') + '</div></div>' +
      '<p class="erro" id="fErro" hidden></p>' +
      '<button class="btn" id="btnEnviar">' + (S.online ? 'Enviar relato' : 'Guardar relato') + '</button></div>';
  }

  function resultadosBusca(q) {
    var sem = function (t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    var n = sem(q.trim());
    if (!n) return '';
    var achou = ((S.snap && S.snap.maquinas) || []).filter(function (m) { return sem(m.apelido + ' ' + m.descricao).indexOf(n) >= 0; }).slice(0, 8);
    if (!achou.length) return '<p class="hint">Nenhuma máquina com esse nome.</p>';
    return '<div class="busca-res">' + achou.map(function (m) { return '<button data-maq="' + esc(m.apelido) + '"><b>' + esc(m.apelido) + '</b><span>' + esc(m.descricao) + '</span></button>'; }).join('') + '</div>';
  }

  function statusRelato(r) {
    if (r.pendente) return r.falhou ? '<span class="pill bad">Erro no envio</span>' : '<span class="pill warn">Aguardando envio</span>';
    if (r.status === 'Novo') return '<span class="pill warn">Aguardando oficina</span>';
    if (r.status === 'Descartado') return '<span class="pill">Descartado</span>';
    var s = r.statusOS || 'OS aberta';
    return '<span class="pill ' + (s === 'Concluída' ? 'ok' : 'info') + '">' + esc(r.os) + ' · ' + esc(s) + '</span>';
  }

  function cartaoRelato(r, comAcoes) {
    var fotos = r.fotosLocais && r.fotosLocais.length ? '<div class="fotos">' + r.fotosLocais.map(thumbLocal).join('') + '</div>'
      : (r.fotos && r.fotos.length ? '<div class="fotos">' + r.fotos.map(thumb).join('') + '</div>' : '');
    var acoes = '';
    if (comAcoes) {
      var pr = r.situacao === 'Parada' ? 'Alta' : 'Normal', id = esc(r.id);
      acoes = '<div class="linha"><label>Prioridade<select id="pr_' + id + '">' + S.snap.prioridades.map(function (p) { return '<option' + (p === pr ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
        '<label>Mecânico<select id="me_' + id + '"><option value="">Definir depois</option>' + S.snap.mecanicos.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></label></div>' +
        '<label>Observação para o mecânico <small>opcional</small><input id="ob_' + id + '"></label>' +
        '<div class="acoes"><button class="btn" data-abrir="' + id + '">Abrir OS</button><button class="btn perigo" data-descartar="' + id + '">Descartar</button></div>' +
        '<div id="desc_' + id + '" hidden class="campo"><label>Por que descartar?<input id="mo_' + id + '" placeholder="Ex.: já resolvido na obra, relato repetido"></label><button class="btn perigo" data-confdesc="' + id + '">Confirmar descarte</button></div>';
    }
    return '<div class="reg ' + (r.situacao === 'Parada' ? 'parada' : 'alta') + '"><span class="tarja"></span><div class="corpo">' +
      '<div class="topo"><span class="maq">' + esc(r.maquina) + '</span>' + (comAcoes ? '<span class="pill ' + (r.situacao === 'Parada' ? 'bad' : 'warn') + '">' + esc(r.situacao) + '</span>' : statusRelato(r)) + '</div>' +
      '<div class="meta">' + (r.id ? esc(r.id) + ' · ' : '') + esc(r.data) + ' · ' + esc(r.por) + (r.obra ? ' · ' + esc(r.obra) : '') + '</div>' +
      '<div class="meta">' + esc(r.tipo) + (comAcoes ? '' : ' · ' + esc(r.situacao)) + (r.horimetro !== '' && r.horimetro !== null && r.horimetro !== undefined ? ' · ' + esc(r.horimetro) + ' h' : '') + '</div>' +
      '<div class="desc">' + esc(r.descricao) + '</div>' + fotos +
      (r.falhou ? '<div class="erro">' + esc(r.erro) + '</div>' : '') +
      (r.status === 'Descartado' && r.motivo ? '<div class="meta">Motivo: ' + esc(r.motivo) + '</div>' : '') + acoes + '</div></div>';
  }

  function relatosPendentes() {
    return S.fila.filter(function (i) { return i.acao === 'novoRelato'; }).map(function (i) {
      var d = i.args[0];
      return { pendente: true, falhou: i.falhou, erro: i.erro, maquina: d.maquina, situacao: d.situacao, tipo: d.tipo, obra: d.obra, horimetro: d.horimetro,
               descricao: d.descricao, data: i.dataTexto || '', por: U().nome, fotosLocais: (d.fotos || []).map(function (f) { return f.base64; }) };
    }).reverse();
  }

  function vRelatos() {
    var l = relatosPendentes().concat((S.snap && S.snap.meusRelatos) || []);
    return '<h2>Meus relatos</h2>' + (l.length ? '<div class="lista">' + l.map(function (r) { return cartaoRelato(r, false); }).join('') + '</div>'
      : '<div class="card vazio"><b>Você ainda não relatou nada</b><span>Os problemas que você relatar aparecem aqui, com o andamento da oficina.</span></div>');
  }

  function vFila() {
    var l = ((S.snap && S.snap.fila) || []).slice().sort(function (a, b) { return (a.situacao === 'Parada' ? 0 : 1) - (b.situacao === 'Parada' ? 0 : 1); });
    return '<h2>Relatos novos</h2><p class="hint">Máquinas paradas primeiro. Abra a OS ou descarte cada relato.</p>' +
      (l.length ? '<div class="lista">' + l.map(function (r) { return cartaoRelato(r, true); }).join('') + '</div>'
        : '<div class="card vazio"><b>Nenhum relato esperando</b><span>Quando alguém relatar um problema, ele aparece aqui' + (S.online ? '' : ' assim que o celular tiver internet') + '.</span></div>');
  }

  function pillStatus(s) {
    var c = { 'Aberta': 'warn', 'Em andamento': 'info', 'Aguardando peça': 'bad', 'Concluída': 'ok' }[s] || '';
    return '<span class="pill ' + c + '">' + esc(s) + '</span>';
  }
  function osPendente(numero) { return S.fila.some(function (i) { return (i.acao === 'atualizarOS' || i.acao === 'pedirPecas') && i.args[0] === numero; }); }
  function pillCompra(s) {
    var c = { 'Aguardando aprovação': 'warn', 'Em cotação': 'info', 'Aguardando diretoria': 'warn', 'Compra aprovada': 'info', 'Aguardando entrega': 'info',
              'Entrega parcial': 'bad', 'Problema na entrega': 'bad', 'Entregue': 'ok', 'Reprovado': 'bad', 'Cancelado': 'bad' }[s] || 'warn';
    return '<span class="pill ' + c + '">' + esc(s) + '</span>';
  }
  // pedidos de peça desta OS: os que já estão no Compras e os guardados no celular
  function blocoPecas(o, ed) {
    var lista = (o.pedidosPecas || []).slice();
    var guardados = S.fila.filter(function (i) { return i.acao === 'pedirPecas' && i.args[0] === o.numero; });
    var recebendo = {};
    S.fila.forEach(function (i) { if (i.acao === 'receberPeca') recebendo[i.args[0]] = i; });
    var pode = ed && o.status !== 'Concluída' && S.snap.comprasLigado;
    if (!lista.length && !guardados.length && !pode) return '';
    var html = '<div class="card" id="cardPecas"><h3>Peças pedidas ao Compras</h3>';
    guardados.forEach(function (i) {
      var d = i.args[1];
      html += '<div class="peca"><div class="topo"><b>' + (i.falhou ? 'Pedido com erro' : 'Enviando ao Compras…') + '</b>' + (i.falhou ? '<span class="pill bad">Erro</span>' : '<span class="pill warn">Guardado</span>') + '</div>' +
        '<div class="bloco">' + esc(d.itens.map(function (it) { return it.qtd + ' ' + it.un + ' · ' + it.desc; }).join('\n')) + '</div>' +
        (i.falhou ? '<p class="erro">' + esc(i.erro) + '</p><button class="btn sec" data-ir="envios">Ver envios com erro</button>' : '<span class="hint">Feito em ' + esc(i.dataTexto) + (S.online ? '' : '. Vai quando o sinal voltar.') + '</span>') + '</div>';
    });
    lista.forEach(function (pc) {
      var rec = recebendo[pc.rc];
      html += '<div class="peca"><div class="topo"><b>' + esc(pc.rc) + (pc.oc ? ' · ' + esc(pc.oc) : '') + '</b>' + pillCompra(rec ? 'Chegada guardada' : pc.situacao) + '</div>' +
        '<div class="bloco">' + esc(pc.itens) + '</div>' +
        '<span class="hint">Pedido por ' + esc(pc.pedidoPor) + ' em ' + esc(pc.pedidoEm) + (pc.fornecedor ? ' · ' + esc(pc.fornecedor) : '') + (pc.previsao ? ' · entrega prevista ' + esc(pc.previsao) : '') + '</span>' +
        (pc.motivo && /Reprovado|Cancelado|parcial|Problema/.test(pc.situacao) ? '<p class="aviso">' + esc(pc.motivo) + '</p>' : '') +
        (pc.recebimento ? '<span class="hint">' + esc(pc.recebimento) + '</span>' : '');
      if (pc.aReceber && ed && !rec) {
        var r = S.receber && S.receber.rc === pc.rc ? S.receber : null;
        html += '<div class="campo">A peça chegou?<div class="seg tres">' + [['Total', 'Chegou tudo'], ['Parcial', 'Chegou parte'], ['Problema', 'Com problema']].map(function (t) {
          return '<button data-receber="' + esc(pc.rc) + '" data-tipo-rec="' + t[0] + '" aria-pressed="' + (!!r && r.tipo === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></div>';
        if (r) html += (r.tipo !== 'Total' ? '<label>' + (r.tipo === 'Parcial' ? 'O que chegou e o que faltou' : 'Qual o problema') + '<textarea id="recObs">' + esc(r.obs || '') + '</textarea></label>' : '') +
          '<p class="erro" id="recErro" hidden></p><button class="btn" id="btnConfRec">Confirmar chegada</button>';
      }
      html += '</div>';
    });
    if (pode) html += '<button class="btn sec" id="btnPedirPecas">Pedir peças</button>';
    else if (!S.snap.comprasLigado && ed && o.status !== 'Concluída') html += '<p class="hint">O pedido de peças pelo app ainda não foi ligado ao Compras.</p>';
    return html + '</div>';
  }

  function vListaOS() {
    var u = U(), l = (S.snap && S.snap.os) || [];
    if (u.mecanico && !u.chefe) l = l.filter(function (o) { return o.mecanico === u.nome; });
    var filtros = [['abertas', 'Abertas'], ['Aguardando peça', 'Aguardando peça'], ['Concluída', 'Concluídas']];
    var minhas = function (o) { return o.mecanico === u.nome && o.status !== 'Concluída'; };
    if (u.chefe && (l.some(minhas) || S.filtroOS === 'minhas')) filtros.splice(1, 0, ['minhas', 'Minhas']);
    var passa = function (f, o) { return f === 'abertas' ? o.status !== 'Concluída' : f === 'minhas' ? minhas(o) : o.status === f; };
    var vis = l.filter(function (o) { return passa(S.filtroOS, o); });
    var novas = S.fila.filter(function (i) { return i.acao === 'abrirOS'; }).length;
    var titulo = u.mecanico ? 'Minhas OS' : (u.chefe ? 'Ordens de serviço' : 'Serviços em andamento');
    return '<h2>' + titulo + '</h2>' +
      (u.chefe || u.mecanico ? '<div class="chips">' + filtros.map(function (f) { return '<button class="chip" data-filtro="' + esc(f[0]) + '" aria-pressed="' + (S.filtroOS === f[0]) + '">' + f[1] + ' (' + l.filter(function (o) { return passa(f[0], o); }).length + ')</button>'; }).join('') + '</div>' : '') +
      (novas ? '<p class="aviso">' + novas + (novas === 1 ? ' OS nova' : ' OS novas') + ' aguardando envio. O número aparece depois que o celular sincronizar.</p>' : '') +
      (vis.length ? '<div class="lista">' + vis.map(function (o) {
        var cls = o.status === 'Concluída' ? 'ok' : (o.prioridade === 'Urgente' ? 'urgente' : (o.prioridade === 'Alta' ? 'alta' : ''));
        return '<button class="reg ' + cls + '" data-os="' + esc(o.numero) + '"><span class="tarja"></span><span class="corpo">' +
          '<span class="topo"><span class="maq">' + esc(o.maquina) + '</span>' + pillStatus(o.status) + '</span>' +
          '<span class="meta">' + esc(o.numero) + ' · ' + esc(o.prioridade) + ' · ' + (o.mecanico ? esc(o.mecanico) : 'sem mecânico') + (osPendente(o.numero) ? ' · <b style="color:var(--warn)">alteração aguardando envio</b>' : '') + '</span>' +
          (o.parada && o.status !== 'Concluída' && o.diasParada !== null ? '<span class="meta" style="color:var(--bad);font-weight:600">Parada há ' + o.diasParada + ' dia' + (o.diasParada === 1 ? '' : 's') + '</span>' : '') +
          '<span class="desc">' + esc(String(o.problema).slice(0, 140)) + '</span></span></button>';
      }).join('') + '</div>' : '<div class="card vazio"><b>Nada por aqui</b><span>' + (S.filtroOS === 'abertas' ? 'Nenhuma OS aberta no momento.' : 'Nenhuma OS nesta situação.') + '</span></div>');
  }

  function acharOS(numero) { return ((S.snap && S.snap.os) || []).filter(function (o) { return o.numero === numero; })[0]; }

  function vOS() {
    var o = acharOS(S.dados && S.dados.numero);
    if (!o) return '<div class="card vazio"><b>OS não encontrada neste celular</b><span>Toque em Atualizar com internet.</span></div>';
    var r = o.relatoCompleto, u = U();
    var f = S.form || (S.form = { numero: o.numero, status: o.status, diagnostico: o.diagnostico || '', servico: o.servico || '', pecas: o.pecas || '',
      custoPecas: o.custoPecas === '' || o.custoPecas === undefined ? '' : String(o.custoPecas).replace('.', ','), horasMO: o.horasMO === '' || o.horasMO === undefined ? '' : String(o.horasMO).replace('.', ','),
      observacao: o.observacao || '', mecanico: o.mecanico || '', prioridade: o.prioridade, parada: o.parada, fotosNovas: [] });
    var ed = o.podeEditar, dis = ed ? '' : ' disabled';
    var fotosPend = [];
    S.fila.forEach(function (i) { if (i.acao === 'atualizarOS' && i.args[0] === o.numero) (i.args[1].fotosNovas || []).forEach(function (x) { fotosPend.push(x.base64); }); });
    var html = '<div class="card"><div class="reg ' + (o.prioridade === 'Urgente' ? 'urgente' : '') + '" style="border:0;padding:0"><span class="tarja"></span><div class="corpo">' +
      '<div class="topo"><span class="maq">' + esc(o.maquina) + '</span>' + pillStatus(o.status) + '</div>' +
      '<div class="meta">' + esc(o.numero) + ' · aberta em ' + esc(o.aberta) + ' por ' + esc(o.abertaPor) + '</div></div></div>' +
      (osPendente(o.numero) ? '<p class="aviso" id="avisoPend">Há alterações desta OS guardadas no celular, aguardando envio.</p>' : '') +
      '<div class="kv"><div><span class="l">Prioridade</span><span class="v">' + esc(o.prioridade) + '</span></div><div><span class="l">Mecânico</span><span class="v">' + esc(o.mecanico || '—') + '</span></div>' +
      '<div><span class="l">Máquina parada</span><span class="v"' + (o.parada && o.status !== 'Concluída' ? ' style="color:var(--bad)"' : '') + '>' + (o.parada ? 'Sim' + (o.diasParada !== null && o.diasParada !== undefined ? ' · ' + o.diasParada + ' dia(s)' : '') : 'Não') + '</span></div><div><span class="l">Tipo</span><span class="v">' + esc(o.tipo) + '</span></div></div>' +
      '<div class="campo">Problema relatado<div class="bloco">' + esc(o.problema) + '</div>' +
      (r ? '<span class="hint">' + esc(r.id) + ' · ' + esc(r.data) + ' · ' + esc(r.por) + (r.obra ? ' · ' + esc(r.obra) : '') + (r.horimetro !== '' ? ' · ' + esc(r.horimetro) + ' h' : '') + '</span>' : '') + '</div>' +
      (r && r.fotos && r.fotos.length ? '<div class="fotos">' + r.fotos.map(thumb).join('') + '</div>' : '') +
      (o.observacao && !u.chefe ? '<div class="campo">Observação<div class="bloco">' + esc(o.observacao) + '</div></div>' : '') + '</div>';

    html += blocoPecas(o, ed);
    html += '<div class="card"><h3>Serviço</h3>' +
      (ed ? '' : '<p class="aviso">' + (o.status === 'Concluída' ? 'OS concluída. Só o chefe de oficina pode reabrir ou alterar.' : 'Só o mecânico desta OS ou o chefe de oficina pode alterar.') + '</p>') +
      '<div class="campo">Situação<div class="seg">' + S.snap.status.map(function (s) { return '<button data-st="' + esc(s) + '" aria-pressed="' + (f.status === s) + '"' + dis + '>' + esc(s) + '</button>'; }).join('') + '</div></div>' +
      (u.chefe ? '<div class="linha"><label>Mecânico<select id="oMec"><option value="">Sem mecânico</option>' + S.snap.mecanicos.map(function (m) { return '<option' + (m === f.mecanico ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></label>' +
        '<label>Prioridade<select id="oPri">' + S.snap.prioridades.map(function (p) { return '<option' + (p === f.prioridade ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="check"><input type="checkbox" id="oParada"' + (f.parada ? ' checked' : '') + '> Máquina parada por causa deste problema</label>' : '') +
      '<label>Diagnóstico<textarea id="oDiag"' + dis + ' placeholder="O que foi encontrado">' + esc(f.diagnostico) + '</textarea></label>' +
      '<label>Serviço executado<textarea id="oServ"' + dis + ' placeholder="O que foi feito">' + esc(f.servico) + '</textarea></label>' +
      '<label>Peças usadas <small>uma por linha, com a quantidade</small><textarea id="oPecas"' + dis + ' placeholder="Ex.: 2 mangueiras hidráulicas 1/2&quot;">' + esc(f.pecas) + '</textarea></label>' +
      '<label>Horas de mão de obra<input id="oHoras" inputmode="decimal"' + dis + ' value="' + esc(f.horasMO) + '"></label>' +
      (u.chefe ? '<label>Observação<input id="oObs" value="' + esc(f.observacao) + '"></label>' : '') +
      '<div class="campo">Fotos do serviço<div class="fotos">' + (o.fotos || []).map(thumb).join('') + fotosPend.map(thumbLocal).join('') +
        f.fotosNovas.map(function (src, i) { return '<div class="foto"><img src="' + src + '" alt="Foto nova"><button data-tirar="' + i + '" aria-label="Tirar foto">×</button></div>'; }).join('') +
        (ed && (o.fotos || []).length + fotosPend.length + f.fotosNovas.length < 12 ? '<button class="add-foto" id="addFoto"><b>+</b>Foto</button>' : '') + '</div></div>' +
      '<p class="erro" id="oErro" hidden></p>' +
      (ed ? (o.status !== 'Concluída' ? '<div class="acoes"><button class="btn sec" id="btnSalvar">Salvar</button><button class="btn" id="btnConcluir">Concluir OS</button></div>' : '<button class="btn sec" id="btnSalvar">Salvar alterações</button>') : '') +
      (o.podePdf ? '<button class="btn sec" id="btnPdf">Gerar PDF da OS</button>' : '') +
      (o.pdf ? '<a class="link" href="' + esc(o.pdf) + '" target="_blank" rel="noopener">Abrir o último PDF desta OS</a>' : '') +
      '<p class="hint">Última atualização: ' + esc(o.atualizada) + (o.atualizadaPor ? ' por ' + esc(o.atualizadaPor) : '') + '</p></div>';
    return html;
  }

  function vPedirPecas() {
    var o = acharOS(S.dados && S.dados.numero);
    if (!o) return '<div class="card vazio"><b>OS não encontrada neste celular</b></div>';
    var f = S.form || (S.form = { numero: o.numero, itens: [{ desc: '', qtd: '', un: 'un' }], urgencia: o.parada ? 'Urgente' : 'Normal', observacao: '' });
    return '<div class="card"><h2>Pedir peças</h2><p class="hint">' + esc(o.maquina) + ' · ' + esc(o.numero) + '. O pedido vai para o Compras: escritório aprova, comprador cota e compra. Você acompanha aqui na OS.</p>' +
      (!S.online ? '<p class="aviso">Sem internet: o pedido fica guardado e vai sozinho quando o sinal voltar.</p>' : '') +
      '<div class="campo">Peças<div class="lista">' + f.itens.map(function (it, i) {
        return '<div class="item-peca"><input id="pDesc' + i + '" placeholder="Peça, medida, marca ou código" value="' + esc(it.desc) + '">' +
          '<div class="linha3"><input id="pQtd' + i + '" inputmode="decimal" placeholder="Qtd" value="' + esc(it.qtd) + '">' +
          '<select id="pUn' + i + '">' + UNIDADES.map(function (x) { return '<option' + (x === it.un ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
          (f.itens.length > 1 ? '<button class="btn sec" data-tirar-item="' + i + '" aria-label="Tirar peça">×</button>' : '<span></span>') + '</div></div>';
      }).join('') + '</div><button class="btn sec" id="btnMaisItem">+ Outra peça</button></div>' +
      '<div class="campo">Urgência<div class="seg">' + ['Normal', 'Urgente'].map(function (x) { return '<button data-urg="' + x + '" aria-pressed="' + (f.urgencia === x) + '">' + x + '</button>'; }).join('') + '</div></div>' +
      '<label>Observação <small>onde comprar, peça original ou paralela, foto do código</small><textarea id="pObs">' + esc(f.observacao) + '</textarea></label>' +
      '<p class="erro" id="pErro" hidden></p><button class="btn" id="btnEnviarPecas">' + (S.online ? 'Enviar pedido' : 'Guardar pedido') + '</button></div>';
  }

  function vPainel() {
    var p = S.snap && S.snap.painel; if (!p) return '<div class="card vazio"><b>Painel ainda não baixado</b><span>Toque em Atualizar com internet.</span></div>';
    return '<h2>Painel da oficina</h2><p class="hint">Dados de ' + esc(S.snap.sincronizadoEm) + '</p>' +
      '<div class="tiles"><div class="tile' + (p.paradas.length ? ' bad' : '') + '"><span class="n">' + p.paradas.length + '</span><span class="l">Paradas agora</span></div>' +
      '<div class="tile"><span class="n">' + p.abertas + '</span><span class="l">OS abertas</span></div>' +
      '<div class="tile' + (p.porStatus['Aguardando peça'] ? ' bad' : '') + '"><span class="n">' + (p.porStatus['Aguardando peça'] || 0) + '</span><span class="l">Aguardando peça</span></div>' +
      '<div class="tile"><span class="n">' + p.concluidas30 + '</span><span class="l">Concluídas em 30 dias</span></div>' +
      '<div class="tile"><span class="n">' + (p.reparoMedioDias === null ? '–' : String(p.reparoMedioDias).replace('.', ',')) + '</span><span class="l">Dias médios por OS</span></div>' +
      '<div class="tile"><span class="n" style="font-size:22px;line-height:30px">' + (p.diasParados90 === undefined ? '–' : p.diasParados90) + '</span><span class="l">Dias parados (90 dias)</span></div></div>' +
      '<div class="card"><h3>Máquinas paradas</h3>' + (p.paradas.length ? '<div class="tabela"><table><thead><tr><th>Máquina</th><th class="num">Dias</th><th>Situação</th></tr></thead><tbody>' +
        p.paradas.map(function (m) { return '<tr><td><b>' + esc(m.maquina) + '</b><br><span class="hint">desde ' + esc(m.desde) + (m.os ? ' · ' + esc(m.os) : '') + '</span></td><td class="num"><b' + (m.dias >= 7 ? ' style="color:var(--bad)"' : '') + '>' + m.dias + '</b></td><td>' + esc(m.status) + (m.mecanico ? '<br><span class="hint">' + esc(m.mecanico) + '</span>' : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="hint">Nenhuma máquina parada.</p>') + '</div>' +
      '<div class="card"><h3>Mais OS nos últimos 90 dias</h3>' + (p.recorrentes.length ? '<div class="tabela"><table><thead><tr><th>Máquina</th><th class="num">OS</th><th>Defeito mais comum</th><th class="num">Dias parada</th></tr></thead><tbody>' +
        p.recorrentes.map(function (m) { return '<tr><td><b>' + esc(m.maquina) + '</b></td><td class="num"><b>' + m.qtd + '</b></td><td>' + esc(m.tipo) + '</td><td class="num">' + (m.dias === undefined ? '–' : m.dias) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="hint">Máquina com muitas OS do mesmo tipo de defeito: vale investigar a causa.</p>' : '<p class="hint">Ainda não há OS nos últimos 90 dias.</p>') + '</div>';
  }

  function nomeAcao(i) {
    if (i.acao === 'novoRelato') return 'Relato · ' + i.args[0].maquina;
    if (i.acao === 'abrirOS') return 'Abrir OS do relato ' + i.args[0];
    if (i.acao === 'descartarRelato') return 'Descartar relato ' + i.args[0];
    if (i.acao === 'atualizarOS') return 'Alteração da ' + i.args[0];
    if (i.acao === 'pedirPecas') return 'Pedido de peças da ' + i.args[0];
    if (i.acao === 'receberPeca') return 'Chegada de peça · ' + i.args[0];
    return i.acao;
  }

  function vEnvios() {
    var l = S.fila;
    return '<h2>Envios guardados</h2><p class="hint">O que foi feito neste celular e ainda não chegou na oficina.</p>' +
      (l.length ? '<div class="lista">' + l.map(function (i) {
        return '<div class="card"><div class="topo" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(nomeAcao(i)) + '</b>' +
          (i.falhou ? '<span class="pill bad">Erro</span>' : '<span class="pill warn">Aguardando</span>') + '</div>' +
          '<span class="hint">Feito em ' + esc(i.dataTexto || '') + '</span>' +
          (i.falhou ? '<p class="erro">' + esc(i.erro) + '</p><div class="acoes"><button class="btn sec" data-reenviar="' + esc(i.op) + '">Tentar de novo</button><button class="btn perigo" data-apagar="' + esc(i.op) + '">Apagar</button></div>' : '') +
          '</div>';
      }).join('') + '</div>' : '<div class="card vazio"><b>Tudo enviado</b><span>Não há nada guardado neste celular.</span></div>');
  }

  // ---------------- fotos ----------------
  function reduzirFoto(arquivo) {
    return new Promise(function (ok, falha) {
      var leitor = new FileReader();
      leitor.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = function () { falha(new Error('Não consegui abrir a foto.')); };
        img.src = leitor.result;
      };
      leitor.onerror = function () { falha(new Error('Não consegui ler a foto.')); };
      leitor.readAsDataURL(arquivo);
    });
  }
  document.getElementById('arquivoFoto').addEventListener('change', function (ev) {
    var arqs = Array.prototype.slice.call(ev.target.files || []);
    ev.target.value = '';
    if (!S.form || !VIEWS_FORM[S.view]) return;
    salvarCamposDaTela();
    var naOS = S.view === 'os';
    var destino = naOS ? S.form.fotosNovas : S.form.fotos;
    var o = naOS ? acharOS(S.form.numero) : null;
    var limite = naOS ? 12 - ((o && o.fotos) || []).length : 6;
    Promise.all(arqs.slice(0, Math.max(0, limite - destino.length)).map(reduzirFoto)).then(function (fs) {
      fs.forEach(function (f) { destino.push(f); }); render();
    }).catch(function (e) { toast(e.message); });
  });

  function salvarCamposDaTela() {
    var f = S.form; if (!f) return;
    if (S.view === 'relatar') {
      if ($('#fDesc')) f.descricao = $('#fDesc').value;
      if ($('#fObra')) f.obra = $('#fObra').value;
      if ($('#fHor')) f.horimetro = $('#fHor').value;
      if ($('#fBusca')) f.busca = $('#fBusca').value;
    } else if (S.view === 'pedirPecas') {
      f.itens.forEach(function (it, i) { var d = $('#pDesc' + i), q = $('#pQtd' + i), un = $('#pUn' + i); if (d) it.desc = d.value; if (q) it.qtd = q.value; if (un) it.un = un.value; });
      var po = $('#pObs'); if (po) f.observacao = po.value;
    } else if (S.view === 'os') {
      var ro = $('#recObs'); if (ro && S.receber) S.receber.obs = ro.value;
      [['oDiag', 'diagnostico'], ['oServ', 'servico'], ['oPecas', 'pecas'], ['oCusto', 'custoPecas'], ['oHoras', 'horasMO'], ['oObs', 'observacao'], ['oMec', 'mecanico'], ['oPri', 'prioridade']].forEach(function (p) { var el = $('#' + p[0]); if (el) f[p[1]] = el.value; });
      if ($('#oParada')) f.parada = $('#oParada').checked;
    }
  }

  // ---------------- ações ----------------
  function mostrarErro(id, msg) { var e = $('#' + id); if (!e) { toast(msg); return; } e.textContent = msg; e.hidden = !msg; }

  function ligar() {
    app.querySelectorAll('[data-ir]').forEach(function (b) { b.onclick = function () { ir(b.dataset.ir); }; });
    var bi = $('#btnInstalar'); if (bi) bi.onclick = function () { var p = S.instalar; S.instalar = null; p.prompt(); p.userChoice.then(function () { render(); }); };
    // login
    var be = $('#btnEntrar');
    if (be) {
      var pin = $('#lPin'), nome = $('#lNome');
      var atual = S.login.nome || lerLS('oficina_nome'); if (atual && S.login.nomes) nome.value = atual;
      nome.onchange = function () { S.login.nome = nome.value; };
      var entrar = function () {
        S.login.nome = nome.value;
        if (!nome.value) { S.login.msg = 'Escolha o seu nome.'; render(); return; }
        be.disabled = true; be.textContent = 'Entrando…';
        O.chamar('entrar', [nome.value, pin.value]).then(function (r) {
          S.token = r.token; guardarLS('oficina_nome', nome.value);
          return L.gravar('token', r.token).then(function () { return O.chamar('sincronizar', [], r.token); });
        }).then(function (snap) {
          snap.recebidoEm = Date.now(); S.snap = snap; S.online = true;
          return L.gravar('snap', snap);
        }).then(function () { S.pilha = []; ir('inicio', null, true); })
          .catch(function (e) { S.login.msg = e.rede ? 'Sem internet. Para entrar, o celular precisa estar conectado.' : (e.message || 'Não foi possível entrar.'); render(); });
      };
      be.onclick = entrar;
      pin.onkeydown = function (ev) { if (ev.key === 'Enter') entrar(); };
    }
    if (S.view === 'relatar') {
      var busca = $('#fBusca');
      if (busca) {
        var res = $('#resBusca');
        var atualizar = function () {
          res.innerHTML = resultadosBusca(busca.value);
          res.querySelectorAll('[data-maq]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.maquina = b.dataset.maq; S.form.busca = ''; render(); }; });
        };
        busca.oninput = function () { S.form.busca = busca.value; atualizar(); };
        atualizar();
      }
      var tm = $('#trocarMaq'); if (tm) tm.onclick = function () { salvarCamposDaTela(); S.form.maquina = ''; render(); setTimeout(function () { var b = $('#fBusca'); if (b) b.focus(); }, 0); };
      app.querySelectorAll('[data-sit]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.situacao = b.dataset.sit; render(); }; });
      app.querySelectorAll('[data-tipo]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.tipo = b.dataset.tipo; render(); }; });
      app.querySelectorAll('[data-tirar]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.fotos.splice(Number(b.dataset.tirar), 1); render(); }; });
      var af = $('#addFoto'); if (af) af.onclick = function () { document.getElementById('arquivoFoto').click(); };
      $('#btnEnviar').onclick = enviarRelato;
    }
    app.querySelectorAll('[data-abrir]').forEach(function (b) { b.onclick = function () { abrirOSdoRelato(b.dataset.abrir); }; });
    app.querySelectorAll('[data-descartar]').forEach(function (b) { b.onclick = function () { var c = $('#desc_' + b.dataset.descartar); c.hidden = !c.hidden; if (!c.hidden) $('#mo_' + b.dataset.descartar).focus(); }; });
    app.querySelectorAll('[data-confdesc]').forEach(function (b) { b.onclick = function () { descartar(b.dataset.confdesc); }; });
    app.querySelectorAll('[data-filtro]').forEach(function (b) { b.onclick = function () { S.filtroOS = b.dataset.filtro; render(); }; });
    app.querySelectorAll('[data-os]').forEach(function (b) { b.onclick = function () { ir('os', { numero: b.dataset.os }); }; });
    app.querySelectorAll('[data-reenviar]').forEach(function (b) { b.onclick = function () { reenviar(b.dataset.reenviar); }; });
    app.querySelectorAll('[data-apagar]').forEach(function (b) { b.onclick = function () { apagarEnvio(b.dataset.apagar, b); }; });
    if (S.view === 'os') {
      app.querySelectorAll('[data-st]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.status = b.dataset.st; render(); }; });
      app.querySelectorAll('[data-tirar]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.fotosNovas.splice(Number(b.dataset.tirar), 1); render(); }; });
      var af2 = $('#addFoto'); if (af2) af2.onclick = function () { document.getElementById('arquivoFoto').click(); };
      var bs = $('#btnSalvar'); if (bs) bs.onclick = function () { salvarOS(null); };
      var bc = $('#btnConcluir'); if (bc) bc.onclick = function () { salvarOS('Concluída'); };
      var bp = $('#btnPdf'); if (bp) bp.onclick = function () { gerarPdf(bp); };
      ligarPecas();
    }
    if (S.view === 'pedirPecas') {
      app.querySelectorAll('[data-urg]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.urgencia = b.dataset.urg; render(); }; });
      app.querySelectorAll('[data-tirar-item]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.itens.splice(Number(b.dataset.tirarItem), 1); render(); }; });
      $('#btnMaisItem').onclick = function () { salvarCamposDaTela(); S.form.itens.push({ desc: '', qtd: '', un: 'un' }); render(); var d = $('#pDesc' + (S.form.itens.length - 1)); if (d) d.focus(); };
      $('#btnEnviarPecas').onclick = enviarPedidoPecas;
    }
  }

  function enviarRelato() {
    salvarCamposDaTela();
    var f = S.form;
    if (!f.maquina) return mostrarErro('fErro', 'Escolha a máquina.');
    if (!f.situacao) return mostrarErro('fErro', 'Diga se a máquina está parada ou funcionando com problema.');
    if (!f.descricao.trim()) return mostrarErro('fErro', 'Escreva o que aconteceu.');
    guardarLS('oficina_obra', f.obra);
    var op = O.novoCodigo();
    var dados = { maquina: f.maquina, obra: f.obra, tipo: f.tipo || 'Outro', situacao: f.situacao, horimetro: f.horimetro, descricao: f.descricao,
                  fotos: f.fotos.map(function (b) { return { base64: b }; }), quando: Date.now(), idCliente: op };
    var item = { op: op, acao: 'novoRelato', args: [dados], criadoEm: Date.now(), seq: S.fila.length, dataTexto: agoraTexto() };
    L.enfileirar(item).then(recarregarFila).then(function () {
      S.form = null; S.pilha = [];
      toast(S.online ? 'Relato guardado. Enviando para a oficina…' : 'Relato guardado no celular. Vai ser enviado quando o sinal voltar.');
      ir('inicio', null, true);
      pedirEnvioEmSegundoPlano();
      sincronizar();
    }).catch(function () { mostrarErro('fErro', 'Não consegui guardar o relato neste celular. Tente de novo.'); });
  }

  function abrirOSdoRelato(id) {
    var d = { prioridade: $('#pr_' + id).value, mecanico: $('#me_' + id).value, observacao: $('#ob_' + id).value };
    S.snap.fila = S.snap.fila.filter(function (x) { return x.id !== id; });
    salvarSnap().then(function () { return enfileirar('abrirOS', [id, d], { dataTexto: agoraTexto() }); }).then(function () {
      toast(S.online ? 'Abrindo a OS…' : 'OS guardada. Será criada quando o sinal voltar.'); render();
    });
  }

  function descartar(id) {
    var motivo = $('#mo_' + id).value;
    S.snap.fila = S.snap.fila.filter(function (x) { return x.id !== id; });
    salvarSnap().then(function () { return enfileirar('descartarRelato', [id, motivo], { dataTexto: agoraTexto() }); }).then(function () { toast('Relato descartado'); render(); });
  }

  function salvarOS(statusFinal) {
    salvarCamposDaTela();
    var f = S.form, o = acharOS(f.numero), u = U();
    var d = { status: statusFinal || f.status, diagnostico: f.diagnostico, servico: f.servico, pecas: f.pecas, custoPecas: f.custoPecas, horasMO: f.horasMO,
              fotosNovas: f.fotosNovas.map(function (b) { return { base64: b }; }), quando: Date.now() };
    if (u.chefe) { d.mecanico = f.mecanico; d.prioridade = f.prioridade; d.parada = f.parada; d.observacao = f.observacao; }
    if (d.status === 'Concluída' && !String(d.diagnostico).trim() && !String(d.servico).trim()) return mostrarErro('oErro', 'Para concluir, preencha o diagnóstico ou o serviço executado.');
    // aplica no celular na hora; a planilha confirma depois
    var concluiuAgora = d.status === 'Concluída' && o.status !== 'Concluída';
    o.status = d.status; o.diagnostico = d.diagnostico; o.servico = d.servico; o.pecas = d.pecas;
    o.custoPecas = d.custoPecas === '' ? '' : Number(String(d.custoPecas).replace(/\./g, '').replace(',', '.')) || 0;
    o.horasMO = d.horasMO === '' ? '' : Number(String(d.horasMO).replace(',', '.')) || 0;
    if (u.chefe) { o.mecanico = d.mecanico; o.prioridade = d.prioridade; o.parada = d.parada; o.observacao = d.observacao; }
    if (concluiuAgora) { o.concluida = agoraTexto(); if (!u.chefe) o.podeEditar = false; }
    o.atualizada = agoraTexto(); o.atualizadaPor = u.nome;
    salvarSnap().then(function () { return enfileirar('atualizarOS', [o.numero, d], { dataTexto: agoraTexto() }); }).then(function () {
      S.form = null; render();
      toast(concluiuAgora ? o.numero + ' concluída' + (S.online ? '' : ' (será enviada quando o sinal voltar)') : 'Salvo' + (S.online ? '' : ' no celular'));
    });
  }

  function ligarPecas() {
    var bpp = $('#btnPedirPecas'); if (bpp) bpp.onclick = function () { salvarCamposDaTela(); var n = S.form.numero; S.receber = null; ir('pedirPecas', { numero: n }); };
    app.querySelectorAll('[data-receber]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.receber = { rc: b.dataset.receber, tipo: b.dataset.tipoRec, obs: (S.receber && S.receber.obs) || '' }; render(); var t = $('#recObs'); if (t) t.focus(); }; });
    var bcr = $('#btnConfRec'); if (bcr) bcr.onclick = confirmarChegada;
    app.querySelectorAll('#cardPecas [data-ir]').forEach(function (b) { b.onclick = function () { ir(b.dataset.ir); }; });
  }
  // depois de atualizar, redesenha só o quadro de peças (sem apagar o que a pessoa está digitando na OS)
  function atualizarCardPecas() {
    var el = $('#cardPecas'), o = acharOS(S.dados && S.dados.numero);
    var av = $('#avisoPend'); if (av && o && !osPendente(o.numero)) av.remove();
    if (!el || !o) return;
    var ro = $('#recObs'); if (ro && S.receber) S.receber.obs = ro.value;
    var novo = blocoPecas(o, o.podeEditar);
    if (novo) el.outerHTML = novo; else el.remove();
    ligarPecas();
  }

  function enviarPedidoPecas() {
    salvarCamposDaTela();
    var f = S.form, o = acharOS(f.numero);
    var itens = [];
    for (var i = 0; i < f.itens.length; i++) {
      var it = f.itens[i], desc = String(it.desc || '').trim(), qtd = Number(String(it.qtd || '').replace(',', '.'));
      if (!desc && !String(it.qtd || '').trim()) continue;
      if (!desc) return mostrarErro('pErro', 'Escreva qual é a peça ' + (i + 1) + '.');
      if (!(qtd > 0)) return mostrarErro('pErro', 'Informe a quantidade de "' + desc + '".');
      itens.push({ desc: desc, qtd: qtd, un: it.un || 'un' });
    }
    if (!itens.length) return mostrarErro('pErro', 'Inclua pelo menos uma peça.');
    var op = O.novoCodigo();
    var item = { op: op, acao: 'pedirPecas', args: [f.numero, { itens: itens, urgencia: f.urgencia, observacao: f.observacao, quando: Date.now(), idCliente: op }],
                 criadoEm: Date.now(), seq: S.fila.length, dataTexto: agoraTexto() };
    if (o && o.status !== 'Concluída' && o.status !== 'Aguardando peça') { o.status = 'Aguardando peça'; o.atualizada = agoraTexto(); o.atualizadaPor = U().nome; }
    salvarSnap().then(function () { return L.enfileirar(item); }).then(recarregarFila).then(function () {
      S.form = null;
      toast(S.online ? 'Pedido de peças enviado ao Compras.' : 'Pedido guardado. Vai para o Compras quando o sinal voltar.');
      S.pilha.pop(); ir('os', { numero: f.numero }, true);
      pedirEnvioEmSegundoPlano();
      setTimeout(sincronizar, 50);
    }).catch(function () { mostrarErro('pErro', 'Não consegui guardar o pedido neste celular. Tente de novo.'); });
  }

  function confirmarChegada() {
    salvarCamposDaTela();
    var r = S.receber; if (!r) return;
    if (r.tipo !== 'Total' && !String(r.obs || '').trim()) return mostrarErro('recErro', r.tipo === 'Parcial' ? 'Escreva o que chegou e o que faltou.' : 'Escreva qual foi o problema.');
    var op = O.novoCodigo();
    S.receber = null;
    enfileirar('receberPeca', [r.rc, { tipo: r.tipo, obs: r.obs || '', quando: Date.now(), idCliente: op }], { dataTexto: agoraTexto() }).then(function () {
      render(); toast('Chegada registrada' + (S.online ? '' : ' (será enviada quando o sinal voltar)'));
    });
  }

  function gerarPdf(btn) {
    var numero = S.form ? S.form.numero : S.dados.numero;
    btn.disabled = true; btn.textContent = 'Gerando PDF…';
    O.enviarFila().then(function (r) {
      if (r.parou === 'rede') throw new O.ErroRede();
      return O.chamar('gerarPdfOS', [numero], S.token);
    }).then(function (res) {
      var o = acharOS(numero); if (o) o.pdf = res.url;
      return salvarSnap().then(recarregarFila);
    }).then(function () { render(); toast('PDF pronto. Toque em "Abrir o último PDF".'); })
      .catch(function (e) { btn.disabled = false; btn.textContent = 'Gerar PDF da OS'; toast(e.rede ? 'Para gerar o PDF o celular precisa de internet.' : e.message); });
  }

  function reenviar(op) {
    var it = S.fila.filter(function (i) { return i.op === op; })[0]; if (!it) return;
    it.falhou = false; it.erro = '';
    L.enfileirar(it).then(recarregarFila).then(function () { render(); sincronizar(); });
  }
  function apagarEnvio(op, b) {
    if (b.dataset.certeza !== '1') { b.dataset.certeza = '1'; b.textContent = 'Toque de novo para apagar'; return; }
    L.tirarDaFila(op).then(recarregarFila).then(function () { toast('Envio apagado'); render(); });
  }

  // ---------------- eventos do celular ----------------
  window.addEventListener('online', function () { S.online = true; sincronizar(); });
  window.addEventListener('offline', function () { S.online = false; desenharEstado(); if (S.view === 'inicio') render(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(); });
  setInterval(function () { if (!document.hidden) sincronizar(); }, 120000);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.instalar = e; if (S.view === 'inicio') render(); });

  if ('serviceWorker' in navigator) {
    var tinhaControle = !!navigator.serviceWorker.controller, recarregou = false;
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!tinhaControle || recarregou || VIEWS_FORM[S.view]) return;   // não recarrega no meio de um formulário
      recarregou = true; location.reload();
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.tipo === 'fila-enviada') recarregarFila().then(function () { sincronizar(); });
    });
  }

  iniciar();
})();
