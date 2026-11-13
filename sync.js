/* Oficina · banco local, fila de envios e conversa com a planilha.
   Usado pela página e pelo service worker (envio em segundo plano no Android). */
(function (g) {
  var NOME_BANCO = 'oficina', VERSAO_BANCO = 1;
  var bancoPromessa = null;

  function banco() {
    if (bancoPromessa) return bancoPromessa;
    bancoPromessa = new Promise(function (ok, falha) {
      var req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'op' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { bancoPromessa = null; falha(req.error); };
    });
    return bancoPromessa;
  }

  function tx(loja, modo, fn) {
    return banco().then(function (db) {
      return new Promise(function (ok, falha) {
        var t = db.transaction(loja, modo), s = t.objectStore(loja), res;
        var r = fn(s);
        if (r && 'onsuccess' in r) r.onsuccess = function () { res = r.result; };
        t.oncomplete = function () { ok(res); };
        t.onerror = function () { falha(t.error); };
        t.onabort = function () { falha(t.error); };
      });
    });
  }

  var Local = {
    ler: function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); },
    gravar: function (k, v) { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); },
    apagar: function (k) { return tx('kv', 'readwrite', function (s) { return s.delete(k); }); },
    fila: function () {
      return tx('fila', 'readonly', function (s) { return s.getAll(); }).then(function (l) {
        return (l || []).sort(function (a, b) { return a.criadoEm - b.criadoEm || (a.seq || 0) - (b.seq || 0); });
      });
    },
    enfileirar: function (item) { return tx('fila', 'readwrite', function (s) { return s.put(item); }); },
    tirarDaFila: function (op) { return tx('fila', 'readwrite', function (s) { return s.delete(op); }); },
    limparTudo: function () {
      return tx('kv', 'readwrite', function (s) { return s.clear(); }).then(function () { return tx('fila', 'readwrite', function (s) { return s.clear(); }); });
    }
  };

  function novoCodigo() {
    if (g.crypto && g.crypto.randomUUID) return g.crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Erro de rede (sem internet) é diferente de erro devolvido pela planilha
  function ErroRede(msg) { this.message = msg || 'Sem conexão'; this.rede = true; }
  function ErroServidor(msg, sessao) { this.message = msg; this.sessao = !!sessao; }

  function chamar(acao, args, token, op) {
    var url = g.OFICINA_API;
    if (!url) return Promise.reject(new ErroServidor('O endereço da planilha ainda não foi configurado no app.'));
    var corpo = JSON.stringify({ acao: acao, args: args || [], token: token || '', op: op || '' });
    var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var limite = setTimeout(function () { if (controle) controle.abort(); }, 60000);
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo, redirect: 'follow', signal: controle ? controle.signal : undefined })
      .then(function (r) {
        clearTimeout(limite);
        if (!r.ok) throw new ErroRede('A planilha não respondeu (' + r.status + ')');
        return r.text().then(function (t) {
          var j;
          try { j = JSON.parse(t); } catch (e) { throw new ErroRede('Resposta inesperada da planilha'); }
          if (!j.ok) throw new ErroServidor(j.erro || 'Erro na planilha', j.sessao);
          return j.r;
        });
      }, function () { clearTimeout(limite); throw new ErroRede(); });
  }

  // Envia a fila na ordem. Para no primeiro erro de rede; erro da planilha vai para "falhas" e a fila segue.
  var enviando = null;
  function enviarFila() {
    if (enviando) return enviando;
    enviando = Local.ler('token').then(function (token) {
      if (!token) return { enviados: 0, parou: 'sem-login' };
      return Local.fila().then(function (itens) {
        var enviados = 0, falhas = 0;
        var passo = function (i) {
          if (i >= itens.length) return { enviados: enviados, falhas: falhas };
          var it = itens[i];
          if (it.falhou) return passo(i + 1);
          return chamar(it.acao, it.args, token, it.op).then(function (res) {
            enviados++;
            return Local.tirarDaFila(it.op).then(function () {
              return Local.ler('resultados').then(function (r) {
                r = r || {}; r[it.op] = { em: Date.now(), res: res && res.id ? { id: res.id } : (res && res.numero ? { numero: res.numero } : true) };
                return Local.gravar('resultados', r);
              });
            }).then(function () { return passo(i + 1); });
          }, function (e) {
            if (e.rede) return { enviados: enviados, falhas: falhas, parou: 'rede' };
            if (e.sessao) return { enviados: enviados, falhas: falhas, parou: 'sessao', erro: e.message };
            falhas++;
            it.falhou = true; it.erro = e.message; it.tentativas = (it.tentativas || 0) + 1;
            return Local.enfileirar(it).then(function () { return passo(i + 1); });
          });
        };
        return passo(0);
      });
    }).then(function (r) { enviando = null; return r; }, function (e) { enviando = null; throw e; });
    return enviando;
  }

  // Envia a fila e baixa tudo de novo da planilha
  function sincronizar() {
    return enviarFila().then(function (r) {
      if (r.parou === 'rede') throw new ErroRede();
      if (r.parou === 'sessao') throw new ErroServidor(r.erro || 'Entre de novo.', true);
      if (r.parou === 'sem-login') return r;
      return Local.ler('token').then(function (token) {
        return chamar('sincronizar', [], token).then(function (snap) {
          snap.recebidoEm = Date.now();
          return Local.gravar('snap', snap).then(function () { r.snap = snap; return r; });
        });
      });
    });
  }

  g.Oficina = { Local: Local, chamar: chamar, enviarFila: enviarFila, sincronizar: sincronizar, novoCodigo: novoCodigo, ErroRede: ErroRede, ErroServidor: ErroServidor };
})(typeof self !== 'undefined' ? self : this);
