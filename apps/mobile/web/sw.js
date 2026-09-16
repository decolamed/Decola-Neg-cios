/**
 * O Service Worker — a única parte do Decola que roda com o aplicativo fechado.
 *
 * É ELE quem recebe o aviso e o mostra na barra de notificações do aparelho.
 * Nada do React está vivo nesse momento: a aba pode não existir, o navegador
 * pode estar fechado. Por isso este arquivo é JavaScript solto, sem importar
 * nada do resto do projeto — ele é carregado pelo navegador por conta própria.
 *
 * ELE NÃO FAZ CACHE, de propósito. Um Service Worker que serve arquivos
 * guardados é a forma mais fácil de deixar um lojista preso numa versão velha
 * do aplicativo sem que ninguém entenda por quê — e o ganho seria abrir meio
 * segundo mais rápido. Aqui ele tem uma função só: notificação.
 *
 * ESTE ARQUIVO É COPIADO PARA A EXPORTAÇÃO por `scripts/finalizar-web.mjs`. Ele
 * precisa ficar na raiz de `/app/`, porque o escopo de um Service Worker é a
 * pasta dele: em `/app/algum/lugar/sw.js` ele não valeria para `/app/`.
 */

// Assume o controle sem esperar a próxima abertura. Sem isto, a primeira
// inscrição feita numa aba só passaria a funcionar depois de fechá-la.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  /**
   * O QUE FAZER QUANDO O AVISO VEM VAZIO OU ILEGÍVEL.
   *
   * Acontece: navegador manda um "push de teste", ou o corpo não decifra. Em
   * nenhum navegador é permitido receber um push e NÃO mostrar nada — quem faz
   * isso perde a permissão de push. Então há um texto de reserva, genérico e
   * honesto, em vez de um silêncio que custaria o recurso inteiro.
   */
  let aviso = { titulo: 'Decola Negócios', mensagem: 'Você tem uma novidade.', caminho: '/app/notificacoes' };
  try {
    if (evento.data) aviso = { ...aviso, ...evento.data.json() };
  } catch (e) {
    // Corpo não-JSON: fica o texto de reserva.
  }

  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.mensagem,
      icon: '/app/icone-192.png',
      badge: '/app/icone-192.png',
      // Vibra no Android. Dois toques curtos: chama atenção sem parecer ligação.
      vibrate: [120, 60, 120],
      data: { caminho: aviso.caminho },
      /**
       * `renotify` com uma tag fixa faria cada aviso substituir o anterior.
       * Aqui cada um tem a sua tag, porque dois pedidos que entram juntos são
       * duas coisas para resolver — e o segundo não pode apagar o primeiro.
       */
      tag: aviso.caminho + ':' + Date.now(),
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const caminho = (evento.notification.data && evento.notification.data.caminho) || '/app/';

  /**
   * REAPROVEITA A ABA ABERTA, se houver.
   *
   * Abrir uma janela nova a cada toque deixa o lojista com seis abas do Decola
   * no fim do dia. Se já existe uma, ela é trazida para a frente e navegada.
   */
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if (aba.url.includes('/app') && 'focus' in aba) {
          aba.navigate(caminho).catch(() => undefined);
          return aba.focus();
        }
      }
      return self.clients.openWindow(caminho);
    }),
  );
});
