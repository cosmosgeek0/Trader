# Access

- Only `ui.service` runs as `trader-ui` and can access `/var/lib/trader-ui/logins.json`; the internet-facing news and network collectors run as `trader-data` with separate state directories.
- Run the UI only as `trader-ui` through `ui.service`. Its only writable persistent files are `/var/lib/trader-ui/logins.json`, `/var/lib/trader-news-control/enabled`, and the money-law files `rules.json` and `rules.log` in `/var/lib/trader-rules`; never put login data inside the public `ui/` directory.
- Cloudflare reaches the UI only through `/run/trader-ui-socket/ui.sock`; never restore a TCP listener. The `cloudflared` user belongs to the `trader-ui` group only to open that socket.
- The UI process must remain unable to read `secret-id.txt` or the trading Python files and unable to reach EC2 instance metadata or Binance. Do not weaken the boundaries in `ui.service`.
- Keep every Devices row, show 20 per numbered page, log out only the selected device, and reuse its row after it signs in again. Do not replace device logout with broad Cloudflare logout.
