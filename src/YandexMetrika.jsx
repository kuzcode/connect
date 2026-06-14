import { useEffect } from 'react';

const COUNTER_ID = 109847441;

function YandexMetrika() {
  useEffect(() => {
    if (window.__ymInitialized) return;

    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (let j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`, 'ym');

    window.ym(COUNTER_ID, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });

    window.__ymInitialized = true;
  }, []);

  return (
    <noscript>
      <div>
        <img
          src={`https://mc.yandex.ru/watch/${COUNTER_ID}`}
          style={{ position: 'absolute', left: '-9999px' }}
          alt=""
        />
      </div>
    </noscript>
  );
}

export default YandexMetrika;
