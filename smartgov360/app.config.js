// Completa o app.json com o que nao pode ficar no repositorio: a chave do
// Google Maps para Android (Maps SDK for Android). Defina GOOGLE_MAPS_ANDROID_KEY
// no ambiente (ou no EAS: `eas env:create`) antes de gerar o build Android.
// No iOS o mapa usa o Apple Maps e nao precisa de chave.
module.exports = ({ config }) => {
  const chave = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (!chave) return config;
  return {
    ...config,
    android: {
      ...config.android,
      config: { ...(config.android?.config || {}), googleMaps: { apiKey: chave } }
    }
  };
};
