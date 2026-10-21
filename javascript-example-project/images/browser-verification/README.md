# Browser Verification Screenshot Checklist

Capture these screenshots after the app is deployed.

1. `step-07-app-login-page-port-forward.png`
   What to capture: Browser open to `http://localhost:3000` after `kubectl -n javascript-example port-forward svc/web 3000:3000` is running.

2. `step-08-app-after-login-port-forward.png`
   What to capture: Browser after logging in with username `admin` and password `password` through `http://localhost:3000`.

3. `step-09-app-login-page-ingress.png`
   What to capture: Browser open to `http://localhost` through ingress.

4. `step-10-app-after-login-ingress.png`
   What to capture: Browser after logging in through `http://localhost`.

If your machine does not route localhost to ingress directly, use this fallback for screenshots 3 and 4:

`kubectl -n ingress-nginx port-forward service/ingress-nginx-controller 8080:80`

Then capture using `http://localhost:8080`.

Tips:

- Use the same browser window size for all screenshots.
- Keep the address bar visible so students can see the URL.
- Blur any unrelated tabs, bookmarks, or personal information if needed.
- Prefer PNG format for readable UI text.
