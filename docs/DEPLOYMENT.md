# Guía de despliegue

## Arquitectura

```
Internet ──▶ [Caddy :80/:443]  (opcional, perfil `tls`: HTTPS automático)
                 │
                 ▼
          [frontend · nginx :8080]  sirve la SPA y reenvía /api y /socket.io
                 │
                 ▼
          [backend · Node :4000]  ──▶  MongoDB Atlas (o contenedor `mongo` en dev/staging)
```

- Una sola imagen de frontend sirve para todos los entornos: el navegador llama al mismo origen y nginx reenvía al backend (por eso `VITE_API_URL` va vacío).
- El backend no se publica al exterior; solo nginx habla con él dentro de la red `internal`.
- Los contenedores corren sin root; el backend con sistema de archivos de solo lectura, sin capacidades de Linux y con límite de memoria.

## Variables de entorno

Se definen en `.env` (plantilla: `.env.example`). El backend las **valida al arrancar** y se niega a iniciar si falta alguna o es insegura.

| Variable | Obligatoria | Por defecto | Descripción |
| --- | --- | --- | --- |
| `MONGODB_URI` | Sí | — | Cadena de conexión (`mongodb://` o `mongodb+srv://`). |
| `JWT_SECRET` | Sí | — | ≥ 32 caracteres en producción; se rechazan valores de ejemplo. `openssl rand -base64 48` |
| `CORS_ORIGIN` | Recomendada | `http://localhost:8080` | Origen(es) del frontend, separados por coma. Aplica a CORS y WebSocket. |
| `JWT_EXPIRES_IN` | No | `8h` | Duración de la sesión. |
| `APP_TIMEZONE` | No | `America/Bogota` | Zona IANA para reportes y programación de horarios. |
| `AUDIT_RETENTION_DAYS` | No | `365` | Días que se conserva el registro de actividad (índice TTL). |
| `TRUST_PROXY` | No | `1` (compose) | Proxies delante del backend. Con nginx = 1; define la IP real en auditoría y límites. |
| `API_RATE_LIMIT_MAX` | No | `1000` | Solicitudes por IP cada 15 min a `/api`. |
| `AUTH_RATE_LIMIT_MAX` | No | `20` | Intentos de login fallidos por IP cada 15 min; registros por IP por hora. |
| `HTTP_PORT` / `FRONTEND_BIND` | No | `8080` / `0.0.0.0` | Puerto y dirección donde se publica nginx. Usa `127.0.0.1` con HTTPS (Caddy). |
| `DOMAIN` | Solo perfil `tls` | `localhost` | Dominio para el certificado automático. |
| `IMAGE_PREFIX` / `IMAGE_TAG` | No | `club-torneos` / `latest` | Dónde están las imágenes (`ghcr.io/<owner>/<repo>`) y qué versión ejecutar. |

Los límites de intentos viven en memoria del proceso: con varias réplicas del backend habría que moverlos a un almacén compartido (p. ej. Redis).

## 1. MongoDB Atlas

1. Crea un clúster (el nivel gratuito M0 sirve para empezar; para producción usa M10+ con copias de seguridad continuas).
2. **Database Access** → crea un usuario con rol `readWrite` solo sobre la base `club_torneos` (no uses un usuario administrador).
3. **Network Access** → permite únicamente la IP pública de tu servidor (no `0.0.0.0/0`).
4. **Connect → Drivers** → copia la cadena `mongodb+srv://…` y pon el nombre de la base antes del `?`: `…mongodb.net/club_torneos?retryWrites=true&w=majority`. Si la clave tiene caracteres especiales, codifícala (`@` → `%40`).
5. Las colecciones e índices (únicos, TTL de auditoría) se crean solos en el primer arranque.

## 2. Primer despliegue (servidor con Docker)

```bash
git clone <tu-repo> club-torneos && cd club-torneos
cp .env.example .env && nano .env        # MONGODB_URI, JWT_SECRET, CORS_ORIGIN…
docker compose up -d --build             # construye localmente
docker compose ps                        # backend y frontend deben quedar "healthy"
curl -fsS http://127.0.0.1:8080/healthz  # ok
```

Con HTTPS automático (dominio apuntando al servidor, puertos 80 y 443 abiertos):

```bash
# en .env: FRONTEND_BIND=127.0.0.1  y  DOMAIN=torneos.tu-club.com
docker compose --profile tls up -d
```

Sin Atlas (desarrollo o staging): `docker compose --profile local-db up -d` con `MONGODB_URI=mongodb://mongo:27017/club_torneos`.

### Crear el primer administrador

```bash
docker compose run --rm \
  -e ADMIN_EMAIL=admin@tu-club.com -e ADMIN_NAME="Administrador" -e ADMIN_PASSWORD='una-clave-larga-de-12+' \
  backend node dist/scripts/createAdmin.js
```

Es idempotente: si el correo ya existe no modifica nada. Después, el Admin crea al resto de usuarios con rol desde `POST /api/users`. Cambia o descarta esa contraseña de inmediato.

## 3. CI/CD con GitHub Actions

`ci.yml` (en cada push y pull request):

1. **backend**: typecheck, pruebas unitarias y de integración (MongoDB en memoria).
2. **frontend**: typecheck y build.
3. **docker**: valida `docker-compose.yml` y construye ambas imágenes (sin publicar).
4. **publish** (solo push a `main` o tags `v*`): publica en GHCR `ghcr.io/<owner>/<repo>/backend` y `/frontend` con los tags `latest`, `sha-<corto>` y la versión semántica (`1.2.0`, `1.2`) cuando el tag es `vX.Y.Z`.

`deploy.yml` (manual, `workflow_dispatch`): entra por SSH al servidor, hace `docker compose pull` + `up -d` con el tag indicado y comprueba `/healthz`; si no responde, muestra los logs y falla.

Configuración única en GitHub:

| Dónde | Nombre | Valor |
| --- | --- | --- |
| Secrets | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` | Servidor, usuario con acceso a Docker y clave privada SSH (dedicada al despliegue). |
| Variables | `DEPLOY_PATH` | Carpeta del repo en el servidor (donde está `.env`). |
| Settings → Environments | `production` | Opcional: exige aprobación manual antes de desplegar. |

En el servidor, `.env` debe llevar `IMAGE_PREFIX=ghcr.io/<owner>/<repo>` (en minúsculas) para que `pull` use las imágenes publicadas. El workflow inicia sesión en GHCR con un token temporal; el paquete debe estar vinculado al repositorio.

**Publicar una versión:** `git tag v1.0.0 && git push origin v1.0.0` → Actions → *Deploy* → `image_tag: 1.0.0`.
**Revertir:** vuelve a ejecutar *Deploy* con el tag anterior (por ejemplo `sha-abc1234`).

Dependabot (`.github/dependabot.yml`) abre PRs semanales para npm, imágenes base de Docker y acciones.

## 4. Operación

```bash
docker compose logs -f backend      # logs (rotan a 10 MB × 3)
docker compose ps                   # estado y salud
docker compose restart backend      # el backend cierra conexiones de forma ordenada al recibir SIGTERM
```

- **Salud:** `/health` (proceso vivo) y `/health/ready` (base de datos conectada; es el que usa Docker).
- **Respaldos:** los datos viven en Atlas; activa *Continuous Cloud Backup* (M10+) o programa `mongodump`. El registro de actividad se purga solo según `AUDIT_RETENTION_DAYS`.
- **Actualizaciones:** `git pull && docker compose up -d --build` (o el workflow *Deploy*).

## 5. Lista de verificación de seguridad

- [ ] `JWT_SECRET` aleatorio de ≥ 32 caracteres, distinto en cada entorno.
- [ ] Usuario de Atlas con `readWrite` solo sobre `club_torneos` y acceso restringido por IP.
- [ ] `.env` fuera de git (ya está en `.gitignore`) y con permisos `600` en el servidor.
- [ ] HTTPS activo (perfil `tls` o un proxy/balanceador propio) y `FRONTEND_BIND=127.0.0.1` cuando hay un proxy delante.
- [ ] `CORS_ORIGIN` con el dominio real, sin `*`.
- [ ] Contraseña inicial del Admin cambiada o descartada.
- [ ] Clave SSH de despliegue dedicada y `production` con aprobación manual.
- [ ] Firewall: solo 22 (idealmente restringido), 80 y 443 abiertos.
