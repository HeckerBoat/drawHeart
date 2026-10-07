# Draw Heart

A dynamic 3D heart particle animation website built with Flask + Three.js (WebGL). Deploy to any server and share the link with friends.

The heart geometry is generated in code with `THREE.Shape` + `ExtrudeGeometry`, and thousands of particles are sampled from the heart surface via `MeshSurfaceSampler`. Particles pulse with the heartbeat rhythm, drift naturally with Simplex noise, and the whole scene auto-rotates with `OrbitControls`.

## Features

- **True 3D particle heart** — particles sampled from a real 3D heart mesh surface (not a 2D parametric curve)
- **Heartbeat rhythm** — double-bump heartbeat curve makes the heart pulse naturally
- **Simplex noise drift** — particles wiggle organically on the heart surface
- **Auto-rotation & orbit controls** — the heart rotates automatically; drag to rotate, scroll to zoom
- **Mouse interaction** — move the mouse to scatter small hearts; click for a burst
- **3D art text** — the text is rendered as an extruded 3D art font centered in the heart, pulses gently with the heartbeat and rotates together with the heart
- **Customizable** — color, particle count, beat speed, rotation speed, text and more, all saved to SQLite
- **Persistent config** — settings are stored in SQLite and restored on reload
- **Shareable read-only links** — generate a unique `/s/<token>` URL; friends cannot edit any parameters, and the page content follows the main page config in real time
- **Deployable** — pure Python backend, runs on any VPS

## Tech Stack

- Backend: Flask + SQLModel + SQLite
- Frontend: Three.js 0.160 (WebGL) + vanilla JavaScript (ES modules via import map)
- Python 3.12, managed by `uv`

## Quick Start

```bash
# 1. Install dependencies (use uv)
uv pip install -r requirements.txt

# 2. Run the app
uv run python app.py

# 3. Open in browser
# http://localhost:5000
```

## Deploy to a Server

```bash
# Using gunicorn (Linux/macOS)
gunicorn -w 4 -b 0.0.0.0:8000 app:app

# Then access via http://<your-server-ip>:8000
```

For Windows servers, use `waitress`:

```bash
uv pip install waitress
waitress-serve --listen=0.0.0.0:8000 app:app
```

## Configuration

All visual parameters can be tuned live in the web UI (top-right panel) and are persisted to `db/config.db`:

| Parameter | Description |
|-----------|-------------|
| `particle_count` | Number of particles forming the heart |
| `particle_size` | Particle radius |
| `beat_speed` | Heartbeat speed multiplier |
| `spread_ratio` | Overall heart scale |
| `heart_color` | Heart particle color (HEX) |
| `background_color` | Background color (HEX) |
| `show_text` | Whether to display 3D art text in the center of the heart |
| `text_content` | The text to display |
| `text_color` | Text color (HEX) |
| `depth_3d` | Enable 3D rotating heart |
| `rotation_speed` | 3D rotation speed (rad/s) |

## Share a Read-Only Link

Click **生成分享链接** in the control panel. The backend creates a unique token, stores it in the `ShareLink` table, and returns a URL like `http://<host>/s/<token>`. The shared page is read-only (control panel hidden, no parameters can be modified), and its content **follows the main page config in real time** — text and other parameters edited on the main page are reflected on the shared page automatically (polled every 3 seconds).

| Endpoint | Description |
|----------|-------------|
| `POST /api/share` | Generate a share link (token only; content follows live config) |
| `GET /s/<token>` | Read-only shared page (404 if token does not exist) |
| `GET /api/share/<token>/config` | Read the live config for the shared page |

## Project Layout

See [architecture.md](architecture.md) for the full file-by-file description.

## License

MIT — feel free to use, modify, and share.
