const COUNTER_ID = 109847441;

export function initYandexMetrika() {
  if (window.__ymLandingInitialized || typeof window.ym !== 'function') return;

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

  window.ym(COUNTER_ID, 'hit', location.href, {
    title: document.title,
    referer: document.referrer,
  });

  window.__ymLandingInitialized = true;
}
