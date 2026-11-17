// The web Hub origin the fixture runners give the terminal Hub by default (render.ts, dev.ts, the page gate), so a
// hand-off draws its Open / QR / link form as under a real host. A fixed, reserved name (RFC 2606 `.test`): never a
// real host, never read from the environment. `--no-web-origin` (render, dev) or a case's `webOrigin: null` (the page
// gate's `-no-origin` cases) draws the form a host with no web origin gets (the path form).
export const FIXTURE_WEB_ORIGIN = 'https://hub.example.test';
